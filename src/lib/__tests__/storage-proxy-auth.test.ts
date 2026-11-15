/**
 * Storage proxy authorization, allowlist gating, and parameter validation.
 * Run: npx tsx src/lib/__tests__/storage-proxy-auth.test.ts
 */
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.VERCEL_OIDC_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.SESSION_SECRET;
delete process.env.VERCEL;
delete process.env.R2_ACCOUNT_ID;
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;
delete process.env.R2_BUCKET_NAME;
delete process.env.R2_PUBLIC_URL;

import assert from 'node:assert';
import { createSessionToken } from '../server-auth';
import { getCloudAccounts, saveCloudAccounts } from '../cloud-store';
import { getPublicUrl } from '../r2-client';
import { GET as getStorage } from '../../app/api/storage/[...key]/route';
import type { StoredAccount, User } from '../types';

let assertions = 0;
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.strictEqual(actual, expected, msg);
  assertions++;
}

const originalWarn = console.warn;
console.warn = () => {};

const BASE = 'http://localhost:3000';
function bearer(uid: string, role: User['role']): Record<string, string> {
  const t = createSessionToken({ uid, role });
  if (!t) throw new Error('no key');
  return { Authorization: `Bearer ${t}` };
}

function req(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: 'GET',
    headers,
  });
}

async function run(): Promise<void> {
  // Seed a doctor (non-admin staff) and a patient account
  const doctor: StoredAccount = {
    username: 'dr_proxy_auth',
    phone: '01011110000',
    password: 'DrPassword2026!',
    user: {
      uid: 'doc-proxy-1',
      role: 'doctor',
      username: 'dr_proxy_auth',
      displayName: 'Dr Proxy',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
  const patient: StoredAccount = {
    username: 'patient_proxy_auth',
    phone: '01022220000',
    password: 'PatientPassword2026!',
    user: {
      uid: 'patient-proxy-1',
      role: 'patient',
      username: 'patient_proxy_auth',
      displayName: 'Patient Proxy',
      language: 'ar',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
  await saveCloudAccounts([...(await getCloudAccounts()), doctor, patient]);

  const ADMIN = () => bearer('admin-1', 'admin');
  const DOC = () => bearer('doc-proxy-1', 'doctor');
  const PATIENT = () => bearer('patient-proxy-1', 'patient');

  console.log('--- 1. Required Table Cases ---');

  // 1. no session -> 401
  {
    const res = await getStorage(
      req('/api/storage/id-cards/x.png'),
      { params: Promise.resolve({ key: ['id-cards', 'x.png'] }) }
    );
    eq(res.status, 401, 'no session accessing id-cards/x.png returns 401');
  }

  // 2. patient -> 403
  {
    const res = await getStorage(
      req('/api/storage/id-cards/x.png', PATIENT()),
      { params: Promise.resolve({ key: ['id-cards', 'x.png'] }) }
    );
    eq(res.status, 403, 'patient accessing id-cards/x.png returns 403');
  }

  // 3. doctor (non-admin staff) -> 403
  {
    const res = await getStorage(
      req('/api/storage/id-cards/x.png', DOC()),
      { params: Promise.resolve({ key: ['id-cards', 'x.png'] }) }
    );
    eq(res.status, 403, 'doctor accessing id-cards/x.png returns 403');
  }

  // 4. admin -> dialycare_cloud_database_v1.json -> 404
  {
    const res = await getStorage(
      req('/api/storage/dialycare_cloud_database_v1.json', ADMIN()),
      { params: Promise.resolve({ key: ['dialycare_cloud_database_v1.json'] }) }
    );
    eq(res.status, 404, 'admin accessing database json returns 404');
  }

  // 5. admin -> dialycare_cloud_accounts.json -> 404
  {
    const res = await getStorage(
      req('/api/storage/dialycare_cloud_accounts.json', ADMIN()),
      { params: Promise.resolve({ key: ['dialycare_cloud_accounts.json'] }) }
    );
    eq(res.status, 404, 'admin accessing accounts json returns 404');
  }

  // 6. admin -> uploads/evil.html -> 404
  {
    const res = await getStorage(
      req('/api/storage/uploads/evil.html', ADMIN()),
      { params: Promise.resolve({ key: ['uploads', 'evil.html'] }) }
    );
    eq(res.status, 404, 'admin accessing uploads/evil.html returns 404');
  }

  // 7. admin -> id-cards/x.svg -> 404
  {
    const res = await getStorage(
      req('/api/storage/id-cards/x.svg', ADMIN()),
      { params: Promise.resolve({ key: ['id-cards', 'x.svg'] }) }
    );
    eq(res.status, 404, 'admin accessing svg returns 404');
  }

  // 8. admin -> ['..', 'secret'] -> 400
  {
    const res = await getStorage(
      req('/api/storage/../secret', ADMIN()),
      { params: Promise.resolve({ key: ['..', 'secret'] }) }
    );
    eq(res.status, 400, 'admin path traversal returns 400');
  }

  // 9. admin -> [] -> 400
  {
    const res = await getStorage(
      req('/api/storage', ADMIN()),
      { params: Promise.resolve({ key: [] }) }
    );
    eq(res.status, 400, 'admin empty key returns 400');
  }

  // 10. admin -> id-cards/x.png -> 503 (passes auth & allowlist, R2 not configured in memory test)
  {
    const res = await getStorage(
      req('/api/storage/id-cards/x.png', ADMIN()),
      { params: Promise.resolve({ key: ['id-cards', 'x.png'] }) }
    );
    eq(res.status, 503, 'admin accessing allowed image returns 503 when R2 is unconfigured');
  }

  console.log('--- 2. Public URL Assertion ---');
  process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
  eq(
    getPublicUrl('x.png'),
    '/api/storage/x.png',
    'getPublicUrl always returns /api/storage/ even when R2_PUBLIC_URL is set'
  );
  delete process.env.R2_PUBLIC_URL;
  console.warn = originalWarn;
}

run()
  .then(() => {
    console.log(`\nSTORAGE-PROXY-AUTH SUITE PASSED: ${assertions} assertions`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('STORAGE-PROXY-AUTH SUITE FAILED:', err);
    process.exit(1);
  });
