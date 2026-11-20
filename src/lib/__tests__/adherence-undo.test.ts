import assert from 'node:assert';
import { resolveAdherenceLogs, buildUndoLog, isUndoLog } from '../adherence-undo';
import { addAdherenceLog, getAdherenceLogs, getAllAdherenceLogsRaw, undoAdherenceLog } from '../data-store';
import { planPatientAlerts, emptyAlertState } from '../patient-alerts';
import type { AdherenceLog, UnifiedCloudDatabase } from '../types';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepStrictEqual(a, b, m); n++; };
console.warn = () => {};
console.error = () => {};

// --- pure resolver ---
const done: AdherenceLog = { id: 'a', patientId: 'p', type: 'ttt', status: 'done', loggedAt: '2026-11-21T06:00:00Z', data: { medicationId: 'm', scheduleTime: '08:00' } };
const undo = { id: 'u', ...buildUndoLog(done, new Date('2026-11-21T06:01:00Z')) } as AdherenceLog;
ok(isUndoLog(undo) && !isUndoLog(done), 'undo record recognised');
eq(resolveAdherenceLogs([done]), [done], 'nothing undone -> unchanged');
eq(resolveAdherenceLogs([done, undo]), [], 'undone tap and its undo are both hidden');
eq(resolveAdherenceLogs([undo, done]), [], 'order does not matter');
const again = { ...done, id: 'b', loggedAt: '2026-11-21T06:02:00Z' };
eq(resolveAdherenceLogs([done, undo, again]), [again], 'tapping again after undo counts');

// --- through the shared data store (what every screen uses) ---
const PID = 'undo-test-patient';
const first = addAdherenceLog({ patientId: PID, type: 'ttt', status: 'done', loggedAt: new Date().toISOString(), data: { medicationId: 'm1', scheduleTime: '08:00' } });
eq(getAdherenceLogs(PID).map((l) => l.id), [first.id], 'tap shows as taken');
const u = undoAdherenceLog(first.id);
ok(u && u.data.undoes === first.id, 'undo record written');
eq(getAdherenceLogs(PID), [], 'second tap: back to not chosen');
eq(undoAdherenceLog(first.id), null, 'cannot undo twice');
eq(undoAdherenceLog('missing'), null, 'unknown id ignored');

// raw storage still holds both, so the undo reaches the server on sync
const raw = getAllAdherenceLogsRaw();
ok(raw.some((l) => l.id === first.id) && raw.some((l) => l.data?.undoes === first.id), 'raw (synced) list keeps both records');

// switching "took it" -> "not taken"
const t = addAdherenceLog({ patientId: PID, type: 'ttt', status: 'done', loggedAt: new Date().toISOString(), data: { medicationId: 'm1', scheduleTime: '20:00' } });
undoAdherenceLog(t.id);
addAdherenceLog({ patientId: PID, type: 'ttt', status: 'skipped', loggedAt: new Date().toISOString(), data: { medicationId: 'm1', scheduleTime: '20:00' } });
eq(getAdherenceLogs(PID).map((l) => l.status), ['skipped'], 'switching keeps only the new answer');

// --- alert job: an undone dose is not taken ---
const at = new Date('2026-11-21T06:05:00Z'); // 08:05 Cairo
const db = {
  patients: [{ id: 'p1', fullName: 'A', fullNameAr: 'أ', dialysisSchedule: 'SMW' }],
  medications: [{ id: 'm1', patientId: 'p1', name: 'Med', dose: '1 tablet', scheduleTime: '08:00' }],
  adherenceLogs: [
    { id: 'x', patientId: 'p1', type: 'ttt', status: 'done', loggedAt: '2026-11-21T05:58:00Z', data: { medicationId: 'm1', scheduleTime: '08:00' } },
    { id: 'y', patientId: 'p1', type: 'ttt', status: 'done', loggedAt: '2026-11-21T05:59:00Z', data: { undoes: 'x' } },
  ],
  fluidLogs: [],
  labResults: [],
  coachingTips: [],
} as unknown as UnifiedCloudDatabase;
const plan = planPatientAlerts({ db, now: at, state: { ...emptyAlertState('2026-11-21'), labsBaselined: true }, reachablePatientIds: new Set(['p1']), recentlyActiveIds: new Set(['p1']) });
eq(plan.alerts[0]?.kind, 'med', 'undone dose still gets its medicine alert');

console.log(`ADHERENCE-UNDO SUITE PASSED: ${n} assertions.`);
