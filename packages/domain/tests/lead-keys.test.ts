import { describe, expect, it } from 'vitest';
import { instagramHandle, siteDomain } from '../src/lead-keys';

describe('instagramHandle', () => {
  it.each([
    ['https://www.instagram.com/Clinica.Sorriso/?hl=pt', 'clinica.sorriso'],
    ['instagram.com/@dra_ana', 'dra_ana'],
    ['http://instagram.com/odonto.sjc/reels/', 'odonto.sjc'],
    ['https://www.instagram.com/p/C1abc/', null],
    ['https://www.instagram.com/reel/C1abc/', null],
    ['https://www.instagram.com/explore/tags/dentista/', null],
    ['https://facebook.com/clinica', null],
    [null, null],
    ['', null],
  ])('%s → %s', (url, handle) => expect(instagramHandle(url)).toBe(handle));
});

describe('siteDomain', () => {
  it.each([
    ['https://www.Clinica.com.br/contato', 'clinica.com.br'],
    ['clinica.com.br', 'clinica.com.br'],
    ['http://odonto.sjc.br:8080/?x=1', 'odonto.sjc.br'],
    ['https://clinica.wixsite.com/site', 'clinica.wixsite.com'],
    ['https://www.instagram.com/clinica/', null],
    ['https://linktr.ee/clinica', null],
    ['https://wa.me/5512999999999', null],
    ['https://sites.google.com/view/clinica', null],
    ['https://www.doctoralia.com.br/clinicas/x', null],
    ['localhost', null],
    [null, null],
  ])('%s → %s', (url, domain) => expect(siteDomain(url)).toBe(domain));
});
