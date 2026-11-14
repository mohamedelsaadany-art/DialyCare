/**
 * Phone normalisation with Arabic-Indic digits (B5 prep).
 */

import assert from 'node:assert';
import { toAsciiDigits, normalizePhone, isPhoneMatch } from '../phone';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('================================================================');
console.log('RUNNING B5 PREP: PHONE NORMALISATION SUITE');
console.log('================================================================\n');

check('toAsciiDigits converts Arabic-Indic and Persian digits, keeps other text', () => {
  assert.strictEqual(toAsciiDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.strictEqual(toAsciiDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.strictEqual(toAsciiDigits('patient١'), 'patient1');
  assert.strictEqual(toAsciiDigits('abc 123'), 'abc 123');
  assert.strictEqual(toAsciiDigits(''), '');
});

check('normalizePhone: ASCII national number unchanged', () => {
  assert.strictEqual(normalizePhone('01012345678'), '01012345678');
});

check('normalizePhone: Arabic-Indic and Persian digits', () => {
  assert.strictEqual(normalizePhone('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
  assert.strictEqual(normalizePhone('۰۱۰۱۲۳۴۵۶۷۸'), '01012345678');
  assert.strictEqual(normalizePhone('٠١٠1234٥٦٧٨'), '01012345678');
});

check('normalizePhone: strips spaces, dashes, parentheses, plus and bidi marks', () => {
  assert.strictEqual(normalizePhone(' 010-1234 5678 '), '01012345678');
  assert.strictEqual(normalizePhone('(010) 1234-5678'), '01012345678');
  assert.strictEqual(normalizePhone('‏٠١٠١٢٣٤٥٦٧٨‎'), '01012345678');
});

check('normalizePhone: +20 / 0020 / 20 prefixes become national 0', () => {
  assert.strictEqual(normalizePhone('+201012345678'), '01012345678');
  assert.strictEqual(normalizePhone('+20 10 1234 5678'), '01012345678');
  assert.strictEqual(normalizePhone('00201012345678'), '01012345678');
  assert.strictEqual(normalizePhone('201012345678'), '01012345678');
  assert.strictEqual(normalizePhone('+٢٠١٠١٢٣٤٥٦٧٨'), '01012345678');
  assert.strictEqual(normalizePhone('٠٠٢٠١٠١٢٣٤٥٦٧٨'), '01012345678');
});

check('normalizePhone: empty / missing input', () => {
  assert.strictEqual(normalizePhone(''), '');
  assert.strictEqual(normalizePhone(undefined), '');
  assert.strictEqual(normalizePhone(null), '');
  assert.strictEqual(normalizePhone('abc'), '');
});

check('normalizePhone: prefix only stripped at the exact lengths', () => {
  assert.strictEqual(normalizePhone('2012345'), '2012345');
  assert.strictEqual(normalizePhone('0020123'), '0020123');
});

check('isPhoneMatch: Arabic vs ASCII vs international forms match', () => {
  assert.strictEqual(isPhoneMatch('٠١٥٥٥٥٥٥٥٥٥', '01555555555'), true);
  assert.strictEqual(isPhoneMatch('+20 155 555 5555', '٠١٥٥٥٥٥٥٥٥٥'), true);
  assert.strictEqual(isPhoneMatch('01555555555', '01555555556'), false);
  assert.strictEqual(isPhoneMatch('', ''), false);
  assert.strictEqual(isPhoneMatch('abc', 'xyz'), false);
  assert.strictEqual(isPhoneMatch(undefined, '01555555555'), false);
});

console.log(`\nALL ${passed} PHONE NORMALISATION CHECKS PASSED (EXIT 0)`);
