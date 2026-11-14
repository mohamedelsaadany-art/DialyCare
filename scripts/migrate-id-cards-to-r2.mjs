import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

async function migrate() {
  console.log('=== ID CARD MIGRATION TO R2 STORAGE ===');
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const bucket = process.env.R2_BUCKET_NAME;

  const getJson = async (key) => {
    const res = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body.transformToByteArray();
    return JSON.parse(Buffer.from(bytes).toString('utf-8'));
  };

  const putJson = async (key, data) => {
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json; charset=utf-8',
    }));
  };

  const putBinary = async (key, buffer, contentType) => {
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
  };

  // 1. Read accounts and database
  console.log('Reading dialycare_cloud_accounts.json...');
  const accounts = await getJson('dialycare_cloud_accounts.json');
  console.log(`Loaded ${accounts.length} accounts.`);

  console.log('Reading dialycare_cloud_database_v1.json...');
  const db = await getJson('dialycare_cloud_database_v1.json');
  console.log(`Loaded database (patients: ${db.patients?.length}, accounts: ${db.accounts?.length}).`);

  // 2. Identify accounts with base64 idCardDataUrl
  let migratedCount = 0;
  for (const acc of accounts) {
    const dataUrl = acc.user?.idCardDataUrl;
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (match) {
        const rawExt = match[1].toLowerCase();
        const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
        const mime = `image/${rawExt}`;
        const buffer = Buffer.from(match[2], 'base64');
        const uid = acc.user.uid || acc.phone || acc.username;
        const key = `id-cards/${uid}.${ext}`;
        const publicUrl = `/api/storage/${key}`;

        console.log(`Found base64 ID card for [${acc.user?.displayName || acc.username}] (Size: ${(buffer.length / 1024).toFixed(1)} KB)`);
        console.log(`Uploading to R2: ${key}...`);
        await putBinary(key, buffer, mime);
        console.log(`Uploaded! Public proxy URL: ${publicUrl}`);

        acc.user.idCardDataUrl = publicUrl;
        migratedCount++;
      }
    }
  }

  // Also update in db.accounts
  if (Array.isArray(db.accounts)) {
    for (const acc of db.accounts) {
      const matchAcc = accounts.find(a => (a.user?.uid && a.user?.uid === acc.user?.uid) || a.username === acc.username);
      if (matchAcc && matchAcc.user?.idCardDataUrl) {
        acc.user.idCardDataUrl = matchAcc.user.idCardDataUrl;
      }
    }
  }

  console.log(`\nMigrated ${migratedCount} ID card images to R2 storage.`);

  // 3. Save updated accounts and database
  console.log('Writing optimized dialycare_cloud_accounts.json to R2...');
  await putJson('dialycare_cloud_accounts.json', accounts);

  console.log('Writing optimized dialycare_cloud_database_v1.json to R2...');
  await putJson('dialycare_cloud_database_v1.json', db);

  console.log('\n=== MIGRATION COMPLETE! VERIFYING NEW FILE SIZES ===');
  const res = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: 'dialycare_cloud_accounts.json' }));
  const accBytes = await res.Body.transformToByteArray();
  console.log(`New dialycare_cloud_accounts.json size: ${(accBytes.length / 1024).toFixed(1)} KB`);

  const resDb = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: 'dialycare_cloud_database_v1.json' }));
  const dbBytes = await resDb.Body.transformToByteArray();
  console.log(`New dialycare_cloud_database_v1.json size: ${(dbBytes.length / 1024).toFixed(1)} KB`);
}

migrate().catch(console.error);
