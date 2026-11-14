/**
 * Cloudflare R2 Migration Script
 * Migrates DialyCare production accounts and unified database to Cloudflare R2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME || 'dialycare';

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('Error: Missing required Cloudflare R2 environment variables:');
  console.error(' - R2_ACCOUNT_ID');
  console.error(' - R2_ACCESS_KEY_ID');
  console.error(' - R2_SECRET_ACCESS_KEY');
  console.error(' - R2_BUCKET_NAME (optional, defaults to "dialycare")');
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const BACKUP_DIRS = [
  path.resolve(__dirname, '../../dialycare-backups/20261114-1332-pre-release5-b13'),
  path.resolve(__dirname, '../../dialycare-backups/20261114-1323-pre-release4-b11'),
  path.resolve(__dirname, '../../dialycare-backups/20261114-1311-pre-release3'),
];

let sourceDir = null;
for (const dir of BACKUP_DIRS) {
  if (fs.existsSync(path.join(dir, 'dialycare_cloud_database_v1.json'))) {
    sourceDir = dir;
    break;
  }
}

if (!sourceDir) {
  console.error('Error: Could not find production backup directory.');
  process.exit(1);
}

console.log(`Using backup data source: ${sourceDir}`);

async function migrateFile(filename) {
  const filePath = path.join(sourceDir, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`File ${filename} not found in ${sourceDir}, skipping.`);
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`Uploading ${filename} (${(content.length / 1024).toFixed(1)} KB) to R2 bucket "${bucket}"...`);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: filename,
      Body: content,
      ContentType: 'application/json; charset=utf-8',
    })
  );

  console.log(`Successfully uploaded ${filename} to R2.`);

  // Verify read
  const res = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: filename,
    })
  );

  const bytes = await res.Body.transformToByteArray();
  const readBack = Buffer.from(bytes).toString('utf-8');
  const parsed = JSON.parse(readBack);

  if (Array.isArray(parsed)) {
    console.log(`Verification: ${filename} holds ${parsed.length} items.`);
  } else if (typeof parsed === 'object' && parsed !== null) {
    console.log(`Verification: ${filename} holds ${parsed.patients?.length || 0} patients, ${parsed.accounts?.length || 0} accounts, lastUpdated: ${parsed.lastUpdated}`);
  }
}

async function main() {
  console.log('Starting Cloudflare R2 Data Migration...');
  await migrateFile('dialycare_cloud_accounts.json');
  await migrateFile('dialycare_cloud_database_v1.json');
  console.log('\nMigration complete! Cloudflare R2 is now populated and ready.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
