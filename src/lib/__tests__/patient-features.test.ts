import assert from 'node:assert';
import {
  isDialysisDay,
  filterPatientNotifications,
  getReadNotificationIds,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  checkAndTriggerLocalNotifications,
} from '../../app/[locale]/patient/patient-utils';
import type { Notification } from '../types';

// ========================================================
// 1. DIALYSIS DAY SMART DETECTION TESTS
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

// MWF Schedule
assert.strictEqual(isDialysisDay('MWF', mon), true, 'MWF on Monday must be dialysis day');
assert.strictEqual(isDialysisDay('MWF', tue), false, 'MWF on Tuesday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('MWF', wed), true, 'MWF on Wednesday must be dialysis day');
assert.strictEqual(isDialysisDay('MWF', thu), false, 'MWF on Thursday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('MWF', fri), true, 'MWF on Friday must be dialysis day');
assert.strictEqual(isDialysisDay('MWF', sat), false, 'MWF on Saturday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('MWF', sun), false, 'MWF on Sunday must NOT be dialysis day');

// TTS Schedule
assert.strictEqual(isDialysisDay('TTS', mon), false, 'TTS on Monday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('TTS', tue), true, 'TTS on Tuesday must be dialysis day');
assert.strictEqual(isDialysisDay('TTS', wed), false, 'TTS on Wednesday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('TTS', thu), true, 'TTS on Thursday must be dialysis day');
assert.strictEqual(isDialysisDay('TTS', fri), false, 'TTS on Friday must NOT be dialysis day');
assert.strictEqual(isDialysisDay('TTS', sat), true, 'TTS on Saturday must be dialysis day');
assert.strictEqual(isDialysisDay('TTS', sun), false, 'TTS on Sunday must NOT be dialysis day');

// Case insensitivity & Whitespace trimming
assert.strictEqual(isDialysisDay('  mwf  ', mon), true, 'lowercase mwf with whitespace on Monday must be true');
assert.strictEqual(isDialysisDay('  tts  ', tue), true, 'lowercase tts with whitespace on Tuesday must be true');

// Default fallback when undefined or Custom
assert.strictEqual(isDialysisDay(undefined, mon), true, 'Undefined schedule should default to MWF (Mon true)');
assert.strictEqual(isDialysisDay(undefined, tue), false, 'Undefined schedule should default to MWF (Tue false)');
assert.strictEqual(isDialysisDay('Custom', mon), true, 'Custom schedule should fallback to MWF (Mon true)');
assert.strictEqual(isDialysisDay('Custom', tue), false, 'Custom schedule should fallback to MWF (Tue false)');

// Invalid date robustness
const invalidDate = new Date('invalid-date-string');
assert.strictEqual(typeof isDialysisDay('MWF', invalidDate), 'boolean', 'Invalid date should not throw');

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

// Patient 1 (schedule MWF)
const p1Notifs = filterPatientNotifications(mockNotifications, 'patient-1', 'MWF');
const p1Ids = p1Notifs.map((n) => n.id);
assert.strictEqual(p1Ids.includes('notif-broadcast-1'), true, 'P1 must receive broadcast');
assert.strictEqual(p1Ids.includes('notif-direct-p1'), true, 'P1 must receive direct P1');
assert.strictEqual(p1Ids.includes('notif-group-mwf'), true, 'P1 must receive MWF group');
assert.strictEqual(p1Ids.includes('notif-group-prop-mwf'), true, 'P1 must receive MWF group via group property');
assert.strictEqual(p1Ids.includes('notif-direct-p2'), false, 'P1 must NOT receive direct P2');
assert.strictEqual(p1Ids.includes('notif-group-tts'), false, 'P1 must NOT receive TTS group');

// Patient 2 (schedule TTS)
const p2Notifs = filterPatientNotifications(mockNotifications, 'patient-2', 'TTS');
const p2Ids = p2Notifs.map((n) => n.id);
assert.strictEqual(p2Ids.includes('notif-broadcast-1'), true, 'P2 must receive broadcast');
assert.strictEqual(p2Ids.includes('notif-direct-p2'), true, 'P2 must receive direct P2');
assert.strictEqual(p2Ids.includes('notif-group-tts'), true, 'P2 must receive TTS group');
assert.strictEqual(p2Ids.includes('notif-direct-p1'), false, 'P2 must NOT receive direct P1');
assert.strictEqual(p2Ids.includes('notif-group-mwf'), false, 'P2 must NOT receive MWF group');
assert.strictEqual(p2Ids.includes('notif-group-prop-mwf'), false, 'P2 must NOT receive MWF group property');

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
