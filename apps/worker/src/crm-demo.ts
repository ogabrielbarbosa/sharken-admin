import './env';
import { createAdminClient, scopeDb } from '@lps/db';

// Conversas de exemplo para ver o CRM funcionando. Os números usam o DDD 00, que não existe,
// e o envio para eles é bloqueado no painel. Remover: pnpm crm:demo --remover
// Outro workspace: pnpm crm:demo --workspace <slug> (padrão: sharken)

const DEMO_PREFIX = '5500';
const slugArg = process.argv.indexOf('--workspace');
const slug = slugArg >= 0 ? process.argv[slugArg + 1] : 'sharken';
const { data: ws } = await createAdminClient().from('workspaces').select('id').eq('slug', slug).maybeSingle();
if (!ws) {
  console.error(`Workspace ${slug} não encontrado.`);
  process.exit(1);
}
const db = scopeDb(createAdminClient(), ws.id as string);

type Line = [direction: 'entrada' | 'saida', minutesAgo: number, body: string, status?: 'enviada' | 'entregue' | 'lida'];
type Demo = { name: string; avatar: number | null; chat: 'aberto' | 'pendente' | 'fechado'; status: string; unread?: number; lines: Line[]; note?: [minutesAgo: number, body: string] };

const H = 60;
const D = 24 * H;

const DEMOS: Demo[] = [
  {
    name: 'Barbearia Dom Corte', avatar: 12, chat: 'pendente', status: 'em_conversa', unread: 2,
    note: [2 * D - 40, 'Dono é o Rafael. Prefere falar à tarde, depois das 14h.'],
    lines: [
      ['saida', 2 * D, 'Oi! Aqui é o Gabriel, da Sharken. Montei uma página de exemplo para a Barbearia Dom Corte. Posso te mandar o link?', 'lida'],
      ['entrada', 2 * D - 30, 'Pode mandar sim'],
      ['saida', 2 * D - 35, 'Aqui está: https://sharken.site/dom-corte. Fica no ar por 24 h.', 'lida'],
      ['entrada', 8, 'Vi a página, ficou muito boa!'],
      ['entrada', 7, 'Quanto fica pra deixar ela no ar de vez?'],
    ],
  },
  {
    name: 'Pet Shop Amigo Fiel', avatar: null, chat: 'pendente', status: 'em_conversa', unread: 1,
    lines: [
      ['saida', 3 * D, 'Olá! Sou o Gabriel, da Sharken. Fiz uma página de exemplo para o Pet Shop Amigo Fiel.', 'lida'],
      ['entrada', 3 * D - 60, 'Oi, quem passou meu número?'],
      ['saida', 3 * D - 65, 'Encontrei no Google Maps de vocês. Se não quiser receber, é só falar que eu paro.', 'lida'],
      ['entrada', 25, 'Tudo bem, me manda mais detalhes amanhã'],
    ],
  },
  {
    name: 'Clínica Sorriso Leve', avatar: 47, chat: 'aberto', status: 'em_conversa',
    lines: [
      ['entrada', 5 * H, 'Bom dia! Vocês fazem site para clínica?'],
      ['saida', 5 * H - 3, 'Bom dia! Fazemos sim. Preparei um exemplo para a Clínica Sorriso Leve, quer ver?', 'lida'],
      ['entrada', 4 * H, 'Quero'],
      ['saida', 12, 'Segue o link: https://sharken.site/sorriso-leve', 'entregue'],
    ],
  },
  {
    name: 'Auto Elétrica Faísca', avatar: 33, chat: 'aberto', status: 'contatado',
    lines: [
      ['saida', 40, 'Oi! Aqui é o Gabriel, da Sharken. Vi que a Auto Elétrica Faísca ainda não tem site e montei uma página de exemplo. Posso te mandar?', 'enviada'],
    ],
  },
  {
    name: 'Doceria Açúcar Mascavo', avatar: 5, chat: 'aberto', status: 'em_conversa', unread: 0,
    lines: [
      ['saida', D + 3 * H, 'Oi, tudo bem? Fiz uma página de exemplo para a Doceria Açúcar Mascavo.', 'lida'],
      ['entrada', D + 2 * H, 'Que legal! Dá pra colocar o cardápio?'],
      ['saida', D + 2 * H - 10, 'Dá sim, consigo colocar o cardápio com fotos e o botão de pedido no WhatsApp.', 'lida'],
    ],
  },
  {
    name: 'Studio Pilates Equilíbrio', avatar: null, chat: 'aberto', status: 'novo', lines: [],
  },
  {
    name: 'Mercadinho Bom Preço', avatar: 60, chat: 'fechado', status: 'fechado',
    lines: [
      ['entrada', 4 * D, 'Fechado então, pode fazer'],
      ['saida', 4 * D - 20, 'Combinado! Te mando o contrato agora pelo ZapSign.', 'lida'],
      ['entrada', 4 * D - 30, 'Assinado 👍'],
    ],
  },
  {
    name: 'Oficina do Juca', avatar: 15, chat: 'fechado', status: 'perdido',
    lines: [
      ['saida', 6 * D, 'Oi! Aqui é o Gabriel, da Sharken. Montei uma página de exemplo para a Oficina do Juca.', 'lida'],
      ['entrada', 6 * D - 120, 'Não tenho interesse, obrigado'],
      ['saida', 6 * D - 122, 'Sem problemas, não vou mais te mandar mensagem. Obrigado!', 'lida'],
    ],
  },
];

async function remove() {
  const { data, error } = await db.from('contacts').delete().like('phone_e164', `${DEMO_PREFIX}%`).select('id');
  if (error) throw new Error(error.message);
  console.log(`Removidos ${data?.length ?? 0} contatos de exemplo.`);
}

async function seed() {
  await remove();
  const now = Date.now();
  for (const [i, d] of DEMOS.entries()) {
    const phone = `${DEMO_PREFIX}9${String(10000000 + i).padStart(8, '0')}`;
    const { data: contact, error } = await db.from('contacts').insert({
      name: d.name,
      phone_e164: phone,
      origin: 'manual',
      status: d.status,
      comment: 'Contato de exemplo (pnpm crm:demo).',
      avatar_url: d.avatar ? `https://i.pravatar.cc/160?img=${d.avatar}` : null,
      avatar_checked_at: new Date().toISOString(),
      created_at: new Date(now - 7 * D * 60_000).toISOString(),
    }).select('id').single();
    if (error) throw new Error(error.message);
    for (const [j, [direction, ago, body, status]] of d.lines.entries()) {
      const { error: msgError } = await db.rpc('crm_insert_message', {
        p: {
          contact_id: contact.id,
          direction,
          sent_from: direction === 'saida' ? 'painel' : null,
          body,
          preview: body,
          status: direction === 'entrada' ? 'recebida' : (status ?? 'enviada'),
          external_id: `demo-${contact.id}-${j}`,
          at: new Date(now - ago * 60_000).toISOString(),
        },
      });
      if (msgError) throw new Error(msgError.message);
    }
    if (d.note) {
      const { error: noteError } = await db.from('messages').insert({ contact_id: contact.id, direction: 'nota', body: d.note[1], status: 'recebida', sent_from: 'painel', at: new Date(now - d.note[0] * 60_000).toISOString() });
      if (noteError) throw new Error(noteError.message);
    }
    const { error: upError } = await db.from('contacts').update({ chat_state: d.chat, unread_count: d.unread ?? 0 }).eq('id', contact.id);
    if (upError) throw new Error(upError.message);
  }
  console.log(`Criados ${DEMOS.length} contatos de exemplo (números com DDD 00). Para remover: pnpm crm:demo --remover`);
}

await (process.argv.includes('--remover') ? remove() : seed());
