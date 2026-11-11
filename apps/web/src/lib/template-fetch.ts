export type TemplateResult = { kind: 'html'; body: string; status: number } | { kind: 'missing' } | { kind: 'error' };

/** Busca a página do template. Qualquer falha (rede, tempo, status fora de 200 e 404) vira 'error', nunca vaza ao visitante. */
export async function fetchTemplateHtml(
  url: URL,
  cookie: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<TemplateResult> {
  try {
    const res = await fetchImpl(url, { headers: { cookie }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    // Proteção da Vercel responde com redirecionamento para a página de login: nunca seguir.
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return { kind: 'error' };
    if (res.status === 404) return { kind: 'missing' };
    if (!res.ok) return { kind: 'error' };
    return { kind: 'html', body: await res.text(), status: res.status };
  } catch {
    return { kind: 'error' };
  }
}
