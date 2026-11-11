import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_BYTES, checkVideoUpload, formatDuration } from '../src/video-upload';

describe('checkVideoUpload', () => {
  it('aceita MP4, MOV e WebM em qualquer caixa', () => {
    expect(checkVideoUpload('video.MOV', 1000)).toEqual({ ok: true, ext: 'mov' });
    expect(checkVideoUpload('a.b.mp4', 1000)).toEqual({ ok: true, ext: 'mp4' });
    expect(checkVideoUpload('x.webm', 1000)).toEqual({ ok: true, ext: 'webm' });
  });
  it('recusa outro formato', () => {
    expect(checkVideoUpload('x.avi', 1000)).toMatchObject({ ok: false });
    expect(checkVideoUpload('semextensao', 1000)).toMatchObject({ ok: false });
  });
  it('recusa vazio e acima de 500 MB', () => {
    expect(checkVideoUpload('x.mp4', 0)).toMatchObject({ ok: false });
    expect(checkVideoUpload('x.mp4', MAX_VIDEO_BYTES + 1)).toMatchObject({ ok: false, reason: expect.stringContaining('500 MB') });
    expect(checkVideoUpload('x.mp4', MAX_VIDEO_BYTES)).toMatchObject({ ok: true });
  });
});

describe('formatDuration', () => {
  it('mostra minutos e segundos', () => {
    expect(formatDuration(68)).toBe('1:08');
    expect(formatDuration(9.4)).toBe('0:09');
    expect(formatDuration(600)).toBe('10:00');
  });
});
