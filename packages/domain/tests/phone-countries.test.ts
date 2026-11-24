import { expect, it } from 'vitest';
import { phoneFromProfile } from '../src';

it('lê números de vários países pelo código, sem país no batch', () => {
  expect(phoneFromProfile({ businessPhoneNumber: '+1 512 555 0123' }).e164).toBe('15125550123');
  expect(phoneFromProfile({ externalUrl: 'https://wa.me/351912345678' }).e164).toBe('351912345678');
  expect(phoneFromProfile({ biography: 'Reservas: +34 612 34 56 78' }).e164).toBe('34612345678');
  expect(phoneFromProfile({ biography: '(12) 99876-5432' }).e164).toBe('5512998765432');
  expect(phoneFromProfile({ externalUrl: 'https://wa.me/12998765432' }).e164).toBe('5512998765432');
  expect(phoneFromProfile({ biography: '+55 12 99876-5432' }).e164).toBe('5512998765432');
});
