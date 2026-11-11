export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm'] as const;

export type VideoUploadCheck = { ok: true; ext: (typeof VIDEO_EXTENSIONS)[number] } | { ok: false; reason: string };

/** Vídeo gravado enviado pelo Gabriel: MP4, MOV ou WebM, até 500 MB. */
export function checkVideoUpload(fileName: string, size: number): VideoUploadCheck {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  const found = VIDEO_EXTENSIONS.find((e) => e === ext);
  if (!found) return { ok: false, reason: 'Formato não aceito. Envie MP4, MOV ou WebM.' };
  if (size <= 0) return { ok: false, reason: 'O arquivo está vazio.' };
  if (size > MAX_VIDEO_BYTES) return { ok: false, reason: 'Vídeo grande demais. O limite é 500 MB.' };
  return { ok: true, ext: found };
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
