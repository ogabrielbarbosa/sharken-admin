/** Para onde o app volta depois da autorização, do jeito que a pessoa reconhece (ex.: claude.ai). */
export function redirectHost(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.host;
    // Esquema próprio de app (ex.: cursor://): o esquema faz parte de quem recebe.
    return `${url.protocol}//${url.host}`;
  } catch {
    return uri;
  }
}
