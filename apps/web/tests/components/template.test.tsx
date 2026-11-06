import { buildSiteContent, type Lead, type PageCopy } from '@lps/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteTemplate } from '@/components/template/site-template';
import { allFixtures, completeLead, noReviewsLead, specialCharsLead } from '../../../../packages/domain/tests/fixtures/leads';

afterEach(cleanup);

const copy: PageCopy = {
  headline: 'Cuidado para o seu pet', subheadline: 'Em Campinas', about: 'Sobre nós',
  services: [{ name: 'Banho e tosa', description: null }], cta: 'Chamar no WhatsApp',
};

const content = (lead: Lead, photos = [{ url: 'https://img/1.jpg', stock: false }]) => buildSiteContent(lead, copy, photos);

describe('SiteTemplate', () => {
  it.each(allFixtures.map((l) => [l.id, l] as const))('renderiza a fixture %s', (_id, lead) => {
    render(<SiteTemplate content={content(lead)} commercialName="Sharken" showVideo={false} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('sempre mostra o aviso de modelo com o nome comercial', () => {
    render(<SiteTemplate content={content(completeLead)} commercialName="Sharken" showVideo={false} />);
    expect(screen.getByText('Modelo preparado por Sharken. Ainda não publicado')).toBeTruthy();
  });

  it('aponta o botão para o WhatsApp do negócio', () => {
    render(<SiteTemplate content={content(completeLead)} commercialName="Sharken" showVideo={false} />);
    const links = screen.getAllByRole('link', { name: 'Chamar no WhatsApp' }) as HTMLAnchorElement[];
    expect(links[0].href).toBe('https://wa.me/5519987654321');
  });

  it('esconde a seção de avaliações sem avaliações', () => {
    render(<SiteTemplate content={content(noReviewsLead)} commercialName="Sharken" showVideo={false} />);
    expect(screen.queryByRole('heading', { name: 'Avaliações' })).toBeNull();
  });

  it('marca a imagem de banco como ilustrativa', () => {
    render(<SiteTemplate content={content(completeLead, [{ url: 'https://img/s.jpg', stock: true }])} commercialName="Sharken" showVideo={false} />);
    expect(screen.getByText('Imagem ilustrativa')).toBeTruthy();
  });

  it('mostra o vídeo só quando pedido', () => {
    const withVideo = { ...content(completeLead), videoUrl: 'https://v/x.mp4' };
    const { container, rerender } = render(<SiteTemplate content={withVideo} commercialName="Sharken" showVideo />);
    expect(container.querySelector('video')).not.toBeNull();
    rerender(<SiteTemplate content={withVideo} commercialName="Sharken" showVideo={false} />);
    expect(container.querySelector('video')).toBeNull();
  });

  it('trata o nome com caracteres especiais como texto', () => {
    const { container } = render(<SiteTemplate content={content(specialCharsLead)} commercialName="Sharken" showVideo={false} />);
    expect(container.querySelector('Centro')).toBeNull();
    expect(container.textContent).toContain('Pão & Café');
  });
});
