import { expect, it } from 'vitest';
import { classifyLink } from '../src/website';

it('classifica ausência de link', () => expect(classifyLink(null).status).toBe('sem_link'));
it('guarda o Instagram quando ele é o único link', () => {
  expect(classifyLink('https://instagram.com/petlegal')).toEqual({ status: 'somente_social', instagramUrl: 'https://instagram.com/petlegal' });
});
it('reconhece agregadores e subdomínios', () => {
  expect(classifyLink('https://linktr.ee/petlegal').status).toBe('somente_social');
  expect(classifyLink('https://wa.me/5511987654321').status).toBe('somente_social');
  expect(classifyLink('https://api.whatsapp.com/send?phone=55').status).toBe('somente_social');
  expect(classifyLink('https://www.instagram.com/x').status).toBe('somente_social');
});
it('não confunde domínio parecido com rede social', () => {
  expect(classifyLink('https://meufacebook.com.br').status).toBe('site');
});
it('trata site próprio e URL sem protocolo', () => {
  expect(classifyLink('https://petlegal.com.br')).toEqual({ status: 'site', instagramUrl: null });
  expect(classifyLink('petlegal.com.br').status).toBe('site');
});
