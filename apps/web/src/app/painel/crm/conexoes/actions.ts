'use server';

import { getEnv, whatsappWebhookUrl } from '@lps/config';
import { setConnection, updateContact } from '@lps/db';
import { getEvolutionAdmin, type EvolutionAdmin } from '@lps/integrations';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { authedDb } from '@/lib/auth';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const NOT_CONFIGURED = 'Configure EVOLUTION_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE no .env.';

async function withAdmin<T extends object>(fn: (admin: EvolutionAdmin, db: Awaited<ReturnType<typeof authedDb>>) => Promise<T>): Promise<Result<T>> {
  try {
    const db = await authedDb();
    const admin = getEvolutionAdmin();
    if (!admin) return { ok: false, error: NOT_CONFIGURED };
    const out = await fn(admin, db);
    revalidatePath('/painel', 'layout');
    return { ok: true, ...out };
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, error: err instanceof Error ? err.message : 'Algo deu errado. Tente de novo.' };
  }
}

/** Lê o estado real na Evolution e grava em whatsapp_connection (o menu e o CRM leem dali). */
async function sync(admin: EvolutionAdmin, db: Awaited<ReturnType<typeof authedDb>>) {
  const instance = await admin.fetchInstance();
  await setConnection(db, {
    state: instance?.state ?? 'desconectado',
    phone: instance?.phone ?? null,
    profileName: instance?.profileName ?? null,
    profilePicUrl: instance?.profilePicUrl ?? null,
    instance: admin.instanceName,
  }, new Date());
  return instance;
}

export async function syncConnectionAction() {
  return withAdmin(async (admin, db) => ({ state: (await sync(admin, db))?.state ?? 'desconectado' }));
}

/** Cria a instância (se faltar), registra o webhook e devolve o QR. */
export async function startConnectionAction(phone?: string) {
  return withAdmin(async (admin, db) => {
    let instance = await admin.fetchInstance();
    if (!instance) {
      await admin.createInstance();
      instance = await admin.fetchInstance();
    }
    const url = whatsappWebhookUrl(getEnv());
    if (url) await admin.setWebhook(url);
    if (instance?.state === 'conectado') {
      await sync(admin, db);
      return { qr: null, pairingCode: null, connected: true };
    }
    const { qr, pairingCode } = await admin.connect(phone?.trim() || undefined);
    await setConnection(db, { state: 'conectando', instance: admin.instanceName }, new Date());
    return { qr, pairingCode, connected: false };
  });
}

/** Só o QR novo (ele expira a cada ~40 s). Conectado, volta `connected: true`. */
export async function refreshQrAction() {
  return withAdmin(async (admin, db) => {
    const state = await admin.connectionState().catch(() => 'desconectado' as const);
    if (state === 'conectado') {
      await sync(admin, db);
      return { qr: null, pairingCode: null, connected: true };
    }
    const { qr, pairingCode } = await admin.connect();
    return { qr, pairingCode, connected: false };
  });
}

export async function registerWebhookAction() {
  return withAdmin(async (admin) => {
    const url = whatsappWebhookUrl(getEnv());
    if (!url) throw new Error('Configure WHATSAPP_WEBHOOK_SECRET no .env.');
    await admin.setWebhook(url);
    return {};
  });
}

export async function disconnectAction() {
  return withAdmin(async (admin, db) => {
    await admin.logout();
    await setConnection(db, { state: 'desconectado', phone: null, profileName: null, profilePicUrl: null }, new Date());
    return {};
  });
}

export async function restartAction() {
  return withAdmin(async (admin, db) => {
    await admin.restart();
    await sync(admin, db);
    return {};
  });
}

const AVATAR_TTL_MS = 3 * 24 * 3600_000;
const AVATAR_BATCH = 15;

/**
 * Atualiza as fotos dos contatos que nunca foram conferidos ou que passaram de 3 dias.
 * O CRM chama com os ids que estão na tela; sem conexão, não faz nada.
 */
export async function refreshAvatarsAction(contactIds: string[]): Promise<{ updated: number }> {
  try {
    const db = await authedDb();
    const admin = getEvolutionAdmin();
    if (!admin || !contactIds.length) return { updated: 0 };
    const { data: conn } = await db.from('whatsapp_connection').select('state').eq('id', 1).maybeSingle();
    if (conn?.state !== 'conectado') return { updated: 0 };
    const cutoff = new Date(Date.now() - AVATAR_TTL_MS).toISOString();
    const { data } = await db
      .from('contacts')
      .select('id, phone_e164, avatar_url')
      .in('id', contactIds.slice(0, 200))
      .or(`avatar_checked_at.is.null,avatar_checked_at.lt.${cutoff}`)
      .not('phone_e164', 'like', '5500%') // exemplos (pnpm crm:demo)
      .limit(AVATAR_BATCH);
    const rows = (data ?? []) as { id: string; phone_e164: string; avatar_url: string | null }[];
    let updated = 0;
    await Promise.all(rows.map(async (c) => {
      const url = await admin.profilePictureUrl(c.phone_e164).catch(() => undefined);
      if (url === undefined) return;
      await updateContact(db, c.id, { avatar_url: url, avatar_checked_at: new Date().toISOString() });
      if (url !== c.avatar_url) updated++;
    }));
    return { updated };
  } catch (err) {
    unstable_rethrow(err);
    return { updated: 0 };
  }
}
