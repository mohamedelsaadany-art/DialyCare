import assert from 'node:assert';
import { shouldSilentlyReload, SILENT_RELOAD_AFTER_HIDDEN_MS as T } from '../silent-update';

let n = 0;
const eq = (a: boolean, b: boolean, m: string) => { assert.strictEqual(a, b, m); n++; };
eq(shouldSilentlyReload(false, T * 10), false, 'no new version -> never reload');
eq(shouldSilentlyReload(true, 0), false, 'new version but app in use -> wait');
eq(shouldSilentlyReload(true, T - 1), false, 'away only briefly -> wait');
eq(shouldSilentlyReload(true, T), true, 'back after a while with a new version -> reload quietly');
console.log(`SILENT-UPDATE SUITE PASSED: ${n} assertions.`);
