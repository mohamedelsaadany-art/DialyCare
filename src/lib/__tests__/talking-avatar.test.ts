/**
 * Talking avatar: what it says, doctor approval of lab advice, voice route.
 * Run: npx tsx src/lib/__tests__/talking-avatar.test.ts
 */
import assert from 'node:assert';

for (const k of ['BLOB_READ_WRITE_TOKEN', 'VERCEL_OIDC_TOKEN', 'BLOB_STORE_ID', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'SESSION_SECRET', 'VERCEL', 'AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID']) delete process.env[k];

import { todayScript, medsScript, labsScript, tipScript } from '../avatar-scripts';
import { DRAFT_LAB_ADVICE, mergeLabAdvice, approvedLabAdvice, isLabAdviceKey } from '../lab-advice';
import { buildSsml, ttsProviders } from '../tts-ssml';
import { withTashkeel } from '../spoken-arabic';
import { clampAvatarPosition } from '../../components/patient/TalkingAvatar';
import { CLINICAL_12_LAB_TESTS } from '../../components/admin/PatientLabResultsModal';
import { saveCloudAccounts } from '../cloud-store';
import { createSessionToken, hashPassword } from '../server-auth';
import { GET as adviceGet, PUT as advicePut } from '../../app/api/lab-advice/route';
import { POST as ttsPost } from '../../app/api/tts/route';
import type { PatientMedication, PatientLabRecord, StoredAccount, User } from '../types';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepStrictEqual(a, b, m); n++; };
console.warn = () => {};
console.error = () => {};

const meds = [
  { id: 'm1', patientId: 'p', name: 'Sevelamer', nameAr: 'سيفيلامير', dose: '800 mg (1 tablet)', scheduleTimes: ['08:00', '20:00'], instructionsAr: 'مع الأكل' },
  { id: 'm2', patientId: 'p', name: 'Amlodipine', nameAr: 'أملوديبين', dose: '5 mg', scheduleTime: '08:00' },
] as PatientMedication[];

async function run(): Promise<void> {
  // ---- today ----
  const sat = new Date('2026-11-21T10:00:00Z'); // Saturday (SMW session day)
  let t = todayScript({ firstName: 'أحمد', schedule: 'SMW', now: sat, nowMinutes: 12 * 60, meds, todayLogs: [], waterMl: 500, waterLimitMl: 1820 });
  ok(t[0].includes('أحمد'), 'greets by name');
  ok(t.some((p) => p.includes('عندك جلسة غسيل')), 'session day');
  ok(t.some((p) => p.includes('2 أدوية فات معادها')), 'counts missed morning doses');
  ok(t.some((p) => p.includes('الدوا الجاي: سيفيلامير') && p.includes('بالليل')), 'next dose in plain words');
  ok(t.some((p) => p.includes('شربت 2 من 7 أكواب')), 'water in cups');
  t = todayScript({ schedule: 'STT', now: sat, nowMinutes: 9 * 60, meds: [], todayLogs: [], waterMl: 1820, waterLimitMl: 1820 });
  ok(t.some((p) => p.includes('يوم راحة') && p.includes('بكرة')), 'rest day, session tomorrow');
  ok(t.some((p) => p.includes('ما تشربش تاني')), 'water limit reached');
  const allTaken = ['08:00', '20:00'].map((time) => ({ id: time, patientId: 'p', type: 'ttt', status: 'done', loggedAt: '', data: { medicationId: 'm1', scheduleTime: time } }));
  allTaken.push({ id: 'x', patientId: 'p', type: 'ttt', status: 'done', loggedAt: '', data: { medicationId: 'm2', scheduleTime: '08:00' } });
  t = todayScript({ schedule: 'SMW', now: sat, nowMinutes: 21 * 60, meds, todayLogs: allTaken as never, waterMl: 0, waterLimitMl: 1820 });
  ok(t.some((p) => p.includes('أخدت كل أدوية النهارده')), 'praise when all taken');

  // ---- medicines ----
  const m = medsScript(meds);
  eq(m[0], 'عندك 2 أدوية.', 'count');
  ok(m[1].includes('سيفيلامير، حبة واحدة، الصبح الساعة 8 وبالليل الساعة 8') && m[1].includes('مع الأكل'), 'medicine read in plain words');
  ok(medsScript([])[0].includes('مفيش أدوية'), 'no medicines');

  // ---- labs: only approved advice is spoken ----
  const lab = { id: 'l', patientId: 'p', testDate: '2026-11-10', recordedBy: 'doc', values: { phosphorus: 6.2, hemoglobin: 11, calcium: 9 } } as PatientLabRecord;
  let l = labsScript(lab, CLINICAL_12_LAB_TESTS, {});
  ok(l[0].includes('10 نوفمبر'), 'date in words');
  ok(l.some((p) => p.startsWith('الفسفور: 6.2، أعلى من الطبيعي.') && !p.includes('الجبن')), 'no advice before approval');
  ok(l.some((p) => p.includes('الهيموجلوبين') && p.includes('الكالسيوم')), 'normal results listed as good');
  ok(l[l.length - 1].includes('دكتورك'), 'ends by pointing to the doctor');
  l = labsScript(lab, CLINICAL_12_LAB_TESTS, { 'phosphorus:high': 'قلل الجبن.' });
  ok(l.some((p) => p.includes('أعلى من الطبيعي. قلل الجبن.')), 'approved advice spoken');
  ok(labsScript(null, CLINICAL_12_LAB_TESTS, {})[0].includes('مفيش تحاليل'), 'no labs');

  // ---- tips ----
  ok(tipScript([], 0)[0].includes('جلسة الغسيل'), 'core tip when the team added none');
  eq(tipScript([{ id: 't', category: 'fluid', titleEn: '', titleAr: 'المية', contentEn: '', contentAr: 'التزم بالكمية.', order: 1, isActive: true }], 5), ['المية.', 'التزم بالكمية.'], 'team tip');

  // ---- advice drafts ----
  eq(Object.keys(DRAFT_LAB_ADVICE).length, 24, '12 tests x high/low');
  ok(CLINICAL_12_LAB_TESTS.every((tt) => isLabAdviceKey(`${tt.key}:high`) && isLabAdviceKey(`${tt.key}:low`)), 'a draft for every test');
  eq(Object.keys(approvedLabAdvice(mergeLabAdvice({}))).length, 24, 'all drafts are spoken without approval');

  // ---- position ----
  eq(clampAvatarPosition(-50, -50, 375, 812), { x: 8, y: 72 }, 'kept on screen (top-left)');
  eq(clampAvatarPosition(9999, 9999, 375, 812), { x: 375 - 76 - 8, y: 812 - 76 - 84 }, 'kept above the bottom menu');

  // ---- SSML is escaped ----
  ok(buildSsml('a < b & "c"', 'ar-EG-SalmaNeural').includes('a &lt; b &amp; &quot;c&quot;'), 'text escaped in SSML');

  // ---- diacritics for the spoken copy only ----
  eq(withTashkeel('النهارده يوم راحة. جلستك الجاية بكرة.'), 'النَّهَارْدَه يُوم رَاحَة. جَلْسِتَك الجَّايَّة بُكْرَة.', 'known words get diacritics');
  eq(withTashkeel('سيفيلامير، الصبح الساعة 8'), 'سيفيلامير، الصُّبْح السَّاعَة 8', 'medicine names and numbers kept as written');
  ok(todayScript({ firstName: 'أحمد', schedule: 'SMW', now: sat, nowMinutes: 600, meds: [], todayLogs: [], waterMl: 0, waterLimitMl: 0 }).every((p) => !/[ِْ]/.test(p)), 'on-screen text stays plain');

  // ---- which voice ----
  eq(ttsProviders(), [], 'no keys -> phone voice');
  process.env.AZURE_SPEECH_KEY = 'a'; process.env.AZURE_SPEECH_REGION = 'eastus';
  eq(ttsProviders().map((p) => p.name), ['azure'], 'Azure alone');
  process.env.ELEVENLABS_API_KEY = 'e'; process.env.ELEVENLABS_VOICE_ID = 'v1';
  eq(ttsProviders().map((p) => p.name), ['elevenlabs', 'azure'], 'ElevenLabs first, Azure as backup');
  ok(ttsProviders()[0].voiceTag.includes('v1'), 'changing the voice changes the saved clips');
  for (const k of ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID']) delete process.env[k];

  // ---- routes ----
  const acct = (uid: string, role: User['role']): StoredAccount => ({ username: uid, phone: `0100000${uid.length}${role.length}`, password: hashPassword('x-Pass-123'), user: { uid, role, username: uid, displayName: uid, language: 'ar', status: 'active', createdAt: '2026-01-01' } });
  await saveCloudAccounts([acct('pat', 'patient'), acct('doc', 'doctor'), acct('boss', 'admin')]);
  const auth = (uid: string, role: User['role']) => ({ Authorization: `Bearer ${createSessionToken({ uid, role })}` });
  const B = 'http://localhost:3000';

  eq((await adviceGet(new Request(`${B}/api/lab-advice`))).status, 401, 'advice needs sign-in');
  let j = await (await adviceGet(new Request(`${B}/api/lab-advice`, { headers: auth('pat', 'patient') }))).json();
  eq(Object.keys(j.advice).length, 24, 'patient hears every line without approval');
  ok(!('items' in j), 'patient never sees drafts');
  j = await (await adviceGet(new Request(`${B}/api/lab-advice`, { headers: auth('doc', 'doctor') }))).json();
  ok(j.items['phosphorus:high'].status === 'pending' && j.canReview === false, 'doctor sees drafts but cannot review');

  const put = (h: Record<string, string>, body: unknown) => advicePut(new Request(`${B}/api/lab-advice`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) }));
  eq((await put(auth('doc', 'doctor'), { key: 'phosphorus:high', text: 'x', status: 'approved' })).status, 403, 'only the super admin approves');
  eq((await put(auth('pat', 'patient'), { key: 'phosphorus:high', text: 'x', status: 'approved' })).status, 403, 'patients cannot approve');
  eq((await put(auth('boss', 'admin'), { key: 'nope:high', text: 'x', status: 'approved' })).status, 400, 'unknown key refused');
  eq((await put(auth('boss', 'admin'), { key: 'phosphorus:high', text: 'قلل الجبن والألبان.', status: 'approved' })).status, 200, 'super admin approves an edited line');
  await put(auth('boss', 'admin'), { key: 'hemoglobin:low', text: DRAFT_LAB_ADVICE['hemoglobin:low'], status: 'rejected' });
  j = await (await adviceGet(new Request(`${B}/api/lab-advice`, { headers: auth('pat', 'patient') }))).json();
  eq(j.advice['phosphorus:high'], 'قلل الجبن والألبان.', 'patient hears the edited line');
  ok(!('hemoglobin:low' in j.advice), 'a refused line is never said');

  // ---- voice ----
  const tts = (h: Record<string, string>, body: unknown) => ttsPost(new Request(`${B}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) }));
  eq((await tts({}, { text: 'أهلاً' })).status, 401, 'voice needs sign-in');
  eq((await tts(auth('pat', 'patient'), { text: '' })).status, 400, 'empty text refused');
  eq((await tts(auth('pat', 'patient'), { text: 'x'.repeat(701) })).status, 400, 'long text refused');
  eq((await tts(auth('pat', 'patient'), { text: 'أهلاً' })).status, 503, 'no Azure key -> app uses the phone voice');

  console.log(`TALKING-AVATAR SUITE PASSED: ${n} assertions.`);
}

run().catch((e) => {
  console.log(e);
  process.exit(1);
});
