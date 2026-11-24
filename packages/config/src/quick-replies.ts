// Mensagens rápidas com que um workspace novo começa. Depois disso, cada workspace edita as suas em
// Configurações › Mensagens rápidas (tabela quick_replies); mudar aqui não altera as que já existem.
// Sem preço, prazo ou condição: isso é decidido pelo Gabriel em cada conversa.
export const DEFAULT_QUICK_REPLIES: { shortcut: string; title: string; body: string }[] = [
  { shortcut: 'oi', title: 'Cumprimento', body: 'Oi, $primeiro_nome! Tudo bem? Aqui é o $meu_nome, da $empresa.' },
  { shortcut: 'link', title: 'Link da página', body: 'Aqui está a página que preparei: $link' },
  { shortcut: 'ligar', title: 'Pedir um horário para ligar', body: 'Posso te ligar rapidinho para explicar? Qual o melhor horário para você?' },
  { shortcut: 'obrigado', title: 'Agradecer', body: 'Obrigado pelo retorno, $primeiro_nome! Qualquer dúvida, é só me chamar por aqui.' },
  { shortcut: 'parar', title: 'Confirmar que não vai mais mandar', body: 'Sem problemas, não vou mais te mandar mensagem. Obrigado!' },
];
