'use client';

import { Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { checkVideoUpload } from '@lps/domain';
import { Button } from '@/components/ui';
import { confirmVideoUploadAction, createVideoUploadUrlAction } from '@/app/painel/batches/[id]/material/actions';

function put(url: string, file: File, onProgress: (percent: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file);
    xhr.send(body);
  });
}

/** O navegador envia o arquivo direto ao Storage; o servidor só assina a URL e confirma. */
export function VideoUploadButton({ leadId, replace, onError }: { leadId: string; replace: boolean; onError: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function upload(file: File) {
    onError(null);
    const check = checkVideoUpload(file.name, file.size);
    if (!check.ok) return onError(check.reason);
    setProgress(0);
    try {
      const prepared = await createVideoUploadUrlAction(leadId, file.name, file.size);
      if (prepared.error || !prepared.signedUrl || !prepared.path) return onError(prepared.error ?? 'Falha ao preparar o envio.');
      if (!(await put(prepared.signedUrl, file, setProgress))) return onError('O envio falhou. Tente de novo.');
      const done = await confirmVideoUploadAction(leadId, prepared.path);
      if (done.error) onError(done.error);
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      <Button variant="outline" disabled={progress !== null} onClick={() => input.current?.click()}>
        {progress !== null ? <><Loader2 className="animate-spin" />{progress}%</> : <><Upload />{replace ? 'Trocar vídeo' : 'Enviar vídeo'}</>}
      </Button>
      <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
    </>
  );
}
