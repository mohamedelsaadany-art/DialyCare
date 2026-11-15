/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test suite for Rate Limiting (Task 004).
 * Run: npx tsx src/lib/__tests__/rate-limit.test.ts
 */
import assert from 'node:assert';

delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;

process.env.RATE_LIMIT_FORCE = '1';

import {
  checkRateLimit,
  getClientIp,
  peekRateLimit,
  __resetAllRateLimitsForTests,
} from '../rate-limit';
import { POST as loginRoute } from '../../app/api/auth/login/route';
import { POST as registerRoute } from '../../app/api/auth/register/route';
import { hashPassword } from '../server-auth';
import { getCloudAccounts, saveCloudAccounts } from '../cloud-store';
import type { StoredAccount } from '../types';

let assertions = 0;
function check(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  assertions++;
}
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.strictEqual(actual, expected, msg);
  assertions++;
}

async function run() {
  console.log('--- 1. Unit Tests ---');
  __resetAllRateLimitsForTests();

  const now = 100000;
  const windowMs = 5000;
  const limit = 3;

  const c1 = checkRateLimit('unit-key', limit, windowMs, now);
  eq(c1.ok, true, 'call 1 ok');
  eq(c1.retryAfterSeconds, 0, 'call 1 retryAfter is 0');

  const c2 = checkRateLimit('unit-key', limit, windowMs, now + 100);
  eq(c2.ok, true, 'call 2 ok');

  const c3 = checkRateLimit('unit-key', limit, windowMs, now + 200);
  eq(c3.ok, true, 'call 3 ok');

  check(peekRateLimit('unit-key', limit, now + 300), 'peekRateLimit is true at limit');

  const c4 = checkRateLimit('unit-key', limit, windowMs, now + 300);
  eq(c4.ok, false, 'call 4 over limit');
  check(c4.retryAfterSeconds > 0, 'retryAfterSeconds > 0');

  // After window expiration, call is ok again
  const c5 = checkRateLimit('unit-key', limit, windowMs, now + windowMs + 1);
  eq(c5.ok, true, 'call after window expiration ok');

  // Test getClientIp
  const req1 = new Request('http://localhost', {
    headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
  });
  eq(getClientIp(req1), '1.2.3.4', 'getClientIp parses first IP in x-forwarded-for');

  const req2 = new Request('http://localhost', {
    headers: { 'x-real-ip': '9.8.7.6' },
  });
  eq(getClientIp(req2), '9.8.7.6', 'getClientIp falls back to x-real-ip');

  const req3 = new Request('http://localhost');
  eq(getClientIp(req3), 'unknown', 'getClientIp returns unknown when headers missing');

  console.log('--- 2. Login Per Identifier Rate Limit ---');
  __resetAllRateLimitsForTests();

  // Seed two accounts
  const acc1: StoredAccount = {
    username: 'rate_target_user',
    phone: '01011118881',
    password: hashPassword('CorrectPass123!'),
    user: {
      uid: 'uid-target-user',
      role: 'patient',
      status: 'active',
      username: 'rate_target_user',
      phone: '01011118881',
      displayName: 'Rate Target User',
      language: 'ar',
      createdAt: new Date().toISOString(),
    },
  };
  const acc2: StoredAccount = {
    username: 'rate_other_user',
    phone: '01011118882',
    password: hashPassword('OtherPass123!'),
    user: {
      uid: 'uid-other-user',
      role: 'patient',
      status: 'active',
      username: 'rate_other_user',
      phone: '01011118882',
      displayName: 'Rate Other User',
      language: 'ar',
      createdAt: new Date().toISOString(),
    },
  };
  const existingAccounts = await getCloudAccounts();
  await saveCloudAccounts([...existingAccounts, acc1, acc2]);

  // 10 failed logins for target user, each with distinct IP to avoid IP limit
  for (let i = 1; i <= 10; i++) {
    const res = await loginRoute(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': `10.0.1.${i}`,
        },
        body: JSON.stringify({
          identifier: 'rate_target_user',
          password: 'WrongPassword!',
        }),
      })
    );
    eq(res.status, 401, `failed login attempt ${i} returns 401`);
  }

  // 11th attempt with CORRECT password for target user returns 429
  const res11 = await loginRoute(
    new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.1.99',
      },
      body: JSON.stringify({
        identifier: 'rate_target_user',
        password: 'CorrectPass123!',
      }),
    })
  );
  eq(res11.status, 429, '11th attempt for target user returns 429');
  const body11 = (await res11.json()) as any;
  eq(body11.error, 'tooManyAttempts', 'returns tooManyAttempts error');

  // A different identifier still logs in with 200
  const resOther = await loginRoute(
    new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.1.100',
      },
      body: JSON.stringify({
        identifier: 'rate_other_user',
        password: 'OtherPass123!',
      }),
    })
  );
  eq(resOther.status, 200, 'different identifier logs in with 200');

  console.log('--- 3. Login Per IP Rate Limit ---');
  __resetAllRateLimitsForTests();

  const fixedIp = '192.168.100.55';
  // 30 requests from one IP
  for (let i = 1; i <= 30; i++) {
    const res = await loginRoute(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': fixedIp,
        },
        body: JSON.stringify({
          identifier: `diff_user_${i}`,
          password: 'SomePassword123!',
        }),
      })
    );
    check(res.status === 401 || res.status === 200, `request ${i} from fixed ip passed`);
  }

  // 31st request from same IP returns 429
  const res31 = await loginRoute(
    new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': fixedIp,
      },
      body: JSON.stringify({
        identifier: 'diff_user_31',
        password: 'SomePassword123!',
      }),
    })
  );
  eq(res31.status, 429, '31st request from fixed ip returns 429');
  const body31 = (await res31.json()) as any;
  eq(body31.error, 'tooManyAttempts', 'IP rate limit error is tooManyAttempts');

  console.log('--- 4. Register Per IP Rate Limit ---');
  __resetAllRateLimitsForTests();

  const regIp = '172.20.10.15';
  // 10 registrations from one IP
  for (let i = 1; i <= 10; i++) {
    const res = await registerRoute(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': regIp,
        },
        body: JSON.stringify({
          type: 'patient',
          data: {
            fullName: `Test Pat ${i}`,
            phone: `010888800${i.toString().padStart(2, '0')}`,
            password: 'ValidPassword123!',
          },
        }),
      })
    );
    eq(res.status, 200, `registration ${i} returns 200`);
  }

  // 11th registration from same IP returns 429
  const resReg11 = await registerRoute(
    new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': regIp,
      },
      body: JSON.stringify({
        type: 'patient',
        data: {
          fullName: 'Test Pat 11',
          phone: '01088880099',
          password: 'ValidPassword123!',
        },
      }),
    })
  );
  eq(resReg11.status, 429, '11th registration returns 429');
  const bodyReg11 = (await resReg11.json()) as any;
  eq(bodyReg11.error, 'tooManyAttempts', 'register rate limit error is tooManyAttempts');

  console.log('--- 5. Disabled Rate Limiting ---');
  __resetAllRateLimitsForTests();
  delete process.env.RATE_LIMIT_FORCE;

  for (let i = 1; i <= 50; i++) {
    const checkRes = checkRateLimit('disabled-test-key', 3, 1000);
    eq(checkRes.ok, true, `call ${i} is ok when disabled`);
    eq(checkRes.retryAfterSeconds, 0, `call ${i} retryAfter is 0`);
  }

  process.env.RATE_LIMIT_FORCE = '1';

  console.log(`\nRATE-LIMIT SUITE PASSED: ${assertions} assertions.\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
