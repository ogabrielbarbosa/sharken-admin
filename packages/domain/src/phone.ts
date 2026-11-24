import { findPhoneNumbersInText, parsePhoneNumberFromString, type CountryCode, type PhoneNumber } from 'libphonenumber-js/max';

const mobileDigits = (p: PhoneNumber | undefined): string | null => {
  // Nos EUA e no Canadá não dá para separar celular de fixo pelo número.
  const type = p?.isValid() ? p.getType() : undefined;
  return type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE' ? p!.number.slice(1) : null;
};

/** Celular de qualquer país, em dígitos com o código do país. `country` é o de quem escreveu o número sem código. */
export function toCountryMobile(raw: string | null | undefined, country: string): string | null {
  if (!raw) return null;
  // Com o código escrito (+1...), vale ele. Assim um batch pode ter números de vários países.
  const typed = raw.trim();
  if (typed.startsWith('+')) {
    const abroad = mobileDigits(parsePhoneNumberFromString(typed));
    if (abroad && !abroad.startsWith('55')) return abroad;
  }
  if (country === 'BR') return toMobileE164(raw);
  return mobileDigits(parsePhoneNumberFromString(raw, country as CountryCode));
}

/** Celular de um link do WhatsApp, que sempre traz o código do país. */
export function toWhatsAppLinkMobile(digits: string, country: string): string | null {
  // No Brasil há quem esqueça o 55 no link.
  if (country === 'BR') {
    const br = toMobileE164(digits);
    if (br) return br;
  }
  return mobileDigits(parsePhoneNumberFromString(`+${digits.replace(/\D/g, '')}`)) ?? toCountryMobile(digits, country);
}

/** Celulares escritos num texto, pelo país. Sem país, só os que trazem o código (+1...). */
export function mobilesInText(text: string, country?: string): { raw: string; e164: string }[] {
  return (country ? findPhoneNumbersInText(text, country as CountryCode) : findPhoneNumbersInText(text)).flatMap(({ number, startsAt, endsAt }) => {
    const e164 = mobileDigits(number);
    return e164 ? [{ raw: text.slice(startsAt, endsAt), e164 }] : [];
  });
}

export function toMobileE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length === 13) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[1-9][0-9]9[0-9]{8}$/.test(digits) ? `55${digits}` : null;
}

// Formato canônico: dígitos com o código do país, sem "+" (como os leads e a lista de bloqueio guardam).
// Variantes para achar um contato: com e sem o "+", e com e sem o nono dígito (o WhatsApp às vezes entrega o celular BR sem ele).
export function phoneMatchCandidates(e164: string): string[] {
  const digits = e164.replace(/\D/g, '');
  const variants = [digits];
  if (/^55[1-9][0-9]9[0-9]{8}$/.test(digits)) variants.push(`${digits.slice(0, 4)}${digits.slice(5)}`);
  else if (/^55[1-9][0-9][6-9][0-9]{7}$/.test(digits)) variants.push(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  return variants.flatMap((v) => [v, `+${v}`]);
}
