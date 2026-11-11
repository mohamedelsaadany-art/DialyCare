import assert from 'node:assert';
import {
  isDialysisDay,
  normalizeDialysisSchedule,
  getDialysisScheduleLabel,
  getDialysisScheduleFullLabel,
  filterPatientNotifications,
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  checkAndTriggerLocalNotifications,
} from '../../app/[locale]/patient/patient-utils';
import type { Notification } from '../types';

// ========================================================
// 1. DIALYSIS DAY SMART DETECTION TESTS (R6 STRICT 2-OPTION)
// ========================================================
console.log('--- Testing Dialysis Day Smart Detection ---');

// Helper to create dates with specific day of week
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

// Option 1: SMW Schedule (Saturday / Monday / Wednesday — السبت / الاثنين / الأربعاء)
assert.strictEqual(isDialysisDay('SMW', sat), true, 'SMW on Saturday must be dialysis day (day 6)');
assert.strictEqual(isDialysisDay('SMW', mon), true, 'SMW on Monday must be dialysis day (day 1)');
assert.strictEqual(isDialysisDay('SMW', wed), true, 'SMW on Wednesday must be dialysis day (day 3)');
assert.strictEqual(isDialysisDay('SMW', sun), false, 'SMW on Sunday must NOT be dialysis day (day 0)');
assert.strictEqual(isDialysisDay('SMW', tue), false, 'SMW on Tuesday must NOT be dialysis day (day 2)');
assert.strictEqual(isDialysisDay('SMW', thu), false, 'SMW on Thursday must NOT be dialysis day (day 4)');
assert.strictEqual(isDialysisDay('SMW', fri), false, 'SMW on Friday must NOT be dialysis day (day 5)');

// Option 2: STT Schedule (Sunday / Tuesday / Thursday — الأحد / الثلاثاء / الخميس)
assert.strictEqual(isDialysisDay('STT', sun), true, 'STT on Sunday must be dialysis day (day 0)');
assert.strictEqual(isDialysisDay('STT', tue), true, 'STT on Tuesday must be dialysis day (day 2)');
assert.strictEqual(isDialysisDay('STT', thu), true, 'STT on Thursday must be dialysis day (day 4)');
assert.strictEqual(isDialysisDay('STT', mon), false, 'STT on Monday must NOT be dialysis day (day 1)');
assert.strictEqual(isDialysisDay('STT', wed), false, 'STT on Wednesday must NOT be dialysis day (day 3)');
assert.strictEqual(isDialysisDay('STT', fri), false, 'STT on Friday must NOT be dialysis day (day 5)');
assert.strictEqual(isDialysisDay('STT', sat), false, 'STT on Saturday must NOT be dialysis day (day 6)');

// Backwards-compatible legacy schedule mapping
// MWF normalizes to SMW (Sat / Mon / Wed)
assert.strictEqual(isDialysisDay('MWF', sat), true, 'Legacy MWF on Saturday must be dialysis day');
assert.strictEqual(isDialysisDay('MWF', mon), true, 'Legacy MWF on Monday must be dialysis day');
assert.strictEqual(isDialysisDay('MWF', wed), true, 'Legacy MWF on Wednesday must be dialysis day');
assert.strictEqual(isDialysisDay('MWF', tue), false, 'Legacy MWF on Tuesday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('MWF', thu), false, 'Legacy MWF on Thursday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('MWF', fri), false, 'Legacy MWF on Friday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('MWF', sun), false, 'Legacy MWF on Sunday must NOT be dialysis day');

// TTS normalizes to STT (Sun / Tue / Thu)
assert.strictEqual(isDialysisDay('TTS', sun), true, 'Legacy TTS on Sunday must be dialysis day');
assert.strictEqual(isDialysisDay('TTS', tue), true, 'Legacy TTS on Tuesday must be dialysis day');
assert.strictEqual(isDialysisDay('TTS', thu), true, 'Legacy TTS on Thursday must be dialysis day');
assert.strictEqual(isDialysisDay('TTS', mon), false, 'Legacy TTS on Monday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('TTS', wed), false, 'Legacy TTS on Wednesday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('TTS', fri), false, 'Legacy TTS on Friday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('TTS', sat), false, 'Legacy TTS on Saturday must NOT be dialysis day');

// Case insensitivity & Whitespace trimming
assert.strictEqual(isDialysisDay('  smw  ', sat), true, 'lowercase smw with whitespace on Saturday must be true');
assert.strictEqual(isDialysisDay('  stt  ', sun), true, 'lowercase stt with whitespace on Sunday must be true');
assert.strictEqual(isDialysisDay('  mwf  ', sat), true, 'lowercase mwf with whitespace on Saturday must be true');
assert.strictEqual(isDialysisDay('  tts  ', sun), true, 'lowercase tts with whitespace on Sunday must be true');

// Default fallback when undefined or Custom defaults to SMW (Sat / Mon / Wed)
assert.strictEqual(isDialysisDay(undefined, sat), true, 'Undefined schedule should default to SMW (Sat true)');
assert.strictEqual(isDialysisDay(undefined, mon), true, 'Undefined schedule should default to SMW (Mon true)');
assert.strictEqual(isDialysisDay(undefined, tue), false, 'Undefined schedule should default to SMW (Tue false)');
assert.strictEqual(isDialysisDay('Custom', sat), true, 'Custom schedule should fallback to SMW (Sat true)');
assert.strictEqual(isDialysisDay('Custom', mon), true, 'Custom schedule should fallback to SMW (Mon true)');
assert.strictEqual(isDialysisDay('Custom', tue), false, 'Custom schedule should fallback to SMW (Tue false)');

// Schedule helper functions verification
assert.strictEqual(normalizeDialysisSchedule('SMW'), 'SMW');
assert.strictEqual(normalizeDialysisSchedule('STT'), 'STT');
assert.strictEqual(normalizeDialysisSchedule('MWF'), 'SMW');
assert.strictEqual(normalizeDialysisSchedule('TTS'), 'STT');
assert.strictEqual(normalizeDialysisSchedule('Custom'), 'SMW');
assert.strictEqual(normalizeDialysisSchedule(undefined), 'SMW');

assert.strictEqual(getDialysisScheduleLabel('SMW', true), 'السبت / الاثنين / الأربعاء');
assert.strictEqual(getDialysisScheduleLabel('SMW', false), 'Sat / Mon / Wed');
assert.strictEqual(getDialysisScheduleLabel('STT', true), 'الأحد / الثلاثاء / الخميس');
assert.strictEqual(getDialysisScheduleLabel('STT', false), 'Sun / Tue / Thu');

assert.strictEqual(getDialysisScheduleFullLabel('SMW', true), 'السبت / الاثنين / الأربعاء (Sat / Mon / Wed)');
assert.strictEqual(getDialysisScheduleFullLabel('SMW', false), 'Sat / Mon / Wed (السبت / الاثنين / الأربعاء)');
assert.strictEqual(getDialysisScheduleFullLabel('STT', true), 'الأحد / الثلاثاء / الخميس (Sun / Tue / Thu)');
assert.strictEqual(getDialysisScheduleFullLabel('STT', false), 'Sun / Tue / Thu (الأحد / الثلاثاء / الخميس)');

// Invalid date robustness
const invalidDate = new Date('invalid-date-string');
assert.strictEqual(typeof isDialysisDay('SMW', invalidDate), 'boolean', 'Invalid date should not throw');
assert.strictEqual(typeof isDialysisDay('STT', invalidDate), 'boolean', 'Invalid date should not throw');

console.log('✓ All Dialysis Day Smart Detection tests passed!');

// ========================================================
// 2. DOCTOR NOTIFICATIONS FILTERING TESTS
// ========================================================
console.log('--- Testing Doctor Notifications Filtering ---');

const mockNotifications: Notification[] = [
  {
    id: 'notif-broadcast-1',
    senderId: 'doctor-1',
    type: 'broadcast',
    recipientIds: ['patient-1', 'patient-2'],
    titleEn: 'Broadcast Title',
    titleAr: 'عنوان عام',
    messageEn: 'Broadcast message for all',
    messageAr: 'رسالة عامة للجميع',
    sentAt: '2026-03-01T10:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-direct-p1',
    senderId: 'doctor-1',
    type: 'individual',
    recipientIds: ['patient-1'],
    titleEn: 'Direct to P1',
    titleAr: 'خاص بمريض 1',
    messageEn: 'Direct message for patient 1',
    messageAr: 'رسالة خاصة بمريض 1',
    sentAt: '2026-03-01T11:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-direct-p2',
    senderId: 'doctor-1',
    type: 'individual',
    recipientIds: ['patient-2'],
    titleEn: 'Direct to P2',
    titleAr: 'خاص بمريض 2',
    messageEn: 'Direct message for patient 2',
    messageAr: 'رسالة خاصة بمريض 2',
    sentAt: '2026-03-01T12:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-group-mwf',
    senderId: 'doctor-1',
    type: 'group',
    recipientIds: ['MWF'],
    titleEn: 'MWF Group Update',
    titleAr: 'تحديث مجموعة MWF',
    messageEn: 'Update for MWF shift',
    messageAr: 'تحديث لوردية MWF',
    sentAt: '2026-03-01T13:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-group-tts',
    senderId: 'doctor-1',
    type: 'group',
    recipientIds: ['TTS'],
    titleEn: 'TTS Group Update',
    titleAr: 'تحديث مجموعة TTS',
    messageEn: 'Update for TTS shift',
    messageAr: 'تحديث لوردية TTS',
    sentAt: '2026-03-01T14:00:00Z',
    status: 'sent',
  },
  {
    id: 'notif-group-smw',
    senderId: 'doctor-1',
    type: 'group',
    recipientIds: ['SMW'],
    titleEn: 'SMW Group Update',
    titleAr: 'تحديث مجموعة السبت والاثنين والأربعاء',
    messageEn: 'Update for SMW shift',
    messageAr: 'تحديث لوردية السبت والاثنين والأربعاء',
    sentAt: '2026-03-01T14:30:00Z',
    status: 'sent',
  },
  {
    id: 'notif-group-stt',
    senderId: 'doctor-1',
    type: 'group',
    recipientIds: ['STT'],
    titleEn: 'STT Group Update',
    titleAr: 'تحديث مجموعة الأحد والثلاثاء والخميس',
    messageEn: 'Update for STT shift',
    messageAr: 'تحديث لوردية الأحد والثلاثاء والخميس',
    sentAt: '2026-03-01T14:45:00Z',
    status: 'sent',
  },
  // Extra: group notification targeting via properties
  {
    id: 'notif-group-prop-mwf',
    senderId: 'doctor-1',
    type: 'group',
    recipientIds: [],
    // @ts-expect-error property testing
    group: 'MWF',
    titleEn: 'MWF Group Property Update',
    titleAr: 'تحديث وردية MWF عبر الخاصية',
    messageEn: 'Update targeting MWF group property',
    messageAr: 'تحديث يستهدف خاصية وردية MWF',
    sentAt: '2026-03-01T15:00:00Z',
    status: 'sent',
  },
];

// Patient 1 (schedule SMW - Option 1)
const p1SmwNotifs = filterPatientNotifications(mockNotifications, 'patient-1', 'SMW');
const p1SmwIds = p1SmwNotifs.map((n) => n.id);
assert.strictEqual(p1SmwIds.includes('notif-broadcast-1'), true, 'P1 (SMW) must receive broadcast');
assert.strictEqual(p1SmwIds.includes('notif-direct-p1'), true, 'P1 (SMW) must receive direct P1');
assert.strictEqual(p1SmwIds.includes('notif-group-smw'), true, 'P1 (SMW) must receive SMW group');
assert.strictEqual(p1SmwIds.includes('notif-group-mwf'), true, 'P1 (SMW) must receive legacy MWF group');
assert.strictEqual(p1SmwIds.includes('notif-group-prop-mwf'), true, 'P1 (SMW) must receive MWF group via property');
assert.strictEqual(p1SmwIds.includes('notif-direct-p2'), false, 'P1 (SMW) must NOT receive direct P2');
assert.strictEqual(p1SmwIds.includes('notif-group-stt'), false, 'P1 (SMW) must NOT receive STT group');
assert.strictEqual(p1SmwIds.includes('notif-group-tts'), false, 'P1 (SMW) must NOT receive TTS group');

// Patient 1 (schedule MWF legacy)
const p1Notifs = filterPatientNotifications(mockNotifications, 'patient-1', 'MWF');
const p1Ids = p1Notifs.map((n) => n.id);
assert.strictEqual(p1Ids.includes('notif-broadcast-1'), true, 'P1 (MWF) must receive broadcast');
assert.strictEqual(p1Ids.includes('notif-direct-p1'), true, 'P1 (MWF) must receive direct P1');
assert.strictEqual(p1Ids.includes('notif-group-smw'), true, 'P1 (MWF) must receive SMW group');
assert.strictEqual(p1Ids.includes('notif-group-mwf'), true, 'P1 (MWF) must receive MWF group');
assert.strictEqual(p1Ids.includes('notif-group-prop-mwf'), true, 'P1 (MWF) must receive MWF group via group property');
assert.strictEqual(p1Ids.includes('notif-direct-p2'), false, 'P1 (MWF) must NOT receive direct P2');
assert.strictEqual(p1Ids.includes('notif-group-stt'), false, 'P1 (MWF) must NOT receive STT group');
assert.strictEqual(p1Ids.includes('notif-group-tts'), false, 'P1 (MWF) must NOT receive TTS group');

// Patient 2 (schedule STT - Option 2)
const p2SttNotifs = filterPatientNotifications(mockNotifications, 'patient-2', 'STT');
const p2SttIds = p2SttNotifs.map((n) => n.id);
assert.strictEqual(p2SttIds.includes('notif-broadcast-1'), true, 'P2 (STT) must receive broadcast');
assert.strictEqual(p2SttIds.includes('notif-direct-p2'), true, 'P2 (STT) must receive direct P2');
assert.strictEqual(p2SttIds.includes('notif-group-stt'), true, 'P2 (STT) must receive STT group');
assert.strictEqual(p2SttIds.includes('notif-group-tts'), true, 'P2 (STT) must receive legacy TTS group');
assert.strictEqual(p2SttIds.includes('notif-direct-p1'), false, 'P2 (STT) must NOT receive direct P1');
assert.strictEqual(p2SttIds.includes('notif-group-smw'), false, 'P2 (STT) must NOT receive SMW group');
assert.strictEqual(p2SttIds.includes('notif-group-mwf'), false, 'P2 (STT) must NOT receive MWF group');

// Patient 2 (schedule TTS legacy)
const p2Notifs = filterPatientNotifications(mockNotifications, 'patient-2', 'TTS');
const p2Ids = p2Notifs.map((n) => n.id);
assert.strictEqual(p2Ids.includes('notif-broadcast-1'), true, 'P2 (TTS) must receive broadcast');
assert.strictEqual(p2Ids.includes('notif-direct-p2'), true, 'P2 (TTS) must receive direct P2');
assert.strictEqual(p2Ids.includes('notif-group-stt'), true, 'P2 (TTS) must receive STT group');
assert.strictEqual(p2Ids.includes('notif-group-tts'), true, 'P2 (TTS) must receive TTS group');
assert.strictEqual(p2Ids.includes('notif-direct-p1'), false, 'P2 (TTS) must NOT receive direct P1');
assert.strictEqual(p2Ids.includes('notif-group-smw'), false, 'P2 (TTS) must NOT receive SMW group');
assert.strictEqual(p2Ids.includes('notif-group-mwf'), false, 'P2 (TTS) must NOT receive MWF group');
assert.strictEqual(p2Ids.includes('notif-group-prop-mwf'), false, 'P2 (TTS) must NOT receive MWF group property');

// Edge cases: null/undefined notifications or patientId
assert.deepStrictEqual(filterPatientNotifications(null as unknown as Notification[], 'patient-1'), []);
assert.deepStrictEqual(filterPatientNotifications(undefined as unknown as Notification[], 'patient-1'), []);

// Patient matching by userUid
const p3Notifs = filterPatientNotifications(mockNotifications, 'patient-unknown', 'MWF', 'patient-1');
assert.strictEqual(p3Notifs.some((n) => n.id === 'notif-direct-p1'), true, 'Must match via userUid');

console.log('✓ All Doctor Notifications Filtering tests passed!');

// ========================================================
// 3. READ STATUS AND LOCALSTORAGE TESTS
// ========================================================
console.log('--- Testing Read Status Tracking ---');

// Mock localStorage and window events
const storageStore: Record<string, string> = {};
const dispatchedEvents: string[] = [];

(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => storageStore[key] || null,
    setItem: (key: string, val: string) => {
      storageStore[key] = val;
    },
    removeItem: (key: string) => {
      delete storageStore[key];
    },
  },
  dispatchEvent: (event: { type: string }) => {
    dispatchedEvents.push(event.type);
    return true;
  },
};

const pid = 'patient-test-1';
assert.deepStrictEqual(getReadNotificationIds(pid), [], 'Initially empty read list');

markNotificationAsRead(pid, 'notif-1');
assert.deepStrictEqual(getReadNotificationIds(pid), ['notif-1'], 'notif-1 should be marked read');

// Deduplication
markNotificationAsRead(pid, 'notif-1');
assert.deepStrictEqual(getReadNotificationIds(pid), ['notif-1'], 'notif-1 should not be duplicated');

markAllNotificationsAsRead(pid, ['notif-2', 'notif-3']);
const allRead = getReadNotificationIds(pid);
assert.strictEqual(allRead.includes('notif-1'), true);
assert.strictEqual(allRead.includes('notif-2'), true);
assert.strictEqual(allRead.includes('notif-3'), true);
assert.strictEqual(allRead.length, 3);

// Malformed / non-array localStorage resilience
storageStore[`DIALYCARE_READ_NOTIFICATIONS_${pid}`] = '{"invalid": true}';
assert.deepStrictEqual(getReadNotificationIds(pid), [], 'Corrupted object in storage should return empty array safely');

storageStore[`DIALYCARE_READ_NOTIFICATIONS_${pid}`] = 'corrupted-not-json';
assert.deepStrictEqual(getReadNotificationIds(pid), [], 'Corrupted raw string should return empty array safely');

console.log('✓ All Read Status Tracking tests passed!');

// ========================================================
// 4. LOCAL NOTIFICATION ALERTING TESTS
// ========================================================
console.log('--- Testing Local Notification Alerting ---');

let notificationPermission: NotificationPermission = 'granted';
const localNotificationCalls: Array<{ title: string; body: string }> = [];

// Mock Notification class
const MockNotification = class {
  static get permission() {
    return notificationPermission;
  }
  constructor(title: string, options?: { body?: string }) {
    localNotificationCalls.push({ title, body: options?.body || '' });
  }
};

(globalThis as unknown as { Notification: unknown }).Notification = MockNotification;
(globalThis as unknown as { window: Record<string, unknown> }).window.Notification = MockNotification;

const pid2 = 'patient-alert-test';
const testNotifs: Notification[] = [
  {
    id: 'alert-1',
    senderId: 'doc',
    type: 'broadcast',
    recipientIds: [],
    titleEn: 'Alert 1 En',
    titleAr: 'تنبيه 1 ع',
    messageEn: 'Msg 1 En',
    messageAr: 'نص 1 ع',
    sentAt: new Date().toISOString(),
    status: 'sent',
  },
];

// Test 4A: When permission is NOT granted (e.g. 'default' or 'denied'), do NOT alert or burn notification
notificationPermission = 'default';
checkAndTriggerLocalNotifications(pid2, testNotifs, false);
assert.strictEqual(localNotificationCalls.length, 0, 'Must NOT trigger when permission is default');
assert.strictEqual(
  storageStore[`DIALYCARE_ALERTED_NOTIFICATIONS_${pid2}`],
  undefined,
  'Must NOT burn alert in storage when permission is default'
);

// Test 4B: When permission is granted, alert triggers and is saved to storage
notificationPermission = 'granted';
checkAndTriggerLocalNotifications(pid2, testNotifs, false);
assert.strictEqual(localNotificationCalls.length, 1, 'Should trigger 1 local notification when granted');
assert.strictEqual(localNotificationCalls[0].title, 'Alert 1 En');

// Test 4C: Running again should NOT trigger duplicate alert
checkAndTriggerLocalNotifications(pid2, testNotifs, false);
assert.strictEqual(localNotificationCalls.length, 1, 'Should NOT re-trigger already alerted notification');

console.log('✓ All Local Notification Alerting tests passed!');
console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
