import assert from 'node:assert';
import { alertHelpPlace, alertHelpSteps } from '../alert-help';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => { assert.deepStrictEqual(a, b, m); n++; };
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };

eq(alertHelpPlace(false, false), 'browser', 'website in a browser');
eq(alertHelpPlace(false, true), 'browser', 'iPhone Safari is still the browser');
eq(alertHelpPlace(true, false), 'installed-android', 'home-screen app on Android');
eq(alertHelpPlace(true, true), 'installed-ios', 'home-screen app on iPhone');

ok(alertHelpSteps('browser', true).join(' ').includes('🔒'), 'browser steps use the lock');
ok(!alertHelpSteps('installed-android', true).join(' ').includes('🔒'), 'installed app: no lock (there is no address bar)');
ok(alertHelpSteps('installed-android', true).join(' ').includes('معلومات التطبيق'), 'Android: app info');
ok(!alertHelpSteps('installed-ios', true).join(' ').includes('🔒') && alertHelpSteps('installed-ios', true).join(' ').includes('الإعدادات'), 'iPhone: phone settings');
for (const p of ['browser', 'installed-android', 'installed-ios'] as const) eq(alertHelpSteps(p, false).length, 3, `${p}: three steps in English too`);

console.log(`ALERT-HELP SUITE PASSED: ${n} assertions.`);
