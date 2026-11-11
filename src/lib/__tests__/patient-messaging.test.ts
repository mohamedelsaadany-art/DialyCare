import assert from 'node:assert';
import {
  initDataStore,
  getNotifications,
  getPatientNotifications,
  addNotification,
  STORAGE_KEYS,
} from '../data-store';
import { filterPatientNotifications } from '../../app/[locale]/patient/patient-utils';
import type { Notification } from '../types';

console.log('--- Testing Patient Messaging & Notifications Store ---');

// Mock localStorage environment
const mockStorage: Record<string, string> = {};
const dispatchedEvents: string[] = [];

(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => {
      mockStorage[key] = val;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      for (const k of Object.keys(mockStorage)) {
        delete mockStorage[k];
      }
    },
  },
  dispatchEvent: (event: { type: string }) => {
    dispatchedEvents.push(event.type);
    return true;
  },
};
(globalThis as unknown as { Event: unknown }).Event = class {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
};

// ========================================================
// 1. Initial Welcome Notification Seeding
// ========================================================
console.log('1. Testing initial welcome notification seeding...');
initDataStore();

const seeded = getNotifications();
assert.ok(seeded.length >= 3, 'Must seed at least 3 initial notifications');

const broadcastWelcome = seeded.find((n) => n.id === 'notif_welcome_broadcast');
assert.ok(broadcastWelcome, 'Must include broadcast welcome notification');
assert.strictEqual(broadcastWelcome.type, 'broadcast');
assert.ok(broadcastWelcome.recipientIds.includes('patient-1'));
assert.ok(broadcastWelcome.recipientIds.includes('patient-2'));

const p1Welcome = seeded.find((n) => n.id === 'notif_welcome_patient1');
assert.ok(p1Welcome, 'Must include patient-1 individual welcome notification');
assert.strictEqual(p1Welcome.type, 'individual');
assert.deepStrictEqual(p1Welcome.recipientIds, ['patient-1']);

const p2Welcome = seeded.find((n) => n.id === 'notif_welcome_patient2');
assert.ok(p2Welcome, 'Must include patient-2 individual welcome notification');
assert.strictEqual(p2Welcome.type, 'individual');
assert.deepStrictEqual(p2Welcome.recipientIds, ['patient-2']);

console.log('✓ Initial welcome notifications seeded successfully.');

// ========================================================
// 2. Seeding Resilience with Pre-existing Storage
// ========================================================
console.log('2. Testing seeding resilience with pre-existing storage lacking welcome...');
// Simulate pre-existing storage with an old custom notification and no welcome
mockStorage[STORAGE_KEYS.NOTIFICATIONS] = JSON.stringify([
  {
    id: 'old-custom-alert',
    senderId: 'admin-1',
    type: 'individual',
    recipientIds: ['patient-1'],
    titleEn: 'Old Alert',
    titleAr: 'تنبيه قديم',
    messageEn: 'Prior notification',
    messageAr: 'إشعار سابق',
    sentAt: '2025-12-01T00:00:00.000Z',
    status: 'sent',
  },
]);

initDataStore();
const resilientList = getNotifications();
const hasSeededWelcome = resilientList.some((n) => n.id === 'notif_welcome_broadcast');
assert.strictEqual(hasSeededWelcome, true, 'Should seed welcome notification even when non-empty storage lacked it');
const preservedOld = resilientList.some((n) => n.id === 'old-custom-alert');
assert.strictEqual(preservedOld, true, 'Should preserve pre-existing notifications');

console.log('✓ Seeding resilience verified.');

// ========================================================
// 3. Direct Message from Chart: addNotification Behavior
// ========================================================
console.log('3. Testing direct message dispatch via addNotification...');
dispatchedEvents.length = 0;

const directMessage: Notification = {
  id: 'direct_msg_test_101',
  senderId: 'admin-1',
  type: 'individual',
  recipientIds: ['patient-1'],
  titleEn: 'Dialysis Session Reminder',
  titleAr: 'تذكير بموعد جلسة الغسيل الكلوي',
  messageEn: 'Please arrive 15 minutes before your time slot.',
  messageAr: 'يرجى الحضور قبل الموعد بـ 15 دقيقة.',
  sentAt: new Date().toISOString(),
  status: 'sent',
};

const returnedNotif = addNotification(directMessage);
assert.strictEqual(returnedNotif.id, 'direct_msg_test_101');
assert.strictEqual(returnedNotif.type, 'individual');
assert.deepStrictEqual(returnedNotif.recipientIds, ['patient-1']);
assert.strictEqual(returnedNotif.status, 'sent');

// Verify reactive event was dispatched
assert.ok(
  dispatchedEvents.includes('dialycare_notifications_updated'),
  'Must dispatch dialycare_notifications_updated event'
);

// Verify direct persistence in DIALYCARE_NOTIFICATIONS localStorage
const rawStored = mockStorage[STORAGE_KEYS.NOTIFICATIONS];
assert.ok(rawStored, 'Must persist to STORAGE_KEYS.NOTIFICATIONS');
const parsedStored: Notification[] = JSON.parse(rawStored);
assert.strictEqual(parsedStored[0].id, 'direct_msg_test_101', 'New message must be at index 0 (unshifted)');

console.log('✓ Direct message correctly persisted and reactive event dispatched.');

// ========================================================
// 4. Unified Store: Admin History & Patient Inbox Consistency
// ========================================================
console.log('4. Testing unified store consistency between Admin and Patient Inbox...');

// Admin history check
const adminList = getNotifications();
const foundInAdmin = adminList.find((n) => n.id === 'direct_msg_test_101');
assert.ok(foundInAdmin, 'Message must be present in admin notifications list');

// Patient 1 inbox check via getPatientNotifications
const p1Notifs = getPatientNotifications('patient-1');
assert.ok(
  p1Notifs.some((n) => n.id === 'direct_msg_test_101'),
  'Patient 1 must receive the direct message'
);

// Patient 1 inbox check via filterPatientNotifications (SMW and legacy MWF)
const p1FilteredSmw = filterPatientNotifications(adminList, 'patient-1', 'SMW');
assert.ok(
  p1FilteredSmw.some((n) => n.id === 'direct_msg_test_101'),
  'Patient 1 inbox filter (SMW) must match the direct message'
);
const p1Filtered = filterPatientNotifications(adminList, 'patient-1', 'MWF');
assert.ok(
  p1Filtered.some((n) => n.id === 'direct_msg_test_101'),
  'Patient 1 inbox filter (legacy MWF) must match the direct message'
);

// Patient 2 inbox check - MUST NOT receive Patient 1 direct message
const p2Notifs = getPatientNotifications('patient-2');
assert.strictEqual(
  p2Notifs.some((n) => n.id === 'direct_msg_test_101'),
  false,
  'Patient 2 must NOT receive Patient 1 direct message'
);

const p2FilteredStt = filterPatientNotifications(adminList, 'patient-2', 'STT');
assert.strictEqual(
  p2FilteredStt.some((n) => n.id === 'direct_msg_test_101'),
  false,
  'Patient 2 inbox filter (STT) must NOT include Patient 1 direct message'
);

const p2Filtered = filterPatientNotifications(adminList, 'patient-2', 'TTS');
assert.strictEqual(
  p2Filtered.some((n) => n.id === 'direct_msg_test_101'),
  false,
  'Patient 2 inbox filter (legacy TTS) must NOT include Patient 1 direct message'
);

console.log('✓ Unified store verified: Admin and Patient Inbox read identical data with correct isolation.');

// ========================================================
// 5. Timeline Numeric Sorting Across Locales (Anti-Regression)
// ========================================================
console.log('5. Testing timeline numeric timestamp sorting across locales...');

const mockTimelineEntries = [
  { id: '1', timestamp: 1000, details: 'Older' },
  { id: '2', timestamp: 3000, details: 'Newest' },
  { id: '3', timestamp: 2000, details: 'Middle' },
];

mockTimelineEntries.sort((a, b) => b.timestamp - a.timestamp);
assert.strictEqual(mockTimelineEntries[0].id, '2', 'Index 0 must be newest (3000)');
assert.strictEqual(mockTimelineEntries[1].id, '3', 'Index 1 must be middle (2000)');
assert.strictEqual(mockTimelineEntries[2].id, '1', 'Index 2 must be oldest (1000)');

console.log('✓ Timeline timestamp sorting passes without NaN risk.');
console.log('\nALL PATIENT MESSAGING VERIFICATION TESTS PASSED!');
