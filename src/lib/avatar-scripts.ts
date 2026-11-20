/**
 * What the talking avatar says, in simple Egyptian Arabic. Each function
 * returns short parts: each part is spoken and shown on screen one at a time.
 * Pure functions, so they are tested without a phone.
 */
import type { AdherenceLog, CoachingTip, PatientLabRecord, PatientMedication, LabTestValues } from './types';
import { friendlyDose, friendlyTime, mlToCups } from './plain-words';
import { dialysisDayInfo } from '../components/patient/PatientTodayCard';

const DAYS_AR = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export interface LabTestDef {
  key: keyof LabTestValues;
  nameAr: string;
  refMin: number;
  refMax: number;
}

function medTimes(m: PatientMedication): string[] {
  if (Array.isArray(m.scheduleTimes) && m.scheduleTimes.length) return m.scheduleTimes;
  return m.scheduleTime ? [m.scheduleTime] : [];
}

function minutesOf(t: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

function isMarked(logs: AdherenceLog[], medId: string, t: string): boolean {
  return logs.some((l) => l.data && typeof l.data === 'object' && l.data.medicationId === medId && (!l.data.scheduleTime || l.data.scheduleTime === t));
}

function joinAr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('، ')} و${items[items.length - 1]}`;
}

function medName(m: PatientMedication): string {
  return m.nameAr || m.name;
}

export interface TodayInput {
  firstName?: string;
  schedule?: string;
  now: Date;
  /** minutes since midnight (local) */
  nowMinutes: number;
  meds: PatientMedication[];
  /** today's medicine logs, undone taps already removed */
  todayLogs: AdherenceLog[];
  waterMl: number;
  waterLimitMl: number;
}

export function todayScript(i: TodayInput): string[] {
  const parts: string[] = [];
  parts.push(i.firstName ? `أهلاً يا ${i.firstName}.` : 'أهلاً بيك.');

  const d = dialysisDayInfo(i.schedule, i.now);
  if (d.today) parts.push('النهارده عندك جلسة غسيل. ما تتأخرش عن معادك، وكمّل الجلسة لآخرها.');
  else if (d.nextWeekday !== null) parts.push(`النهارده يوم راحة. جلستك الجاية ${d.inDays === 1 ? 'بكرة' : `يوم ${DAYS_AR[d.nextWeekday]}`}.`);

  const slots: { t: string; meds: PatientMedication[] }[] = [];
  for (const m of i.meds) for (const t of medTimes(m)) {
    const s = slots.find((x) => x.t === t);
    if (s) s.meds.push(m);
    else slots.push({ t, meds: [m] });
  }
  slots.sort((a, b) => minutesOf(a.t) - minutesOf(b.t));
  if (slots.length) {
    const open = slots.map((s) => ({ ...s, meds: s.meds.filter((m) => !isMarked(i.todayLogs, m.id, s.t)) })).filter((s) => s.meds.length);
    const next = open.find((s) => minutesOf(s.t) >= i.nowMinutes);
    const missed = open.filter((s) => minutesOf(s.t) < i.nowMinutes).reduce((n, s) => n + s.meds.length, 0);
    if (open.length === 0) parts.push('أخدت كل أدوية النهارده. برافو عليك!');
    else {
      if (missed > 0) parts.push(missed === 1 ? 'فيه دوا فات معاده ولسه ما سجلتش إنك أخدته.' : `فيه ${missed} أدوية فات معادها ولسه ما سجلتش إنك أخدتها.`);
      if (next) parts.push(`الدوا الجاي: ${joinAr(next.meds.map(medName))}، ${friendlyTime(next.t)?.ar || next.t}.`);
    }
  }

  const limit = mlToCups(i.waterLimitMl);
  const cups = mlToCups(i.waterMl);
  if (limit > 0) {
    if (cups >= limit) parts.push(`شربت ${cups} أكواب، وده الحد بتاعك. ما تشربش تاني النهارده.`);
    else if (limit - cups === 1) parts.push(`شربت ${cups} من ${limit} أكواب. فاضلك كوباية واحدة بس.`);
    else parts.push(`شربت ${cups} من ${limit} أكواب. فاضلك ${limit - cups} أكواب.`);
  }
  return parts;
}

export function medsScript(meds: PatientMedication[]): string[] {
  if (!meds.length) return ['مفيش أدوية متسجلة ليك في التطبيق لسه. اطلب من دكتورك يسجلها.'];
  const parts = [meds.length === 1 ? 'عندك دوا واحد.' : `عندك ${meds.length} أدوية.`];
  for (const m of meds) {
    const times = medTimes(m).map((t) => friendlyTime(t)?.ar || t);
    const bits = [medName(m), friendlyDose(m.dose, true), times.length ? joinAr(times) : ''].filter(Boolean);
    const note = (m.instructionsAr || '').trim();
    parts.push(`${bits.join('، ')}.${note ? ` ${note.replace(/[.。]$/, '')}.` : ''}`);
  }
  return parts;
}

function spokenDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  if (!m) return ymd;
  return `${Number(m[3])} ${MONTHS_AR[Number(m[2]) - 1]}`;
}

function spokenNumber(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

export function labsScript(latest: PatientLabRecord | null | undefined, tests: LabTestDef[], approvedAdvice: Record<string, string>): string[] {
  if (!latest || !latest.values) return ['مفيش تحاليل متسجلة ليك لسه.'];
  const parts = [`دي آخر تحاليل ليك، بتاريخ ${spokenDate(latest.testDate)}.`];
  const good: string[] = [];
  let count = 0;
  for (const t of tests) {
    const v = latest.values[t.key];
    if (v === undefined || v === null || Number.isNaN(Number(v))) continue;
    count++;
    const val = Number(v);
    if (val > t.refMax || val < t.refMin) {
      const dir = val > t.refMax ? 'high' : 'low';
      const advice = approvedAdvice[`${t.key}:${dir}`];
      parts.push(`${t.nameAr}: ${spokenNumber(val)}، ${dir === 'high' ? 'أعلى' : 'أقل'} من الطبيعي.${advice ? ` ${advice}` : ''}`);
    } else {
      good.push(t.nameAr);
    }
  }
  if (count === 0) return ['مفيش تحاليل متسجلة ليك لسه.'];
  if (good.length) parts.push(good.length === count ? 'كل تحاليلك كويسة. برافو عليك!' : `وده كويس: ${joinAr(good)}.`);
  parts.push('دكتورك هيتابع معاك النتايج دي.');
  return parts;
}

/** Core messages for when no tips were added by the team. */
const CORE_TIPS: string[] = [
  'جلسة الغسيل هي اللي بتنضف دمك. ما تفوّتش ولا جلسة، وكمّلها لآخر وقتها.',
  'خد أدويتك في معادها كل يوم، حتى لو حاسس إنك كويس.',
  'التزم بكمية المية المحددة ليك، لأن المية الزيادة بتتعب القلب وبتعمل نهجان.',
  'قلل الملح والأكل المحفوظ، وخلي بالك من الجبن والمياه الغازية.',
];

export function tipScript(tips: CoachingTip[], index: number): string[] {
  const active = tips.filter((t) => t && t.isActive !== false && (t.titleAr || t.contentAr));
  if (!active.length) return [CORE_TIPS[Math.abs(index) % CORE_TIPS.length]];
  const t = active[Math.abs(index) % active.length];
  return [t.titleAr ? `${t.titleAr}.` : '', (t.contentAr || '').trim()].filter(Boolean);
}
