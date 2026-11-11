import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;
// Chave de usuário (sk-ant-usr…) precisa dizer o workspace em cada chamada.
const getClient = () =>
  (client ??= new Anthropic(
    process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {},
  ));
const model = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

type Effort = 'low' | 'medium' | 'high';

async function request(params: { system: string; user: string; effort: Effort; schema?: object }): Promise<string> {
  const response = await getClient().beta.messages.create({
    model: model(),
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: params.system,
    output_config: {
      effort: params.effort,
      ...(params.schema ? { format: { type: 'json_schema', schema: params.schema } } : {}),
    },
    messages: [{ role: 'user', content: params.user }],
  } as never) as unknown as Anthropic.Beta.BetaMessage;

  if (response.stop_reason === 'refusal') throw new Error('A IA recusou o pedido.');
  if (response.stop_reason === 'max_tokens') throw new Error('A resposta da IA foi cortada.');
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
  if (!text) throw new Error('A IA não devolveu texto.');
  return text;
}

export async function generateJson<T>(params: { system: string; user: string; schema: object; effort?: Effort }): Promise<T> {
  return JSON.parse(await request({ ...params, effort: params.effort ?? 'low' })) as T;
}

export function generateText(params: { system: string; user: string; effort?: Effort }): Promise<string> {
  return request({ ...params, effort: params.effort ?? 'low' });
}
