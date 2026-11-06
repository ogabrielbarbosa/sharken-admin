import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, normalize } from 'node:path';

/** Serve os arquivos temporários do vídeo para o Remotion, só na máquina local. */
export async function serveDir(dir: string) {
  const server = createServer((req, res) => {
    const name = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^[/\\.]+/, '');
    const file = join(dir, name);
    try {
      const { size } = statSync(file);
      const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('accept-ranges', 'bytes');
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : size - 1;
        res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'content-length': size });
        createReadStream(file).pipe(res);
      }
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: (name: string) => `http://127.0.0.1:${port}/${name}`, close: () => server.close() };
}
