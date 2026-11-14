import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function audit() {
  console.log('=== 1. CLOUDFLARE R2 AUDIT ===');
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const r2Objects = await r2.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME }));
  console.log(`Bucket: "${process.env.R2_BUCKET_NAME}"`);
  for (const obj of r2Objects.Contents || []) {
    console.log(` - Key: ${obj.Key} | Size: ${obj.Size} bytes | LastModified: ${obj.LastModified}`);
  }

  const getR2Json = async (key) => {
    const res = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    const bytes = await res.Body.transformToByteArray();
    return JSON.parse(Buffer.from(bytes).toString('utf-8'));
  };

  const r2Accs = await getR2Json('dialycare_cloud_accounts.json');
  const r2Db = await getR2Json('dialycare_cloud_database_v1.json');
  console.log(`R2 Accounts Total: ${r2Accs.length}`);
  console.log(`R2 Patients Total: ${r2Db.patients.length}`);
  console.log(`R2 Database LastUpdated: ${r2Db.lastUpdated}`);

  console.log('\n=== 2. VERCEL BLOB AUDIT ===');
  const vercelUrlAccs = 'https://lryhru7zhai3bc2n.public.blob.vercel-storage.com/dialycare_cloud_accounts.json';
  const vercelUrlDb = 'https://lryhru7zhai3bc2n.public.blob.vercel-storage.com/dialycare_cloud_database_v1.json';

  try {
    const resAccs = await fetch(vercelUrlAccs, {
      headers: process.env.BLOB_READ_WRITE_TOKEN ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } : {},
    });
    console.log(`Vercel Accounts HTTP: ${resAccs.status} ${resAccs.statusText}`);
    const textAccs = await resAccs.text();
    if (resAccs.ok) {
      const data = JSON.parse(textAccs);
      console.log(`Vercel Accounts Total: ${data.length}`);
    } else {
      console.log(`Vercel Accounts Response: "${textAccs.trim()}"`);
    }
  } catch (err) {
    console.error('Vercel accounts fetch error:', err.message);
  }

  try {
    const resDb = await fetch(vercelUrlDb, {
      headers: process.env.BLOB_READ_WRITE_TOKEN ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } : {},
    });
    console.log(`Vercel Database HTTP: ${resDb.status} ${resDb.statusText}`);
    const textDb = await resDb.text();
    if (resDb.ok) {
      const data = JSON.parse(textDb);
      console.log(`Vercel Patients Total: ${data.patients?.length}`);
    } else {
      console.log(`Vercel Database Response: "${textDb.trim()}"`);
    }
  } catch (err) {
    console.error('Vercel DB fetch error:', err.message);
  }

  console.log('\n=== 3. COMPARISON & PATIENT ROSTER ===');
  console.log(`Total Patients in R2: ${r2Db.patients.length}`);
  r2Db.patients.forEach((p, i) => {
    console.log(`${(i + 1).toString().padStart(2, ' ')}. ${p.fullNameAr || p.fullName} | Phone: ${p.phone} | Schedule: ${p.dialysisSchedule} | ID: ${p.id.slice(0, 12)}...`);
  });
}

audit().catch(console.error);
