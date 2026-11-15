/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Verification for Staff ID-card upload validation and uid-keying hardening (Task 003).
 *
 * Fully offline against in-memory cloud store (no Blob / R2 env vars).
 * Run: npx tsx src/lib/__tests__/register-idcard.test.ts
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;
delete process.env.R2_ACCOUNT_ID;
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;
delete process.env.R2_BUCKET_NAME;
delete process.env.CLOUDFLARE_R2_BUCKET_NAME;
delete process.env.R2_PUBLIC_URL;

import { POST as registerRoute } from '../../app/api/auth/register/route';
import { getCloudAccounts } from '../cloud-store';

let assertions = 0;
function check(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  assertions++;
}
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.strictEqual(actual, expected, msg);
  assertions++;
}

function req(body: unknown): Request {
  return new Request('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function run() {
  console.log('--- 1. ID card not sent -> 200 ---');
  const res1 = await registerRoute(
    req({
      type: 'doctor',
      data: {
        fullName: 'Doctor One No Card',
        username: 'doc_nocard_003',
        phone: '01099990001',
        password: 'Password123!',
      },
    })
  );
  eq(res1.status, 200, 'no id card returns 200');
  const body1 = (await res1.json()) as any;
  eq(body1.success, true, 'registration succeeded');
  const accounts1 = await getCloudAccounts();
  const acc1 = accounts1.find((a) => a.user?.username === 'doc_nocard_003');
  check(Boolean(acc1), 'account 1 created');
  eq(acc1?.user?.idCardDataUrl, undefined, 'idCardDataUrl is undefined when not sent');

  console.log('--- 2. Small valid PNG data URL -> 200 and data:image/png;base64, stored ---');
  const smallPng = `data:image/png;base64,${Buffer.from('small-png-binary-data').toString('base64')}`;
  const res2 = await registerRoute(
    req({
      type: 'doctor',
      data: {
        fullName: 'Doctor Two Valid PNG',
        username: 'doc_validpng_003',
        phone: '01099990002',
        password: 'Password123!',
        idCardDataUrl: smallPng,
      },
    })
  );
  eq(res2.status, 200, 'small valid png returns 200');
  const body2 = (await res2.json()) as any;
  eq(body2.success, true, 'registration 2 succeeded');
  const accounts2 = await getCloudAccounts();
  const acc2 = accounts2.find((a) => a.user?.username === 'doc_validpng_003');
  check(Boolean(acc2), 'account 2 created');
  check(
    typeof acc2?.user?.idCardDataUrl === 'string' &&
      acc2.user.idCardDataUrl.startsWith('data:image/png;base64,'),
    'idCardDataUrl stored starts with data:image/png;base64,'
  );
  const existingDocUid = acc2!.user.uid;
  const existingDocCardUrl = acc2!.user.idCardDataUrl;

  console.log('--- 3. SVG data URL -> 400 invalidIdCard ---');
  const res3 = await registerRoute(
    req({
      type: 'doctor',
      data: {
        fullName: 'Doctor SVG Attempt',
        username: 'doc_svg_003',
        phone: '01099990003',
        password: 'Password123!',
        idCardDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
      },
    })
  );
  eq(res3.status, 400, 'svg returns 400');
  const body3 = (await res3.json()) as any;
  eq(body3.error, 'invalidIdCard', 'svg rejected with invalidIdCard');

  console.log('--- 4. javascript: URI -> 400 invalidIdCard ---');
  const res4 = await registerRoute(
    req({
      type: 'doctor',
      data: {
        fullName: 'Doctor XSS Attempt',
        username: 'doc_xss_003',
        phone: '01099990004',
        password: 'Password123!',
        idCardDataUrl: 'javascript:alert(1)',
      },
    })
  );
  eq(res4.status, 400, 'javascript: URI returns 400');
  const body4 = (await res4.json()) as any;
  eq(body4.error, 'invalidIdCard', 'javascript: URI rejected with invalidIdCard');

  console.log('--- 5. PNG decoding to >2MB (2MB + 1 byte) -> 400 idCardTooLarge ---');
  const largeBuf = Buffer.alloc(2 * 1024 * 1024 + 1, 0x62);
  const largePng = `data:image/png;base64,${largeBuf.toString('base64')}`;
  const res5 = await registerRoute(
    req({
      type: 'doctor',
      data: {
        fullName: 'Doctor Oversized Card',
        username: 'doc_large_003',
        phone: '01099990005',
        password: 'Password123!',
        idCardDataUrl: largePng,
      },
    })
  );
  eq(res5.status, 400, 'oversized card returns 400');
  const body5 = (await res5.json()) as any;
  eq(body5.error, 'idCardTooLarge', 'oversized card rejected with idCardTooLarge');

  console.log('--- 6. Valid PNG with data.uid set to already existing account uid -> 200, existing account untouched ---');
  const anotherPng = `data:image/png;base64,${Buffer.from('impersonator-card-content').toString('base64')}`;
  const res6 = await registerRoute(
    req({
      type: 'doctor',
      data: {
        uid: existingDocUid,
        fullName: 'Doctor Two Valid PNG',
        username: 'doc_validpng_003',
        phone: '01099990002',
        password: 'Password123!',
        idCardDataUrl: anotherPng,
      },
    })
  );
  eq(res6.status, 200, 'replay registration returns 200');
  const body6 = (await res6.json()) as any;
  eq(body6.success, true, 'registration returns success');
  eq(body6.user.uid, existingDocUid, 'returns existing account uid');

  // Verify existing account card is completely unchanged
  const accounts6 = await getCloudAccounts();
  const existingAccAfter = accounts6.find((a) => a.user?.uid === existingDocUid);
  check(Boolean(existingAccAfter), 'existing account still exists');
  eq(existingAccAfter?.user?.idCardDataUrl, existingDocCardUrl, 'existing account idCardDataUrl is unchanged');

  console.log('--- 7. Attacker attempting to claim existing uid with different username -> 409, card untouched ---');
  const res7 = await registerRoute(
    req({
      type: 'doctor',
      data: {
        uid: existingDocUid,
        fullName: 'Attacker Doctor',
        username: 'doc_attacker_003',
        phone: '01099990007',
        password: 'Password123!',
        idCardDataUrl: anotherPng,
      },
    })
  );
  eq(res7.status, 409, 'different username with existing uid returns 409 conflict');
  const accounts7 = await getCloudAccounts();
  const existingAccAfter7 = accounts7.find((a) => a.user?.uid === existingDocUid);
  eq(existingAccAfter7?.user?.idCardDataUrl, existingDocCardUrl, 'card still unchanged after 409 conflict');

  console.log(`\nREGISTER-IDCARD SUITE PASSED: ${assertions} assertions.\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
