import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function main() {
  const bucket = process.env.R2_BUCKET_NAME || 'waslity';

  console.log(`Checking R2 bucket "${bucket}"...`);

  // Verify accounts
  const accRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: 'dialycare_cloud_accounts.json' }));
  const accBytes = await accRes.Body.transformToByteArray();
  const accounts = JSON.parse(Buffer.from(accBytes).toString('utf-8'));
  console.log(`✓ Accounts loaded: ${accounts.length} accounts found`);

  // Verify database
  const dbRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: 'dialycare_cloud_database_v1.json' }));
  const dbBytes = await dbRes.Body.transformToByteArray();
  const db = JSON.parse(Buffer.from(dbBytes).toString('utf-8'));
  console.log(`✓ Unified database loaded: ${db.patients?.length} patients, ${db.accounts?.length} accounts found`);
  console.log(`✓ Last updated: ${db.lastUpdated}`);
  console.log('\nCloudflare R2 is 100% OPERATIONAL AND VERIFIED!');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
