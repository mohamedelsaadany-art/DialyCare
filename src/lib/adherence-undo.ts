/**
 * Undoing a tap ("I took it" pressed again).
 *
 * Patients can only ADD records when syncing (they can never change or delete
 * a stored one), so an undo is a new record that points at the record it
 * cancels: data.undoes = <id>. Everyone reads logs through
 * resolveAdherenceLogs, which hides both the cancelled record and the undo
 * record. Stored and synced data always keep both.
 */
import type { AdherenceLog } from './types';

/** Ids an undo record cancels (data.undoes: one id or a list). */
export function undoneIds(log: AdherenceLog | null | undefined): string[] {
  const u = log && log.data && typeof log.data === 'object' ? log.data.undoes : undefined;
  if (typeof u === 'string') return [u];
  return Array.isArray(u) ? u.filter((x): x is string => typeof x === 'string') : [];
}

export function isUndoLog(log: AdherenceLog | null | undefined): boolean {
  return undoneIds(log).length > 0;
}

/** Logs as the patient and staff should see them: undone taps removed. */
export function resolveAdherenceLogs<T extends AdherenceLog>(logs: T[]): T[] {
  if (!Array.isArray(logs)) return [];
  const cancelled = new Set<string>();
  for (const l of logs) for (const id of undoneIds(l)) cancelled.add(id);
  if (cancelled.size === 0) return logs;
  return logs.filter((l) => l && !isUndoLog(l) && !cancelled.has(l.id));
}

/** One record that cancels `originals` (all taps on the same dose). */
export function buildUndoLog(originals: AdherenceLog | AdherenceLog[], now: Date = new Date()): Omit<AdherenceLog, 'id'> {
  const list = Array.isArray(originals) ? originals : [originals];
  const first = list[0];
  return {
    patientId: first.patientId,
    type: first.type,
    status: first.status,
    loggedAt: now.toISOString(),
    data: { undoes: list.length === 1 ? first.id : list.map((l) => l.id) },
  };
}
