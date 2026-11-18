/** Token colado em Configurações › Apify: tira espaços e quebras de linha. Vazio vira null. */
export function parseApifyToken(raw: string): string | null {
  const token = raw.replace(/\s+/g, '');
  return token || null;
}

/** Na tela só aparecem os últimos 4 caracteres. */
export const maskApifyToken = (token: string) => (token.length >= 8 ? `…${token.slice(-4)}` : '••••');
