import type { Lead, LeadAsset } from '@lps/domain';
import { describe, expect, it } from 'vitest';
import { leadPhotos } from '@/components/pipeline/complete-modal';

describe('leadPhotos', () => {
  it('imagens extraídas usam o link assinado; caminho sem link fica de fora', () => {
    const lead = { instagram_media: [{ kind: 'perfil', url: 'https://r2/ig.jpg' }], photos: ['https://maps/f.jpg'] } as unknown as Lead;
    const assets = [
      { status: 'pronto', extracted_images: ['ws/lead/a.png', 'ws/lead/b.png'] },
      { status: 'extraindo', extracted_images: ['ws/lead/c.png'] },
    ] as unknown as LeadAsset[];
    const links = { 'ws/lead/a.png': 'https://supa/sign/a.png?token=1', 'ws/lead/c.png': 'https://supa/sign/c.png?token=1' };
    expect(leadPhotos(lead, assets, links)).toEqual(['https://r2/ig.jpg', 'https://maps/f.jpg', 'https://supa/sign/a.png?token=1']);
  });
});
