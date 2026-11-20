import assert from 'node:assert';
import { shouldAskForAlerts } from '../../components/patient/EnableAlertsPrompt';

const base = { supported: true, permission: 'default' as const, iosNotInstalled: false, alreadyAsked: false };
let n = 0;
const eq = (a: boolean, b: boolean, m: string) => { assert.strictEqual(a, b, m); n++; };
eq(shouldAskForAlerts(base), true, 'never asked, prompt possible -> ask');
eq(shouldAskForAlerts({ ...base, alreadyAsked: true }), false, 'asked once already -> never again');
eq(shouldAskForAlerts({ ...base, permission: 'granted' }), false, 'already allowed -> no pop-up');
eq(shouldAskForAlerts({ ...base, permission: 'denied' }), false, 'blocked -> phone cannot show the prompt');
eq(shouldAskForAlerts({ ...base, supported: false, permission: 'unsupported' }), false, 'no notification support -> no pop-up');
eq(shouldAskForAlerts({ ...base, iosNotInstalled: true }), false, 'iPhone outside home-screen app -> no pop-up');
console.log(`ENABLE-ALERTS-PROMPT SUITE PASSED: ${n} assertions.`);
