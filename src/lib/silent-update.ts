/**
 * Waslity updates itself without asking the patient. Pages are always loaded
 * fresh from the network, so only an app left open in the background can be
 * on an old version. When such an app comes back to the screen after a while
 * and a new version is waiting, it reloads quietly — never while in use.
 */
export const SILENT_RELOAD_AFTER_HIDDEN_MS = 10 * 60 * 1000;

export function shouldSilentlyReload(updateWaiting: boolean, hiddenForMs: number): boolean {
  return updateWaiting && hiddenForMs >= SILENT_RELOAD_AFTER_HIDDEN_MS;
}
