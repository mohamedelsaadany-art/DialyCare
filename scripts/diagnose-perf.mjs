import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function diagnose() {
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  console.log('--- 1. R2 Object Sizes ---');
  const res = await r2.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME }));
  for (const item of res.Contents || []) {
    console.log(`${item.Key}: ${(item.Size / 1024).toFixed(1)} KB`);
  }

  const getJson = async (key) => {
    const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
    const response = await r2.send(cmd);
    const bytes = await response.Body.transformToByteArray();
    return JSON.parse(Buffer.from(bytes).toString('utf-8'));
  };

  const db = await getJson('dialycare_cloud_database_v1.json');
  console.log('\n--- 2. Database Breakdown ---');
  for (const [key, val] of Object.entries(db)) {
    if (Array.isArray(val)) {
      const serialized = JSON.stringify(val);
      console.log(`db.${key}: ${val.length} items, ${(serialized.length / 1024).toFixed(1)} KB`);
      // check top item sizes
      if (val.length > 0) {
        let maxItem = 0;
        let maxItemSummary = '';
        for (const item of val) {
          const s = JSON.stringify(item);
          if (s.length > maxItem) {
            maxItem = s.length;
            maxItemSummary = `${item.id || item.patientId || item.fullName || 'item'}: ${(s.length / 1024).toFixed(1)} KB`;
          }
        }
        console.log(`   largest item in ${key}: ${maxItemSummary}`);
      }
    }
  }

  const accs = await getJson('dialycare_cloud_accounts.json');
  console.log('\n--- 3. Accounts Breakdown ---');
  console.log(`Accounts total: ${accs.length}`);
  for (const acc of accs) {
    const s = JSON.stringify(acc);
    if (s.length > 5000) {
      console.log(`Account ${acc.user?.username || acc.user?.name || acc.user?.id}: ${(s.length / 1024).toFixed(1)} KB`);
      // check if avatar or other large fields exist
      if (acc.user?.avatar) {
        console.log(`   avatar length: ${(acc.user.avatar.length / 1024).toFixed(1)} KB`);
      }
    }
  }
}

diagnose().catch(console.error);
