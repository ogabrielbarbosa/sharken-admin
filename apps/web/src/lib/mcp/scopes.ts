/**
 * Escopos que o cliente MCP deve pedir ao Supabase Auth. Sem `openid` de propósito: com ele o Supabase tenta
 * emitir um ID token, que exige chave assimétrica, e o nosso assina com HS256 (JWT_SECRET). A troca do código
 * falha com "HS256 is not supported for ID token signing" e o Claude mostra "Não foi possível conectar".
 * Os clientes MCP usam o `scope` do WWW-Authenticate e, sem ele, o `scopes_supported` do recurso.
 */
export const MCP_SCOPES = ['email', 'profile'];
