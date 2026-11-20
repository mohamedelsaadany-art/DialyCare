/**
 * Daily phone alerts for patients: medicine times, a follow-up for a missed
 * dose, a midday water check, an after-session check, an evening summary,
 * one coaching tip and new lab results.
 *
 * Rules that keep patients from blocking the app:
 *  - nothing between 23:00 and 07:00 (Cairo),
 *  - at most DAILY_CAP alerts a day per patient,
 *  - at most one alert per patient per run (no bursts),
 *  - each alert only once a day, never for a dose already marked,
 *  - patients who have not opened the app for a week only get medicine
 *    alerts and lab results.
 *
 * Pure logic: the cron route loads data, calls planPatientAlerts and sends.
 */
import type { UnifiedCloudDatabase, Patient, PatientMedication, CoachingTip } from './types';
import { getCairoDate, scheduleIncludesWeekday } from './dialysis-day';
import { friendlyTime, mlToCups } from './plain-words';
import { resolveAdherenceLogs } from './adherence-undo';

export const QUIET_START_HOUR = 23;
export const QUIET_END_HOUR = 7;
export const DAILY_CAP = 6;
export const INACTIVE_AFTER_DAYS = 7;

export type AlertKind = 'med' | 'med-followup' | 'lab' | 'water' | 'session' | 'summary' | 'tip';

export interface PlannedAlert {
  patientId: string;
  key: string;
  kind: AlertKind;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  tag: string;
  ttlSeconds: number;
}

export interface AlertState {
  ymd: string;
  /** alert key -> ISO time it was sent (today only) */
  sent: Record<string, string>;
  /** patientId -> alerts sent today */
  counts: Record<string, number>;
  /** lab results already announced (or present before alerts started) */
  notifiedLabIds: string[];
  labsBaselined?: boolean;
  /** first day open-tracking existed; "inactive" only applies a week after */
  trackingSince?: string;
  /** ymd -> alerts sent that day (last 14 days) */
  sentByDay?: Record<string, number>;
  /** ymd -> alerts sent that day by kind (last 14 days) */
  sentByKind?: Record<string, Partial<Record<AlertKind, number>>>;
}

export function emptyAlertState(ymd: string): AlertState {
  return { ymd, sent: {}, counts: {}, notifiedLabIds: [], labsBaselined: false, trackingSince: ymd, sentByDay: {}, sentByKind: {} };
}

/** Cairo date plus minutes since midnight. */
export function cairoClock(now: Date): { ymd: string; weekday: number; minutes: number } {
  const c = getCairoDate(now);
  const m = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', minute: '2-digit' }).format(now),
    10
  );
  return { ymd: c.ymd, weekday: c.weekday, minutes: c.hour * 60 + (Number.isFinite(m) ? m : 0) };
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function cairoYmdOf(value: Date | string | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : getCairoDate(d).ymd;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function medTimes(med: PatientMedication): string[] {
  if (Array.isArray(med.scheduleTimes) && med.scheduleTimes.length > 0) return med.scheduleTimes;
  return med.scheduleTime ? [med.scheduleTime] : [];
}

/** Same water limit the patient home page shows (critical limit, by dry weight). */
export function dailyWaterLimitMl(p: Patient): number {
  const w = typeof p.dryWeightKg === 'number' && p.dryWeightKg > 0 ? p.dryWeightKg : 70;
  return (w * 13 * 4) / 2;
}

const ORDER: AlertKind[] = ['med', 'med-followup', 'lab', 'water', 'session', 'summary', 'tip'];

export interface PlanInput {
  db: Pick<UnifiedCloudDatabase, 'patients' | 'medications' | 'adherenceLogs' | 'fluidLogs' | 'labResults' | 'coachingTips'>;
  now: Date;
  state: AlertState;
  /** patients with at least one phone registered for alerts */
  reachablePatientIds: Set<string>;
  /** patients who opened the app in the last INACTIVE_AFTER_DAYS days */
  recentlyActiveIds: Set<string>;
}

export function planPatientAlerts({ db, now, state: prev, reachablePatientIds, recentlyActiveIds }: PlanInput): {
  alerts: PlannedAlert[];
  state: AlertState;
} {
  const clock = cairoClock(now);
  const state: AlertState =
    prev && prev.ymd === clock.ymd
      ? { ...prev, sent: { ...prev.sent }, counts: { ...prev.counts }, notifiedLabIds: [...(prev.notifiedLabIds || [])] }
      : {
          ...emptyAlertState(clock.ymd),
          notifiedLabIds: [...(prev?.notifiedLabIds || [])],
          labsBaselined: prev?.labsBaselined ?? false,
          trackingSince: prev?.trackingSince || clock.ymd,
          sentByDay: { ...(prev?.sentByDay || {}) },
          sentByKind: { ...(prev?.sentByKind || {}) },
        };

  const labs = Array.isArray(db.labResults) ? db.labResults : [];
  // First run: everything already in the system counts as announced.
  if (!state.labsBaselined) {
    state.notifiedLabIds = labs.map((l) => l.id);
    state.labsBaselined = true;
  }

  const hour = Math.floor(clock.minutes / 60);
  if (hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR) return { alerts: [], state };

  const trackingOldEnough = daysBetween(state.trackingSince || clock.ymd, clock.ymd) >= INACTIVE_AFTER_DAYS;
  const meds = (db.medications || []).filter((m) => m && m.isActive !== false);
  const logs = resolveAdherenceLogs(db.adherenceLogs || []);
  const fluid = db.fluidLogs || [];
  const tips = (db.coachingTips || []).filter((t: CoachingTip) => t && t.isActive !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const dayIndex = Math.floor(Date.parse(`${clock.ymd}T00:00:00Z`) / 86400000);

  const alerts: PlannedAlert[] = [];

  (db.patients || []).forEach((p, patientIndex) => {
    if (!p?.id || !reachablePatientIds.has(p.id)) return;
    if ((state.counts[p.id] || 0) >= DAILY_CAP) return;
    const inactive = trackingOldEnough && !recentlyActiveIds.has(p.id);

    const candidates: PlannedAlert[] = [];
    const add = (a: Omit<PlannedAlert, 'patientId'>) => {
      if (state.sent[a.key]) return;
      candidates.push({ ...a, patientId: p.id });
    };

    // ---- medicines, grouped by time ----
    const myMeds = meds.filter((m) => m.patientId === p.id);
    const todaysLogs = logs.filter((l) => l?.patientId === p.id && cairoYmdOf(l.loggedAt) === clock.ymd);
    const isMarked = (med: PatientMedication, t: string) =>
      todaysLogs.some(
        (l) =>
          l.data && typeof l.data === 'object' && l.data.medicationId === med.id && (!l.data.scheduleTime || l.data.scheduleTime === t)
      );
    const byTime = new Map<string, PatientMedication[]>();
    for (const m of myMeds) for (const t of medTimes(m)) byTime.set(t, [...(byTime.get(t) || []), m]);

    let dosesTotal = 0;
    let dosesMarked = 0;
    for (const [t, group] of byTime) {
      const tm = toMinutes(t);
      dosesTotal += group.length;
      const open = group.filter((m) => !isMarked(m, t));
      dosesMarked += group.length - open.length;
      if (tm === null || open.length === 0) continue;
      const ft = friendlyTime(t);
      const namesAr = open.map((m) => m.nameAr || m.name).join('، ');
      const namesEn = open.map((m) => m.name).join(', ');
      const firstKey = `med:${p.id}:${clock.ymd}:${t}`;
      if (clock.minutes >= tm && clock.minutes < tm + 120) {
        add({
          key: firstKey,
          kind: 'med',
          titleAr: `💊 وقت الدواء — ${ft ? ft.ar : t}`,
          titleEn: `💊 Medicine time — ${ft ? ft.en : t}`,
          bodyAr: `${namesAr}. اضغط «أخذته» بعد ما تاخده.`,
          bodyEn: `${namesEn}. Tap “I took it” once taken.`,
          tag: `med-${t}`,
          ttlSeconds: 2 * 60 * 60,
        });
      }
      const firstAt = state.sent[firstKey] ? Date.parse(state.sent[firstKey]) : NaN;
      if (
        !inactive &&
        Number.isFinite(firstAt) &&
        now.getTime() - firstAt >= 50 * 60 * 1000 &&
        clock.minutes < tm + 240
      ) {
        add({
          key: `medfu:${p.id}:${clock.ymd}:${t}`,
          kind: 'med-followup',
          titleAr: '💊 لسه ما سجلتش دواك',
          titleEn: '💊 Medicine not marked yet',
          bodyAr: `${namesAr} — لو أخدته اضغط «أخذته».`,
          bodyEn: `${namesEn} — if you took it, tap “I took it”.`,
          tag: `med-${t}`,
          ttlSeconds: 2 * 60 * 60,
        });
      }
    }

    // ---- new lab results ----
    for (const lab of labs) {
      if (lab.patientId !== p.id || state.notifiedLabIds.includes(lab.id) || lab.recordedBy === p.id) continue;
      add({
        key: `lab:${lab.id}`,
        kind: 'lab',
        titleAr: '🧪 نتيجة تحاليل جديدة',
        titleEn: '🧪 New lab results',
        bodyAr: 'الفريق الطبي أضاف نتيجة تحاليلك. افتح «ملفي الطبي».',
        bodyEn: 'Your care team added lab results. Open “My medical file”.',
        tag: 'lab',
        ttlSeconds: 24 * 60 * 60,
      });
    }

    if (!inactive) {
      // ---- midday water check ----
      if (clock.minutes >= 13 * 60 && clock.minutes < 17 * 60) {
        const drankMl = fluid
          .filter((f) => f?.patientId === p.id && cairoYmdOf(f.loggedAt) === clock.ymd)
          .reduce((s, f) => s + (Number(f.amountMl) || 0), 0);
        const limitCups = mlToCups(dailyWaterLimitMl(p));
        const cups = mlToCups(drankMl);
        add({
          key: `water:${p.id}:${clock.ymd}`,
          kind: 'water',
          titleAr: '💧 شربت كام كوباية النهارده؟',
          titleEn: '💧 How many cups today?',
          bodyAr: drankMl > 0 ? `مسجّل ${cups} من ${limitCups} أكواب. سجّل أي كوباية جديدة.` : `حدّك ${limitCups} أكواب في اليوم. سجّل اللي شربته بضغطة.`,
          bodyEn: drankMl > 0 ? `${cups} of ${limitCups} cups logged. Add any new cup.` : `Your limit is ${limitCups} cups a day. Log what you drank.`,
          tag: 'water',
          ttlSeconds: 3 * 60 * 60,
        });
      }

      // ---- after a dialysis session ----
      if (scheduleIncludesWeekday(p.dialysisSchedule, clock.weekday) && clock.minutes >= 17 * 60 && clock.minutes < 21 * 60) {
        add({
          key: `session:${p.id}:${clock.ymd}`,
          kind: 'session',
          titleAr: '🩺 إزاي كانت جلستك النهارده؟',
          titleEn: '🩺 How was your session today?',
          bodyAr: 'اتمنى تكون بخير. لو حاسس بأي تعب كلّم المركز.',
          bodyEn: 'We hope you feel well. Call the center if anything feels wrong.',
          tag: 'session',
          ttlSeconds: 4 * 60 * 60,
        });
      }

      // ---- evening summary ----
      if (dosesTotal > 0 && clock.minutes >= 20 * 60 && clock.minutes < 23 * 60) {
        const all = dosesMarked >= dosesTotal;
        add({
          key: `summary:${p.id}:${clock.ymd}`,
          kind: 'summary',
          titleAr: all ? '🌟 أخدت كل أدويتك النهارده!' : `🌙 سجّلت ${dosesMarked} من ${dosesTotal} أدوية النهارده`,
          titleEn: all ? '🌟 All medicines taken today!' : `🌙 ${dosesMarked} of ${dosesTotal} medicines marked today`,
          bodyAr: all ? 'برافو عليك، كمّل كده.' : 'لو أخدت الباقي اضغط «أخذته» عليه.',
          bodyEn: all ? 'Well done, keep it up.' : 'If you took the rest, tap “I took it”.',
          tag: 'summary',
          ttlSeconds: 3 * 60 * 60,
        });
      }

      // ---- one coaching tip a day ----
      if (tips.length > 0 && clock.minutes >= 10 * 60 && clock.minutes < 14 * 60) {
        const tip = tips[(dayIndex + patientIndex) % tips.length];
        const short = (s: string) => (s.length > 110 ? `${s.slice(0, 107)}…` : s);
        add({
          key: `tip:${p.id}:${clock.ymd}`,
          kind: 'tip',
          titleAr: `💡 ${tip.titleAr}`,
          titleEn: `💡 ${tip.titleEn}`,
          bodyAr: short(tip.contentAr || ''),
          bodyEn: short(tip.contentEn || ''),
          tag: 'tip',
          ttlSeconds: 6 * 60 * 60,
        });
      }
    }

    if (candidates.length === 0) return;
    candidates.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    alerts.push(candidates[0]);
  });

  return { alerts, state };
}

/** Record that an alert went out. */
export function markAlertSent(state: AlertState, alert: PlannedAlert, now: Date): void {
  state.sent[alert.key] = now.toISOString();
  state.counts[alert.patientId] = (state.counts[alert.patientId] || 0) + 1;
  if (alert.kind === 'lab') state.notifiedLabIds.push(alert.key.slice(4));
  const byDay = (state.sentByDay = { ...(state.sentByDay || {}) });
  byDay[state.ymd] = (byDay[state.ymd] || 0) + 1;
  const byKind = (state.sentByKind = { ...(state.sentByKind || {}) });
  byKind[state.ymd] = { ...(byKind[state.ymd] || {}), [alert.kind]: ((byKind[state.ymd] || {})[alert.kind] || 0) + 1 };
  // keep two weeks of history
  for (const k of Object.keys(byDay).sort().slice(0, -14)) delete byDay[k];
  for (const k of Object.keys(byKind).sort().slice(0, -14)) delete byKind[k];
}
