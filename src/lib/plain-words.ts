/**
 * Plain-language wording for patients who aren't comfortable with numbers,
 * units or medical terms. Pure functions, safe on server and client.
 */

/** "08:00" -> { icon: '☀️', ar: 'الصبح ٨', en: 'Morning 8:00' }. */
export function friendlyTime(time: string | undefined): { icon: string; ar: string; en: string } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((time || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23) return null;
  let icon = '🌙';
  let partAr = 'بالليل';
  let partEn = 'Night';
  if (h >= 4 && h < 12) {
    icon = '☀️';
    partAr = 'الصبح';
    partEn = 'Morning';
  } else if (h >= 12 && h < 16) {
    icon = '🌤️';
    partAr = 'الظهر';
    partEn = 'Noon';
  } else if (h >= 16 && h < 20) {
    icon = '🌇';
    partAr = 'العصر';
    partEn = 'Evening';
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const clock = min === '00' ? `${h12}` : `${h12}:${min}`;
  return { icon, ar: `${partAr} الساعة ${clock}`, en: `${partEn} ${clock}${min === '00' ? ':00' : ''}` };
}

const AR_TABLETS: Record<number, string> = { 1: 'حبة واحدة', 2: 'حبتين', 3: '٣ حبات', 4: '٤ حبات' };

/** "800 mg (1 tablet)" -> "حبة واحدة"; anything it can't read is returned as-is. */
export function friendlyDose(dose: string | undefined, isAr: boolean): string {
  const raw = (dose || '').trim();
  if (!raw) return '';
  const tab = /(\d+(?:\.\d+)?)\s*(tablet|tablets|tab|caps?|capsules?|قرص|أقراص|حبة|حبات)/i.exec(raw);
  if (tab) {
    const n = Number(tab[1]);
    if (n === 0.5) return isAr ? 'نص حبة' : 'Half a tablet';
    if (Number.isInteger(n) && n >= 1) {
      if (isAr) return AR_TABLETS[n] || `${n} حبات`;
      return n === 1 ? '1 tablet' : `${n} tablets`;
    }
  }
  return raw;
}

/** 1820 mL -> 7 (cups of 250 mL, rounded down, at least 1). */
export function mlToCups(ml: number): number {
  if (!Number.isFinite(ml) || ml <= 0) return 0;
  return Math.max(1, Math.floor(ml / 250));
}
