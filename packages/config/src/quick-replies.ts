// Respostas rápidas do CRM: digite "/" no campo de mensagem para abrir a lista.
// `atalho` é o que se digita depois da barra. Variáveis com $ são trocadas pelo valor do contato
// ao inserir: $nome, $primeiro_nome, $telefone, $link, $cidade, $empresa, $meu_nome.
// Sem preço, prazo ou condição: isso é decidido pelo Gabriel em cada conversa.
export type QuickReply = { atalho: string; titulo: string; texto: string };

export const QUICK_REPLIES: QuickReply[] = [
  { atalho: 'oi', titulo: 'Cumprimento', texto: 'Oi, $primeiro_nome! Tudo bem? Aqui é o $meu_nome, da $empresa.' },
  { atalho: 'link', titulo: 'Link da página', texto: 'Aqui está a página que preparei: $link' },
  { atalho: 'ligar', titulo: 'Pedir um horário para ligar', texto: 'Posso te ligar rapidinho para explicar? Qual o melhor horário para você?' },
  { atalho: 'obrigado', titulo: 'Agradecer', texto: 'Obrigado pelo retorno, $primeiro_nome! Qualquer dúvida, é só me chamar por aqui.' },
  { atalho: 'parar', titulo: 'Confirmar que não vai mais mandar', texto: 'Sem problemas, não vou mais te mandar mensagem. Obrigado!' },
];
