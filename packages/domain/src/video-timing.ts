export function buildTimeline(segments: { durationSeconds: number }[], fps: number): { from: number; durationInFrames: number }[] {
  let from = 0;
  return segments.map(({ durationSeconds }) => {
    const durationInFrames = Math.ceil(durationSeconds * fps);
    const item = { from, durationInFrames };
    from += durationInFrames;
    return item;
  });
}

export function checkDuration(seconds: number): 'ok' | 'curto' | 'longo' {
  if (seconds < 60) return 'curto';
  return seconds > 90 ? 'longo' : 'ok';
}
