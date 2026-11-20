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

export function isUndoLog(log: AdherenceLog | null | undefined): boolean {
  return Boolean(log && log.data && typeof log.data === 'object' && typeof log.data.undoes === 'string');
}

/** Logs as the patient and staff should see them: undone taps removed. */
export function resolveAdherenceLogs<T extends AdherenceLog>(logs: T[]): T[] {
  if (!Array.isArray(logs)) return [];
  const cancelled = new Set<string>();
  for (const l of logs) if (isUndoLog(l)) cancelled.add(l.data.undoes as string);
  if (cancelled.size === 0) return logs;
  return logs.filter((l) => l && !isUndoLog(l) && !cancelled.has(l.id));
}

/** The record that cancels `original`. */
export function buildUndoLog(original: AdherenceLog, now: Date = new Date()): Omit<AdherenceLog, 'id'> {
  return {
    patientId: original.patientId,
    type: original.type,
    status: original.status,
    loggedAt: now.toISOString(),
    data: { undoes: original.id },
  };
}
