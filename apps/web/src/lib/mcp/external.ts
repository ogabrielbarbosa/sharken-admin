/** Marca texto de terceiros (legendas, avaliações, mensagens) como conteúdo externo; nenhuma tag consegue escapar. */
export function wrapExternal(text: string): string {
  const escaped = text.replace(/</g, '‹').replace(/>/g, '›');
  return `<conteudo_externo>${escaped}</conteudo_externo>`;
}
