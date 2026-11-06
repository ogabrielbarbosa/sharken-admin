// Ligue o vídeo de cada fluxo quando o roteiro e as gravações estiverem bons.
// Com o vídeo desligado, o material fica pronto só com a página.
export type VideoFlow = 'sem_site' | 'melhorar_site';

export const VIDEO_ENABLED: Record<VideoFlow, boolean> = {
  sem_site: false,
  melhorar_site: false,
};

// `emenda`: suas gravações com a voz clonada só nos campos. `clone_total`: tudo com a voz clonada.
export const VOICE_MODE: Record<VideoFlow, 'emenda' | 'clone_total'> = {
  sem_site: 'emenda',
  melhorar_site: 'emenda',
};
