import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { COMPOSITION_ID, VIDEO_ENTRY, type ProposalVideoProps } from '@lps/video';

let bundled: Promise<string> | null = null;
const serveUrl = () => (bundled ??= bundle({ entryPoint: VIDEO_ENTRY }));

export async function renderProposal(props: ProposalVideoProps, output: string, onProgress: (percent: number) => void) {
  const url = await serveUrl();
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl: url, id: COMPOSITION_ID, inputProps });
  await renderMedia({
    composition,
    serveUrl: url,
    codec: 'h264',
    outputLocation: output,
    inputProps,
    onProgress: ({ progress }) => onProgress(Math.round(progress * 100)),
  });
}
