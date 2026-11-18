/**
 * Conteúdo da tela Instruções. Para trocar o vídeo ou os links, edite aqui.
 * Link vazio vira "em breve" na tela.
 */

/** Vídeo do topo. Aceita link do Loom, do YouTube ou de outro player embutível (https). */
export const VIDEO_URL = '';

/** Arquivo da skill, servido de apps/web/public/downloads. */
export const SKILL_ZIP = '/downloads/create-page-sharken.zip';

/**
 * Aplicativo Sharken Loom (gravação dos vídeos). Os instaladores ficam no R2 (media.sharkenapps.com/downloads),
 * grandes demais para o repositório. Nova versão: suba o arquivo lá e troque o link aqui.
 */
export const APP_DOWNLOADS: { label: string; detail: string; href: string; hint: string }[] = [
  {
    label: 'Baixar para Mac',
    detail: 'Apple Silicon (M1 ou mais novo) · 115 MB',
    href: 'https://media.sharkenapps.com/downloads/Sharken-Loom-mac-arm64-0.1.0.zip',
    hint: 'Descompacte e arraste o Sharken Loom para Aplicativos. Se o Mac disser que o app está danificado ou não pode ser aberto, rode no Terminal o comando abaixo e abra de novo.',
  },
  {
    label: 'Baixar para Windows',
    detail: 'Windows 64 bits · 116 MB',
    href: 'https://media.sharkenapps.com/downloads/Sharken-Loom-Setup-0.1.0.exe',
    hint: 'Abra o instalador. Se o Windows mostrar “O Windows protegeu o computador”, clique em Mais informações › Executar assim mesmo.',
  },
];

/** Libera o app no Mac (ele ainda não é assinado pela Apple). */
export const MAC_UNBLOCK = 'xattr -cr "/Applications/Sharken Loom.app"';

/** Converte o link de compartilhamento num endereço que dá para embutir. */
export function embedUrl(url: string): string | null {
  const loom = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  // Outro player (ex.: o Loom da Sharken): usa o link como veio.
  return /^https:\/\//.test(url) ? url : null;
}
