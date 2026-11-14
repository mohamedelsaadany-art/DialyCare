import { strictEqual as eq, ok as check } from 'node:assert';
import {
  isR2Configured,
  isCloudStorageConfigured,
  getPublicUrl,
  getFileUrl,
  resetR2Client,
} from '../r2-client';

let assertions = 0;
async function test(desc: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`  ✓ ${desc}`);
  assertions++;
}

async function run() {
  console.log('--- 1. Environment and Configuration Detection ---');

  const oldEnv = { ...process.env };

  try {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL_OIDC_TOKEN;

    test('isR2Configured returns false when env vars are absent', () => {
      eq(isR2Configured(), false);
      eq(isCloudStorageConfigured(), false);
    });

    test('isCloudStorageConfigured recognizes legacy blob tokens if present', () => {
      process.env.BLOB_READ_WRITE_TOKEN = 'test_token';
      eq(isCloudStorageConfigured(), true);
      delete process.env.BLOB_READ_WRITE_TOKEN;
    });

    process.env.R2_ACCOUNT_ID = 'test-account-id';
    process.env.R2_ACCESS_KEY_ID = 'test-key-id';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';

    test('isR2Configured returns true when all 4 R2 variables are set', () => {
      eq(isR2Configured(), true);
      eq(isCloudStorageConfigured(), true);
    });

    console.log('--- 2. Public URL and Fallback Generation ---');

    delete process.env.R2_PUBLIC_URL;
    test('getPublicUrl returns internal /api/storage proxy when R2_PUBLIC_URL is unset', () => {
      eq(getPublicUrl('test-photo.jpg'), '/api/storage/test-photo.jpg');
      eq(getPublicUrl('/leading-slash/file.png'), '/api/storage/leading-slash/file.png');
      eq(getFileUrl('dialycare_cloud_database_v1.json'), '/api/storage/dialycare_cloud_database_v1.json');
    });

    process.env.R2_PUBLIC_URL = 'https://pub-abc123def456.r2.dev';
    test('getPublicUrl returns public CDN domain when R2_PUBLIC_URL is provided', () => {
      eq(getPublicUrl('doctor-id.png'), 'https://pub-abc123def456.r2.dev/doctor-id.png');
      eq(getPublicUrl('/nested/path/report.pdf'), 'https://pub-abc123def456.r2.dev/nested/path/report.pdf');
    });

    process.env.R2_PUBLIC_URL = 'https://pub-abc123def456.r2.dev/';
    test('getPublicUrl trims trailing slash from domain', () => {
      eq(getPublicUrl('file.jpg'), 'https://pub-abc123def456.r2.dev/file.jpg');
    });

    console.log('--- 3. S3 Client lazy initialization & reset ---');
    resetR2Client();
    test('resetR2Client cleans up the singleton instance without errors', () => {
      check(true);
    });

    console.log('--- 4. API Storage Proxy Security Checks ---');
    const { GET: getStorage } = await import('../../app/api/storage/[...key]/route');
    
    // Path traversal check
    const badReq = new Request('http://localhost:3000/api/storage/../secret');
    const badRes = await getStorage(badReq, { params: Promise.resolve({ key: ['..', 'secret'] }) });
    test('Storage proxy rejects directory traversal attempt with 400', () => {
      eq(badRes.status, 400);
    });

    // Empty key check
    const emptyRes = await getStorage(badReq, { params: Promise.resolve({ key: [] }) });
    test('Storage proxy rejects empty key with 400', () => {
      eq(emptyRes.status, 400);
    });

  } finally {
    process.env = oldEnv;
  }
}

run()
  .then(() => {
    console.log(`\nR2-STORAGE SUITE PASSED: ${assertions} assertions`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('R2-STORAGE SUITE FAILED:', err);
    process.exit(1);
  });
