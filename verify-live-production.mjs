import { chromium } from 'playwright';

async function runLiveVerification() {
  console.log('Testing live production at https://dialycare.vercel.app ...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // 1. Visit Login Page
    console.log('1. Checking live /ar/login ...');
    await page.goto('https://dialycare.vercel.app/ar/login', { waitUntil: 'domcontentloaded' });

    // Verify Demo buttons are completely absent
    const demoBtnAdmin = await page.$('text=تعبئة حساب الطبيب المشرف');
    const demoBtnPatient = await page.$('text=تعبئة حساب المريض التجريبي');
    const demoHeading = await page.$('text=بيانات الدخول التجريبية');

    if (demoBtnAdmin || demoBtnPatient || demoHeading) {
      throw new Error('FAILED: Demo buttons found on live production!');
    }
    console.log('   ✓ Verified: Zero demo buttons on live /ar/login.');

    // Verify Sign In and Sign Up tabs
    const signInTab = await page.waitForSelector('button:has-text("تسجيل الدخول")');
    const signUpTab = await page.waitForSelector('button:has-text("إنشاء حساب جديد")');
    if (!signInTab || !signUpTab) throw new Error('Tabs missing');
    console.log('   ✓ Verified: Sign In and Sign Up tabs are live.');

    // 2. Test Doctor Registration Form
    console.log('2. Testing live Doctor Registration UI...');
    await signUpTab.click();
    const docRole = await page.waitForSelector('button:has-text("طبيب / كادر طبي")');
    await docRole.click();
    await page.waitForSelector('label:has-text("صورة بطاقة النقابة أو كارنيه الكادر الطبي")');
    console.log('   ✓ Verified: Doctor registration form with Syndicate ID upload is live.');

    // 3. Test Patient 3-Step Registration Form
    console.log('3. Testing live Patient 3-Step Registration UI...');
    const patRole = await page.waitForSelector('button:has-text("مريض غسيل كلوي")');
    await patRole.click();
    await page.waitForSelector('text=البيانات الشخصية');
    await page.waitForSelector('text=الملف الكلوي');
    await page.waitForSelector('text=كلمة المرور');
    console.log('   ✓ Verified: Patient 3-step registration wizard is live.');

    // 4. Test Super Admin Login
    console.log('4. Testing live Super Admin Login...');
    await signInTab.click();
    await page.fill('input[autocomplete="username"]', 'admin');
    await page.fill('input[autocomplete="current-password"]', 'admin123');
    const submitBtn = await page.waitForSelector('button[type="submit"]:has-text("تسجيل الدخول")');
    await submitBtn.click();
    await page.waitForURL('**/ar/admin', { timeout: 10000 });
    console.log('   ✓ Verified: Live Super Admin login successful.');

    // 5. Test Live Approvals Center
    console.log('5. Testing live Approvals Center at /ar/admin/approvals ...');
    await page.goto('https://dialycare.vercel.app/ar/admin/approvals', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=مركز مراجعة واعتماد الحسابات');
    await page.waitForSelector('text=هاتف المدير المسؤول');
    await page.waitForSelector('text=+201080641670');
    console.log('   ✓ Verified: Live Approvals Center loaded with Senior Resident phone +201080641670.');

    // 6. Test Doctor In-Clinic Patient Credentials Generator
    console.log('6. Testing live /ar/admin/patients/new auto-credentials...');
    await page.goto('https://dialycare.vercel.app/ar/admin/patients/new', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("توليد تلقائي لبيانات الدخول")');
    console.log('   ✓ Verified: Auto-generate credentials button is live.');

    // 7. Test Admin Settings Password Rotation Section
    console.log('7. Testing live /ar/admin/settings security section...');
    await page.goto('https://dialycare.vercel.app/ar/admin/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=الأمان وكلمة مرور الإدارة الرئيسية');
    await page.waitForSelector('button:has-text("تحديث كلمة المرور")');
    console.log('   ✓ Verified: Live Super Admin password rotation section is active.');

    console.log('\n================================================================');
    console.log('LIVE PRODUCTION VERIFICATION COMPLETED WITH 100% SUCCESS!');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runLiveVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Live verification failed:', err);
    process.exit(1);
  });
