import assert from 'node:assert';
import { planPatientAlerts, markAlertSent, emptyAlertState, DAILY_CAP, type AlertState } from '../patient-alerts';
import { shouldCountOpen, OPEN_GAP_MS } from '../../components/patient/usePatientAppOpen';
import type { UnifiedCloudDatabase } from '../types';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepStrictEqual(a, b, m); n++; };

// Saturday 2026-11-21, Cairo = UTC+2
const at = (hhmm: string) => new Date(`2026-11-21T${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, '0')}:${hhmm.slice(3)}:00Z`);

const db = (extra: Partial<UnifiedCloudDatabase> = {}) => ({
  patients: [
    { id: 'p1', fullName: 'A', fullNameAr: 'أ', dialysisSchedule: 'SMW', dryWeightKg: 70 },
    { id: 'p2', fullName: 'B', fullNameAr: 'ب', dialysisSchedule: 'STT' },
  ],
  medications: [
    { id: 'm1', patientId: 'p1', name: 'Sevelamer', nameAr: 'سيفيلامير', dose: '1 tablet', scheduleTimes: ['08:00', '20:00'] },
    { id: 'm2', patientId: 'p1', name: 'Amlodipine', nameAr: 'أملوديبين', dose: '5 mg', scheduleTime: '08:00' },
  ],
  adherenceLogs: [],
  fluidLogs: [],
  labResults: [],
  coachingTips: [{ id: 't1', category: 'general', titleEn: 'Tip', titleAr: 'نصيحة', contentEn: 'x', contentAr: 'س', order: 1, isActive: true }],
  ...extra,
}) as unknown as UnifiedCloudDatabase;

const reach = new Set(['p1', 'p2']);
const active = new Set(['p1', 'p2']);
const fresh = (): AlertState => ({ ...emptyAlertState('2026-11-21'), labsBaselined: true });

// --- quiet hours ---
eq(planPatientAlerts({ db: db(), now: at('06:30'), state: fresh(), reachablePatientIds: reach, recentlyActiveIds: active }).alerts, [], 'nothing before 7am');
eq(planPatientAlerts({ db: db(), now: at('23:10'), state: fresh(), reachablePatientIds: reach, recentlyActiveIds: active }).alerts, [], 'nothing after 11pm');

// --- medicine at 8:05: one grouped alert for p1 only ---
let r = planPatientAlerts({ db: db(), now: at('08:05'), state: fresh(), reachablePatientIds: reach, recentlyActiveIds: active });
eq(r.alerts.length, 1, 'one alert this run');
eq(r.alerts[0].kind, 'med', 'medicine alert');
ok(r.alerts[0].bodyAr.includes('سيفيلامير') && r.alerts[0].bodyAr.includes('أملوديبين'), 'both 8am medicines in one alert');
ok(r.alerts[0].titleAr.includes('الصبح'), 'plain-words time');

// --- not reachable -> nothing ---
eq(planPatientAlerts({ db: db(), now: at('08:05'), state: fresh(), reachablePatientIds: new Set(), recentlyActiveIds: active }).alerts, [], 'no phone, no alert');

// --- already marked -> no medicine alert ---
const taken = db({
  adherenceLogs: [
    { id: 'l1', patientId: 'p1', type: 'ttt', status: 'done', loggedAt: at('07:55').toISOString(), data: { medicationId: 'm1', scheduleTime: '08:00' } },
    { id: 'l2', patientId: 'p1', type: 'ttt', status: 'done', loggedAt: at('07:56').toISOString(), data: { medicationId: 'm2', scheduleTime: '08:00' } },
  ],
} as Partial<UnifiedCloudDatabase>);
eq(planPatientAlerts({ db: taken, now: at('08:05'), state: fresh(), reachablePatientIds: reach, recentlyActiveIds: active }).alerts, [], 'doses marked -> no alert');

// --- same alert never twice; follow-up after ~an hour ---
const s1 = r.state;
markAlertSent(s1, r.alerts[0], at('08:05'));
eq(planPatientAlerts({ db: db(), now: at('08:30'), state: s1, reachablePatientIds: reach, recentlyActiveIds: active }).alerts, [], 'no repeat, follow-up not yet');
r = planPatientAlerts({ db: db(), now: at('09:00'), state: s1, reachablePatientIds: reach, recentlyActiveIds: active });
eq(r.alerts[0]?.kind, 'med-followup', 'follow-up after 55 minutes');
eq(planPatientAlerts({ db: taken, now: at('09:00'), state: s1, reachablePatientIds: reach, recentlyActiveIds: active }).alerts, [], 'no follow-up once marked');

// --- tip, water, session, summary ---
r = planPatientAlerts({ db: db(), now: at('11:00'), state: fresh(), reachablePatientIds: reach, recentlyActiveIds: active });
eq(r.alerts.map((a) => a.kind).sort(), ['tip', 'tip'], 'one tip each, midday');
r = planPatientAlerts({ db: db(), now: at('13:30'), state: fresh(), reachablePatientIds: reach, recentlyActiveIds: active });
ok(r.alerts.some((a) => a.kind === 'water' && a.bodyAr.includes('7 أكواب')), 'water check uses cups');
r = planPatientAlerts({ db: db({ medications: [] } as Partial<UnifiedCloudDatabase>), now: at('18:00'), state: fresh(), reachablePatientIds: reach, recentlyActiveIds: active });
eq(r.alerts.find((a) => a.patientId === 'p1')?.kind, 'session', 'Saturday is a session day for SMW');
eq(r.alerts.find((a) => a.patientId === 'p2')?.kind, undefined, 'STT has no session on Saturday');
const st = fresh();
st.sent['med:p1:2026-11-21:20:00'] = at('20:00').toISOString();
r = planPatientAlerts({ db: db(), now: at('21:30'), state: st, reachablePatientIds: reach, recentlyActiveIds: active });
eq(r.alerts[0].kind, 'med-followup', 'missed 8pm dose follows up before the summary');
st.sent['medfu:p1:2026-11-21:20:00'] = at('21:30').toISOString();
r = planPatientAlerts({ db: db(), now: at('22:00'), state: st, reachablePatientIds: reach, recentlyActiveIds: active });
ok(r.alerts[0].kind === 'summary' && r.alerts[0].titleAr.includes('0 من 3'), 'evening summary counts doses');

// --- daily cap ---
const capped = fresh();
capped.counts.p1 = DAILY_CAP;
ok(!planPatientAlerts({ db: db(), now: at('08:05'), state: capped, reachablePatientIds: reach, recentlyActiveIds: active }).alerts.some((a) => a.patientId === 'p1'), 'cap reached -> nothing');

// --- inactive for a week: medicines and labs only ---
const old = { ...fresh(), trackingSince: '2026-11-01' };
r = planPatientAlerts({ db: db(), now: at('11:00'), state: old, reachablePatientIds: reach, recentlyActiveIds: new Set() });
eq(r.alerts, [], 'inactive patients get no tips');
r = planPatientAlerts({ db: db(), now: at('08:05'), state: old, reachablePatientIds: reach, recentlyActiveIds: new Set() });
eq(r.alerts[0]?.kind, 'med', 'inactive patients still get medicine alerts');
const newTracking = { ...fresh(), trackingSince: '2026-11-20' };
eq(planPatientAlerts({ db: db(), now: at('11:00'), state: newTracking, reachablePatientIds: reach, recentlyActiveIds: new Set() }).alerts.length, 2, 'first week: nobody is treated as inactive');

// --- labs: existing ones are not announced, new ones are ---
const labDb = db({ labResults: [{ id: 'lab-old', patientId: 'p1', testDate: '2026-11-01', recordedBy: 'doc', values: {} }] } as Partial<UnifiedCloudDatabase>);
r = planPatientAlerts({ db: labDb, now: at('12:00'), state: emptyAlertState('2026-11-21'), reachablePatientIds: reach, recentlyActiveIds: active });
ok(!r.alerts.some((a) => a.kind === 'lab') && r.state.labsBaselined, 'first run: old labs are baseline');
const labDb2 = db({ labResults: [{ id: 'lab-old', patientId: 'p1', testDate: '2026-11-01', recordedBy: 'doc', values: {} }, { id: 'lab-new', patientId: 'p1', testDate: '2026-11-21', recordedBy: 'doc', values: {} }] } as Partial<UnifiedCloudDatabase>);
const r2 = planPatientAlerts({ db: labDb2, now: at('12:00'), state: r.state, reachablePatientIds: reach, recentlyActiveIds: active });
eq(r2.alerts.find((a) => a.patientId === 'p1')?.key, 'lab:lab-new', 'new lab announced, ahead of the tip');
markAlertSent(r2.state, r2.alerts.find((a) => a.patientId === 'p1')!, at('12:00'));
ok(r2.state.notifiedLabIds.includes('lab-new') && r2.state.sentByDay?.['2026-11-21'] === 1, 'lab remembered, day counted');

// --- new day resets what was sent, keeps lab memory and history ---
const next = planPatientAlerts({ db: labDb2, now: new Date('2026-11-22T06:05:00Z'), state: r2.state, reachablePatientIds: reach, recentlyActiveIds: active });
ok(next.state.ymd === '2026-11-22' && Object.keys(next.state.sent).length === 0 && next.state.notifiedLabIds.includes('lab-new') && next.state.sentByDay?.['2026-11-21'] === 1, 'day rollover');

// --- app-open counting ---
eq(shouldCountOpen(null, 1000, false), true, 'first open counts');
eq(shouldCountOpen(1000, 1000 + OPEN_GAP_MS - 1, false), false, 'quick return does not count');
eq(shouldCountOpen(1000, 1000 + OPEN_GAP_MS, false), true, 'return after 5 minutes counts');
eq(shouldCountOpen(1000, 1001, true), true, 'opening from an alert always counts');

console.log(`PATIENT-ALERTS SUITE PASSED: ${n} assertions.`);
