import { expect, it } from 'vitest';
import { canEditProfile } from '../src/lib/profile-access';

it('cada um edita o seu; o dono edita só quem é membro', () => {
  const base = { me: 'a', target: 'b', canManage: true, memberIds: ['a', 'b'] };
  expect(canEditProfile({ ...base, target: 'a', canManage: false, memberIds: [] })).toBe(true);
  expect(canEditProfile(base)).toBe(true);
  expect(canEditProfile({ ...base, target: 'z' })).toBe(false);
  expect(canEditProfile({ ...base, canManage: false })).toBe(false);
});
