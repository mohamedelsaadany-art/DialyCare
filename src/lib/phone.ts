/**
 * Phone number normalisation that understands Arabic keyboards.
 *
 * Egyptian phone keyboards often type Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩, U+0660-0669)
 * or Extended Arabic-Indic / Persian digits (۰۱۲۳۴۵۶۷۸۹, U+06F0-06F9). A plain /\D/
 * strip drops those digits entirely, so the same person can fail to log in or can
 * register twice. Everything here is pure (no I/O) so it is safe on client and server.
 */

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/** Converts Arabic-Indic and Extended Arabic-Indic digits to ASCII 0-9; other characters are kept. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code >= EXTENDED_ARABIC_INDIC_ZERO ? EXTENDED_ARABIC_INDIC_ZERO : ARABIC_INDIC_ZERO;
    return String(code - base);
  });
}

/**
 * Normalises a phone number to national Egyptian form with ASCII digits only.
 * - Arabic-Indic / Persian digits become ASCII.
 * - Everything that is not a digit is removed (spaces, dashes, parentheses, '+', bidi marks).
 * - International prefixes become the national '0': +20 / 0020 followed by 10 digits.
 * Same rules as the original data-store normalizePhone, plus the digit conversion.
 */
export function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = toAsciiDigits(phone).replace(/\D/g, '');
  if (digits.startsWith('0020') && digits.length === 14) {
    return '0' + digits.slice(4);
  }
  if (digits.startsWith('20') && digits.length === 12) {
    return '0' + digits.slice(2);
  }
  return digits;
}

/** True when both numbers are non-empty and normalise to the same value. */
export function isPhoneMatch(p1?: string | null, p2?: string | null): boolean {
  const n1 = normalizePhone(p1);
  const n2 = normalizePhone(p2);
  return n1 !== '' && n1 === n2;
}
