/**
 * Background polling that backs off while the page is hidden.
 *
 * The cloud sync is bidirectional (it also uploads entries saved on this device),
 * so we never stop it completely:
 * - visible: run every `intervalMs` (unchanged behaviour);
 * - becoming hidden: run once immediately, so entries saved just before the user
 *   switched away are uploaded before the browser puts the tab to sleep;
 * - hidden: run at most every `hiddenIntervalMs` (default 2 min) as a slow retry;
 * - becoming visible again: run once immediately to catch up.
 *
 * `run` is called exactly as before (no change to what a sync does or how errors
 * and 401s are handled). Dependencies are injectable so this is unit-testable in Node.
 */

export interface VisibilityTarget {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface VisibilityPollOptions {
  intervalMs: number;
  hiddenIntervalMs?: number;
  target?: VisibilityTarget;
  now?: () => number;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export const DEFAULT_HIDDEN_INTERVAL_MS = 120_000;

/** Starts polling; returns a stop function that removes the timer and the listener. */
export function startVisibilityAwarePolling(run: () => void, options: VisibilityPollOptions): () => void {
  const {
    intervalMs,
    hiddenIntervalMs = DEFAULT_HIDDEN_INTERVAL_MS,
    target = typeof document !== 'undefined' ? (document as VisibilityTarget) : undefined,
    now = () => Date.now(),
    setIntervalFn = (fn, ms) => setInterval(fn, ms),
    clearIntervalFn = (h) => clearInterval(h as ReturnType<typeof setInterval>),
  } = options;

  let lastRunAt = now();
  const runNow = () => {
    lastRunAt = now();
    run();
  };

  const isHidden = () => target?.visibilityState === 'hidden';

  const handle = setIntervalFn(() => {
    if (isHidden() && now() - lastRunAt < hiddenIntervalMs) return;
    runNow();
  }, intervalMs);

  const onVisibilityChange = () => runNow();
  target?.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    clearIntervalFn(handle);
    target?.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
