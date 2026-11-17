import { AwsClient } from 'aws4fetch';

/** Cloudflare R2 (API do S3). Guarda as imagens do Instagram dos leads num bucket público. */
export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string };

type Source = Record<string, string | undefined>;

export function r2Config(source: Source = process.env): R2Config {
  const pick = (k: string) => source[k]?.trim() || '';
  const config = {
    accountId: pick('R2_ACCOUNT_ID'),
    accessKeyId: pick('R2_ACCESS_KEY_ID'),
    secretAccessKey: pick('R2_SECRET_ACCESS_KEY'),
    bucket: pick('R2_BUCKET'),
    publicUrl: pick('R2_PUBLIC_URL').replace(/\/+$/, ''),
  };
  const missing = Object.entries({ R2_ACCOUNT_ID: config.accountId, R2_ACCESS_KEY_ID: config.accessKeyId, R2_SECRET_ACCESS_KEY: config.secretAccessKey, R2_BUCKET: config.bucket, R2_PUBLIC_URL: config.publicUrl })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Configure ${missing.join(', ')} para salvar imagens no R2.`);
  return config;
}

export function r2ObjectUrl(config: Pick<R2Config, 'accountId' | 'bucket'>, key: string): string {
  return `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export function r2PublicUrl(config: Pick<R2Config, 'publicUrl'>, key: string): string {
  return `${config.publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Envia o arquivo e devolve o link público. Grava por cima se a chave já existir. */
export async function uploadToR2(config: R2Config, key: string, body: ArrayBuffer, contentType: string): Promise<string> {
  const client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, service: 's3', region: 'auto' });
  const res = await client.fetch(r2ObjectUrl(config, key), {
    method: 'PUT',
    body,
    headers: { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' },
  });
  if (!res.ok) throw new Error(`O R2 recusou o envio (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return r2PublicUrl(config, key);
}
