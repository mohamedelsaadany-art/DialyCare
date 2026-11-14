/**
 * Visibility-aware polling (U6): fake clock, fake timers, fake document.
 */

import assert from 'node:assert';
import {
  startVisibilityAwarePolling,
  DEFAULT_HIDDEN_INTERVAL_MS,
  type VisibilityTarget,
} from '../visibility-poll';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function setup(intervalMs = 12_000, hiddenIntervalMs?: number) {
  let t = 0;
  let tick: (() => void) | null = null;
  let tickMs = 0;
  let cleared = false;
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: 'visibilitychange', l: () => void) => listeners.add(l),
    removeEventListener: (_: 'visibilitychange', l: () => void) => listeners.delete(l),
  };
  let runs = 0;
  const stop = startVisibilityAwarePolling(() => runs++, {
    intervalMs,
    hiddenIntervalMs,
    target: doc as VisibilityTarget,
    now: () => t,
    setIntervalFn: (fn, ms) => {
      tick = fn;
      tickMs = ms;
      return 1;
    },
    clearIntervalFn: () => {
      cleared = true;
    },
  });
  const advance = (ms: number) => {
    const end = t + ms;
    while (t + tickMs <= end) {
      t += tickMs;
      if (!cleared) tick?.();
    }
    t = end;
  };
  const setVisibility = (v: DocumentVisibilityState) => {
    doc.visibilityState = v;
    for (const l of [...listeners]) l();
  };
  return {
    stop,
    advance,
    setVisibility,
    runs: () => runs,
    listenerCount: () => listeners.size,
    tickMs: () => tickMs,
    cleared: () => cleared,
  };
}

console.log('================================================================');
console.log('RUNNING U6: VISIBILITY-AWARE POLLING SUITE');
console.log('================================================================\n');

check('visible: runs every interval, no immediate run on start', () => {
  const p = setup(12_000);
  assert.strictEqual(p.tickMs(), 12_000);
  assert.strictEqual(p.runs(), 0);
  p.advance(36_000);
  assert.strictEqual(p.runs(), 3);
});

check('becoming hidden runs once immediately (flushes unsynced local entries)', () => {
  const p = setup(12_000);
  p.advance(5_000);
  p.setVisibility('hidden');
  assert.strictEqual(p.runs(), 1);
});

check('hidden: ticks are skipped until the hidden interval has passed', () => {
  const p = setup(12_000);
  p.setVisibility('hidden'); // run #1 at t=0
  p.advance(DEFAULT_HIDDEN_INTERVAL_MS - 1);
  assert.strictEqual(p.runs(), 1);
  p.advance(12_000); // next tick is past the hidden interval
  assert.strictEqual(p.runs(), 2);
  p.advance(DEFAULT_HIDDEN_INTERVAL_MS);
  assert.strictEqual(p.runs(), 3);
});

check('becoming visible runs once immediately and resumes the normal interval', () => {
  const p = setup(12_000);
  p.setVisibility('hidden'); // 1
  p.advance(30_000);
  assert.strictEqual(p.runs(), 1);
  p.setVisibility('visible'); // 2
  assert.strictEqual(p.runs(), 2);
  p.advance(24_000);
  assert.strictEqual(p.runs(), 4);
});

check('custom hidden interval is honoured', () => {
  const p = setup(15_000, 60_000);
  p.setVisibility('hidden');
  p.advance(45_000);
  assert.strictEqual(p.runs(), 1);
  p.advance(15_000);
  assert.strictEqual(p.runs(), 2);
});

check('stop() clears the timer and removes the listener', () => {
  const p = setup(12_000);
  assert.strictEqual(p.listenerCount(), 1);
  p.stop();
  assert.strictEqual(p.cleared(), true);
  assert.strictEqual(p.listenerCount(), 0);
  p.advance(60_000);
  assert.strictEqual(p.runs(), 0);
});

check('no document (server / tests): behaves as plain interval', () => {
  let runs = 0;
  let tick: (() => void) | null = null;
  const stop = startVisibilityAwarePolling(() => runs++, {
    intervalMs: 1000,
    target: undefined,
    setIntervalFn: (fn) => {
      tick = fn;
      return 1;
    },
    clearIntervalFn: () => {},
  });
  (tick as unknown as () => void)();
  (tick as unknown as () => void)();
  assert.strictEqual(runs, 2);
  stop();
});

console.log(`\nALL ${passed} VISIBILITY POLLING CHECKS PASSED (EXIT 0)`);
