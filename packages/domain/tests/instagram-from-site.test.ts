import { expect, it } from 'vitest';
import { instagramProfileFromLinks } from '../src/website';

it('acha o perfil entre os links da página', () => {
  expect(instagramProfileFromLinks(['https://facebook.com/x', 'https://www.instagram.com/PetLegal/?hl=pt-br']))
    .toBe('https://www.instagram.com/petlegal/');
});
it('aceita link sem protocolo, com @ e com aba do perfil', () => {
  expect(instagramProfileFromLinks(['instagram.com/@pet.legal_'])).toBe('https://www.instagram.com/pet.legal_/');
  expect(instagramProfileFromLinks(['https://instagram.com/petlegal/reels/'])).toBe('https://www.instagram.com/petlegal/');
});
it('ignora post, reels, explore e o próprio Instagram', () => {
  expect(instagramProfileFromLinks([
    'https://www.instagram.com/p/Cx123/',
    'https://www.instagram.com/reel/Cx123/',
    'https://www.instagram.com/explore/tags/pet/',
    'https://www.instagram.com/',
    'https://instagram.com/accounts/login',
  ])).toBeNull();
});
it('pula o que não é perfil e fica com o próximo', () => {
  expect(instagramProfileFromLinks(['https://www.instagram.com/p/Cx/', 'https://l.instagram.com/?u=x', 'https://instagram.com/petlegal'])).toBe('https://www.instagram.com/petlegal/');
});
it('não confunde domínio parecido', () => {
  expect(instagramProfileFromLinks(['https://meuinstagram.com/petlegal'])).toBeNull();
});
it('pula o perfil de quem fez o site', () => {
  expect(instagramProfileFromLinks(['https://instagram.com/raquelwebdesigner', 'https://instagram.com/agenciaxyz', 'https://instagram.com/clinicaboa'])).toBe('https://www.instagram.com/clinicaboa/');
});
