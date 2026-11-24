import { describe, expect, it } from 'vitest';
import { fillVariables, matchesQuickReply, normalizeShortcut, parseQuickReply, unknownVariables } from '../src/quick-replies';

describe('mensagens rápidas', () => {
  it('normaliza o atalho', () => {
    expect(normalizeShortcut('Pedir Horário!')).toBe('pedir-horario');
    expect(normalizeShortcut('/oi')).toBe('oi');
    expect(normalizeShortcut('pedir ', true)).toBe('pedir-');
    expect(normalizeShortcut('a'.repeat(50))).toHaveLength(30);
  });
  it('troca variáveis e mantém as sem valor', () => {
    expect(fillVariables('Oi $nome, $link', [{ key: 'nome', value: 'Ana' }, { key: 'link', value: null }])).toBe('Oi Ana, $link');
  });
  it('aponta variável errada, sem confundir preço', () => {
    expect(unknownVariables('Oi $primeiro_nome, $nomee, R$ 100')).toEqual(['nomee']);
  });
  it('busca sem acento', () => {
    expect(matchesQuickReply({ shortcut: 'x', title: 'Horário' }, 'horario')).toBe(true);
    expect(matchesQuickReply({ shortcut: 'x', title: 'Horário' }, 'preço')).toBe(false);
  });
  it('valida os campos', () => {
    expect(parseQuickReply({ shortcut: '!!', title: 'A', body: 'b' }).ok).toBe(false);
    expect(parseQuickReply({ shortcut: 'a', title: ' ', body: 'b' }).ok).toBe(false);
    expect(parseQuickReply({ shortcut: 'a', title: 'A', body: ' ' }).ok).toBe(false);
    expect(parseQuickReply({ shortcut: 'Olá', title: ' A ', body: ' b ' })).toEqual({ ok: true, value: { shortcut: 'ola', title: 'A', body: 'b' } });
  });
});
