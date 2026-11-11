/**
 * DIALYSIS SCHEDULE OPTIONS (R6) COMPREHENSIVE VERIFICATION SUITE
 *
 * Verifies strict 2-option dialysis schedule system:
 * - Option 1 (SMW): Saturday / Monday / Wednesday — السبت / الاثنين / الأربعاء (days [6, 1, 3])
 * - Option 2 (STT): Sunday / Tuesday / Thursday — الأحد / الثلاثاء / الخميس (days [0, 2, 4])
 * - Backwards compatibility: MWF normalizes to SMW, TTS normalizes to STT
 * - Removal of 'Custom' schedule option
 * - Group notification targeting and patient schedule filtering
 * - Demo patient 1 is SMW, Demo patient 2 is STT
 */

import assert from 'node:assert';
import {
  isDialysisDay,
  normalizeDialysisSchedule,
  getDialysisScheduleLabel,
  getDialysisScheduleFullLabel,
  filterPatientNotifications,
} from '../../app/[locale]/patient/patient-utils';
import { getPatients, initDataStore } from '../data-store';
import type { Notification } from '../types';

console.log('================================================================');
console.log('RUNNING R6: STRICT 2-OPTION DIALYSIS SCHEDULE TEST SUITE');
console.log('================================================================\n');

// 1. Setup reference calendar dates for all 7 days of the week:
// 2026-03-01 is Sunday (0)
// 2026-03-02 is Monday (1)
// 2026-03-03 is Tuesday (2)
// 2026-03-04 is Wednesday (3)
// 2026-03-05 is Thursday (4)
// 2026-03-06 is Friday (5)
// 2026-03-07 is Saturday (6)
const sun = new Date('2026-03-01T12:00:00Z');
const mon = new Date('2026-03-02T12:00:00Z');
const tue = new Date('2026-03-03T12:00:00Z');
const wed = new Date('2026-03-04T12:00:00Z');
const thu = new Date('2026-03-05T12:00:00Z');
const fri = new Date('2026-03-06T12:00:00Z');
const sat = new Date('2026-03-07T12:00:00Z');

// -----------------------------------------------------------------------------
// Test Suite 1: Option 1 (SMW) 7-day Weekday Matrix
// -----------------------------------------------------------------------------
console.log('1. Testing Option 1 (SMW: Sat / Mon / Wed) 7-day calendar matrix...');
assert.strictEqual(isDialysisDay('SMW', sat), true, 'SMW on Saturday (6) must be dialysis day');
assert.strictEqual(isDialysisDay('SMW', mon), true, 'SMW on Monday (1) must be dialysis day');
assert.strictEqual(isDialysisDay('SMW', wed), true, 'SMW on Wednesday (3) must be dialysis day');
assert.strictEqual(isDialysisDay('SMW', sun), false, 'SMW on Sunday (0) must NOT be dialysis day');
assert.strictEqual(isDialysisDay('SMW', tue), false, 'SMW on Tuesday (2) must NOT be dialysis day');
assert.strictEqual(isDialysisDay('SMW', thu), false, 'SMW on Thursday (4) must NOT be dialysis day');
assert.strictEqual(isDialysisDay('SMW', fri), false, 'SMW on Friday (5) must NOT be dialysis day (universal rest day)');
console.log('✓ Option 1 (SMW) calendar matrix verified.');

// -----------------------------------------------------------------------------
// Test Suite 2: Option 2 (STT) 7-day Weekday Matrix
// -----------------------------------------------------------------------------
console.log('2. Testing Option 2 (STT: Sun / Tue / Thu) 7-day calendar matrix...');
assert.strictEqual(isDialysisDay('STT', sun), true, 'STT on Sunday (0) must be dialysis day');
assert.strictEqual(isDialysisDay('STT', tue), true, 'STT on Tuesday (2) must be dialysis day');
assert.strictEqual(isDialysisDay('STT', thu), true, 'STT on Thursday (4) must be dialysis day');
assert.strictEqual(isDialysisDay('STT', mon), false, 'STT on Monday (1) must NOT be dialysis day');
assert.strictEqual(isDialysisDay('STT', wed), false, 'STT on Wednesday (3) must NOT be dialysis day');
assert.strictEqual(isDialysisDay('STT', fri), false, 'STT on Friday (5) must NOT be dialysis day');
assert.strictEqual(isDialysisDay('STT', sat), false, 'STT on Saturday (6) must NOT be dialysis day');
console.log('✓ Option 2 (STT) calendar matrix verified.');

// -----------------------------------------------------------------------------
// Test Suite 3: Backwards Compatibility & Normalization
// -----------------------------------------------------------------------------
console.log('3. Testing backwards-compatible normalization for legacy schedules...');
assert.strictEqual(normalizeDialysisSchedule('SMW'), 'SMW');
assert.strictEqual(normalizeDialysisSchedule('STT'), 'STT');
assert.strictEqual(normalizeDialysisSchedule('MWF'), 'SMW', 'MWF must normalize to SMW');
assert.strictEqual(normalizeDialysisSchedule('TTS'), 'STT', 'TTS must normalize to STT');
assert.strictEqual(normalizeDialysisSchedule('Custom'), 'SMW', 'Custom must normalize to default SMW');
assert.strictEqual(normalizeDialysisSchedule(undefined), 'SMW', 'Undefined must normalize to default SMW');
assert.strictEqual(normalizeDialysisSchedule(''), 'SMW', 'Empty string must normalize to default SMW');

// Legacy MWF inherits SMW days (Sat / Mon / Wed)
assert.strictEqual(isDialysisDay('MWF', sat), true, 'Legacy MWF on Saturday must be true');
assert.strictEqual(isDialysisDay('MWF', mon), true, 'Legacy MWF on Monday must be true');
assert.strictEqual(isDialysisDay('MWF', wed), true, 'Legacy MWF on Wednesday must be true');
assert.strictEqual(isDialysisDay('MWF', fri), false, 'Legacy MWF on Friday must be false (no dialysis on Friday)');

// Legacy TTS inherits STT days (Sun / Tue / Thu)
assert.strictEqual(isDialysisDay('TTS', sun), true, 'Legacy TTS on Sunday must be true');
assert.strictEqual(isDialysisDay('TTS', tue), true, 'Legacy TTS on Tuesday must be true');
assert.strictEqual(isDialysisDay('TTS', thu), true, 'Legacy TTS on Thursday must be true');
assert.strictEqual(isDialysisDay('TTS', sat), false, 'Legacy TTS on Saturday must be false (Saturday is SMW)');
console.log('✓ Backwards compatibility verified.');

// -----------------------------------------------------------------------------
// Test Suite 4: Localized UI Display Labels (Arabic & English)
// -----------------------------------------------------------------------------
console.log('4. Testing localized schedule display labels...');
// Short labels
assert.strictEqual(getDialysisScheduleLabel('SMW', true), 'السبت / الاثنين / الأربعاء');
assert.strictEqual(getDialysisScheduleLabel('SMW', false), 'Sat / Mon / Wed');
assert.strictEqual(getDialysisScheduleLabel('STT', true), 'الأحد / الثلاثاء / الخميس');
assert.strictEqual(getDialysisScheduleLabel('STT', false), 'Sun / Tue / Thu');

// Full labels with bilingual description
assert.strictEqual(
  getDialysisScheduleFullLabel('SMW', true),
  'السبت / الاثنين / الأربعاء (Sat / Mon / Wed)'
);
assert.strictEqual(
  getDialysisScheduleFullLabel('SMW', false),
  'Sat / Mon / Wed (السبت / الاثنين / الأربعاء)'
);
assert.strictEqual(
  getDialysisScheduleFullLabel('STT', true),
  'الأحد / الثلاثاء / الخميس (Sun / Tue / Thu)'
);
assert.strictEqual(
  getDialysisScheduleFullLabel('STT', false),
  'Sun / Tue / Thu (الأحد / الثلاثاء / الخميس)'
);
console.log('✓ Localized UI display labels verified.');

// -----------------------------------------------------------------------------
// Test Suite 5: Data Store Demo Patient Schedules
// -----------------------------------------------------------------------------
console.log('5. Testing demo patient initial schedules in data store...');
initDataStore();
const allPatients = getPatients();
const p1 = allPatients.find((p) => p.id === 'patient-1');
const p2 = allPatients.find((p) => p.id === 'patient-2');

assert.ok(p1, 'Demo patient-1 must exist');
assert.strictEqual(p1.dialysisSchedule, 'SMW', 'patient-1 must have schedule SMW (Sat / Mon / Wed)');

assert.ok(p2, 'Demo patient-2 must exist');
assert.strictEqual(p2.dialysisSchedule, 'STT', 'patient-2 must have schedule STT (Sun / Tue / Thu)');
console.log('✓ Demo patient schedules verified.');

// -----------------------------------------------------------------------------
// Test Suite 6: Group Notification Filtering & Shift Isolation
// -----------------------------------------------------------------------------
console.log('6. Testing group notification filtering and shift isolation...');
const testNotifications: Notification[] = [
  {
    id: 'notif-broadcast-all',
    senderId: 'admin-1',
    type: 'broadcast',
    recipientIds: [],
    titleEn: 'All Patients Broadcast',
    titleAr: 'إشعار لجميع المرضى',
    messageEn: 'Broadcast',
    messageAr: 'عام',
    sentAt: '2026-03-01T08:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-group-smw-shift',
    senderId: 'admin-1',
    type: 'group',
    recipientIds: ['SMW'],
    titleEn: 'SMW Group Notification',
    titleAr: 'إشعار لوردية السبت/الاثنين/الأربعاء',
    messageEn: 'SMW Shift message',
    messageAr: 'رسالة وردية السبت والاثنين والأربعاء',
    sentAt: '2026-03-01T09:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-group-stt-shift',
    senderId: 'admin-1',
    type: 'group',
    recipientIds: ['STT'],
    titleEn: 'STT Group Notification',
    titleAr: 'إشعار لوردية الأحد/الثلاثاء/الخميس',
    messageEn: 'STT Shift message',
    messageAr: 'رسالة وردية الأحد والثلاثاء والخميس',
    sentAt: '2026-03-01T10:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-group-legacy-mwf',
    senderId: 'admin-1',
    type: 'group',
    recipientIds: ['MWF'],
    titleEn: 'Legacy MWF Shift',
    titleAr: 'وردية سابقة MWF',
    messageEn: 'Legacy MWF',
    messageAr: 'سابقة',
    sentAt: '2026-03-01T11:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-group-legacy-tts',
    senderId: 'admin-1',
    type: 'group',
    recipientIds: ['TTS'],
    titleEn: 'Legacy TTS Shift',
    titleAr: 'وردية سابقة TTS',
    messageEn: 'Legacy TTS',
    messageAr: 'سابقة',
    sentAt: '2026-03-01T12:00:00Z',
    status: 'sent',
  },
];

// Test SMW patient filtering
const smwFiltered = filterPatientNotifications(testNotifications, 'patient-1', 'SMW');
const smwIds = new Set(smwFiltered.map((n) => n.id));
assert.strictEqual(smwIds.has('notif-broadcast-all'), true, 'SMW patient receives broadcast');
assert.strictEqual(smwIds.has('notif-group-smw-shift'), true, 'SMW patient receives SMW group');
assert.strictEqual(smwIds.has('notif-group-legacy-mwf'), true, 'SMW patient receives legacy MWF group');
assert.strictEqual(smwIds.has('notif-group-stt-shift'), false, 'SMW patient must NOT receive STT group');
assert.strictEqual(smwIds.has('notif-group-legacy-tts'), false, 'SMW patient must NOT receive TTS group');

// Test STT patient filtering
const sttFiltered = filterPatientNotifications(testNotifications, 'patient-2', 'STT');
const sttIds = new Set(sttFiltered.map((n) => n.id));
assert.strictEqual(sttIds.has('notif-broadcast-all'), true, 'STT patient receives broadcast');
assert.strictEqual(sttIds.has('notif-group-stt-shift'), true, 'STT patient receives STT group');
assert.strictEqual(sttIds.has('notif-group-legacy-tts'), true, 'STT patient receives legacy TTS group');
assert.strictEqual(sttIds.has('notif-group-smw-shift'), false, 'STT patient must NOT receive SMW group');
assert.strictEqual(sttIds.has('notif-group-legacy-mwf'), false, 'STT patient must NOT receive MWF group');

console.log('✓ Group notification filtering and shift isolation verified.');

console.log('\n================================================================');
console.log('ALL R6 DIALYSIS SCHEDULE OPTIONS TESTS COMPLETED SUCCESSFULLY!');
console.log('================================================================\n');
