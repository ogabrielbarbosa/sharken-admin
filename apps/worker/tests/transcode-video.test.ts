import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ffmpegArgs } from '../src/jobs/transcode-video';

const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';

describe('ffmpegArgs', () => {
  it('usa H.264, AAC, faststart e limita a 1920 de largura', () => {
    const args = ffmpegArgs('in.mov', 'out.mp4');
    expect(args).toEqual(expect.arrayContaining(['libx264', 'veryfast', '23', 'aac', '+faststart', "scale='min(1920,iw)':-2"]));
    expect(args.slice(-1)).toEqual(['out.mp4']);
  });

  it.skipIf(!existsSync(FFMPEG))('converte um MOV de verdade para MP4 H.264', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lps-ff-test-'));
    try {
      const input = join(dir, 'in.mov');
      const output = join(dir, 'out.mp4');
      execFileSync(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=2560x1440:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', input], { stdio: 'ignore' });
      execFileSync(FFMPEG, ffmpegArgs(input, output), { stdio: 'ignore' });
      const info = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width', '-of', 'csv=p=0', output]).toString().trim();
      expect(info).toBe('h264,1920');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
