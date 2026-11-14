async function benchmark() {
  console.log('Testing live production response times...');

  // 1. Login as admin
  const t0 = Date.now();
  const res = await fetch('https://waslity.vercel.app/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
  });
  const tLogin = Date.now() - t0;
  const cookie = res.headers.get('set-cookie');
  console.log(`Login status: ${res.status}, time: ${tLogin}ms`);

  if (!cookie) {
    console.error('Login failed! Response:', await res.text());
    return;
  }

  // 2. Measure /api/auth/session
  const t1 = Date.now();
  const sessionRes = await fetch('https://waslity.vercel.app/api/auth/session', {
    headers: { cookie },
  });
  const tSession = Date.now() - t1;
  console.log(`Session check: status ${sessionRes.status}, time: ${tSession}ms`);

  // 3. Measure /api/sync GET
  const t2 = Date.now();
  const syncRes = await fetch('https://waslity.vercel.app/api/sync', {
    headers: { cookie },
  });
  const tSync = Date.now() - t2;
  const syncText = await syncRes.text();
  console.log(`Sync (Staff view): status ${syncRes.status}, time: ${tSync}ms, payload: ${(syncText.length / 1024).toFixed(1)} KB`);

  // 4. Measure /api/admin/archive GET
  const t3 = Date.now();
  const archiveRes = await fetch('https://waslity.vercel.app/api/admin/archive', {
    headers: { cookie },
  });
  const tArchive = Date.now() - t3;
  const archiveText = await archiveRes.text();
  console.log(`Archive: status ${archiveRes.status}, time: ${tArchive}ms, payload: ${(archiveText.length / 1024).toFixed(1)} KB`);

  // 5. Measure a second /api/sync GET to check cache / repeatability
  const t4 = Date.now();
  const syncRes2 = await fetch('https://waslity.vercel.app/api/sync', {
    headers: { cookie },
  });
  const tSync2 = Date.now() - t4;
  console.log(`Sync 2nd call: status ${syncRes2.status}, time: ${tSync2}ms`);
}

benchmark().catch(console.error);
