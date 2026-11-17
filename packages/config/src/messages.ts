// Mensagens de WhatsApp. [seu nome] vem das Configurações do workspace. Quem envia ainda pode editar cada uma antes de abrir a conversa.
export const MESSAGES = {
  sem_site:
    'Oi, tudo bem? Aqui é o [seu nome], faço sites para negócios locais em [cidade]. Vi a [nome do negócio] no Google e não encontrei um site. Preparei um modelo de página com os dados públicos de vocês: [link]. Se preferir não receber mais mensagens, é só avisar.',
  fora_do_ar:
    'Oi, tudo bem? Aqui é o [seu nome], faço sites para negócios locais em [cidade]. Tentei abrir o site da [nome do negócio] e não consegui, então preparei um modelo de página com os dados públicos de vocês: [link]. Se preferir não receber mais mensagens, é só avisar.',
  melhorar_site:
    'Oi, tudo bem? Aqui é o [seu nome], faço sites para negócios locais em [cidade]. Vi o site da [nome do negócio] e notei um ponto que pode melhorar: [motivo]. Preparei um modelo novo com os dados públicos de vocês: [link]. Se preferir não receber mais mensagens, é só avisar.',
  follow_up:
    'Oi! Aqui é o [seu nome] de novo. Queria saber se vocês conseguiram ver o modelo que preparei com os dados públicos de vocês: [link]. Se não fizer sentido, é só avisar que não mando mais mensagem.',
  contrato: 'Segue o contrato para assinatura: [link]',
  pagamento: 'Segue o link para pagamento de [descrição], no valor de [valor], com vencimento em [data]: [link]',
};

// Palavras que sugerem pedido para parar. Comparadas sem acento e em minúsculas.
export const STOP_WORDS = [
  'parar', 'pare', 'sair', 'remover', 'não quero', 'nao quero', 'não tenho interesse', 'nao tenho interesse',
  'não mande', 'nao mande', 'descadastrar',
];
