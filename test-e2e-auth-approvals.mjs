import { chromium } from 'playwright';

async function runE2E() {
  console.log('Starting Playwright E2E verification on http://localhost:3001 ...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // ------------------------------------------------------------------------
    // Journey 1: Verify Login Page & Removal of Demo Buttons
    // ------------------------------------------------------------------------
    console.log('1. Checking /ar/login page layout and demo button removal...');
    await page.goto('http://localhost:3001/ar/login', { waitUntil: 'networkidle' });

    // Verify page title / heading
    const titleText = await page.textContent('body');
    if (!titleText.includes('دايلي كير') && !titleText.includes('تسجيل الدخول')) {
      throw new Error('Login page title not rendered properly');
    }

    // Verify Demo buttons are completely gone
    const demoBtnAdmin = await page.$('text=تعبئة حساب الطبيب المشرف');
    const demoBtnPatient = await page.$('text=تعبئة حساب المريض التجريبي');
    const demoHeading = await page.$('text=بيانات الدخول التجريبية');

    if (demoBtnAdmin || demoBtnPatient || demoHeading) {
      throw new Error('FAILED: Demo credentials buttons or headings are still present on /ar/login!');
    }
    console.log('   ✓ Verified: Zero demo buttons found on login page.');

    // ------------------------------------------------------------------------
    // Journey 2: Doctor Self-Registration
    // ------------------------------------------------------------------------
    console.log('2. Testing Doctor self-registration...');
    // Click Sign Up tab
    const signUpTab = await page.waitForSelector('button:has-text("إنشاء حساب جديد")');
    await signUpTab.click();

    // Select Doctor Role
    const doctorRoleBtn = await page.waitForSelector('button:has-text("طبيب / كادر طبي")');
    await doctorRoleBtn.click();

    // Fill doctor fields
    const docPhone = '01011223344';
    await page.fill('input[placeholder*="د. أحمد"]', 'د. سامح عبد الفتاح');
    await page.fill('input[type="tel"]', docPhone);
    await page.fill('input[placeholder*="doctor@hospital"]', 'sameh@kasralainy.eg');
    await page.fill('input[placeholder*="أخصائي أمراض كلى"]', 'استشاري أمراض كلى');
    await page.fill('input[placeholder*="مستشفى القصر العيني"]', 'مستشفى الدمرداش');

    const passInputs = await page.$$('input[type="password"]');
    if (passInputs.length < 2) throw new Error('Expected password and confirm password inputs');
    await passInputs[0].fill('DoctorPass2026');
    await passInputs[1].fill('DoctorPass2026');

    // Submit doctor registration
    const submitDocBtn = await page.waitForSelector('button:has-text("إرسال طلب تسجيل الطبيب")');
    await submitDocBtn.click();

    // Verify success card appears
    await page.waitForSelector('text=تم إرسال طلب الانضمام بنجاح');
    const waLink = await page.getAttribute('a:has-text("تواصل مع الإدارة الطبية عبر واتساب")', 'href');
    if (!waLink || !waLink.includes('wa.me/201552885823')) {
      throw new Error(`Expected WhatsApp link to target +201552885823, got: ${waLink}`);
    }
    console.log('   ✓ Verified: Doctor registered; WhatsApp alert link targets +201552885823.');

    // ------------------------------------------------------------------------
    // Journey 3: Doctor Attempts to Sign In before Approval -> Pending Card
    // ------------------------------------------------------------------------
    console.log('3. Testing pending login guard for unapproved doctor...');
    const backToLoginBtn = await page.waitForSelector('button:has-text("العودة لتسجيل الدخول")');
    await backToLoginBtn.click();

    // Fill doctor credentials
    const idInput = await page.waitForSelector('input[autocomplete="username"]');
    await idInput.fill(docPhone);
    const passInput = await page.waitForSelector('input[autocomplete="current-password"]');
    await passInput.fill('DoctorPass2026');

    const signInBtn = await page.waitForSelector('button[type="submit"]:has-text("تسجيل الدخول")');
    await signInBtn.click();

    // Verify Pending Review Alert Card appears
    await page.waitForSelector('text=حسابك قيد المراجعة والاعتماد السريري');
    console.log('   ✓ Verified: Pending doctor login blocked with clinical review card.');

    // ------------------------------------------------------------------------
    // Journey 4: Super Admin Login & Approval Dashboard
    // ------------------------------------------------------------------------
    console.log('4. Testing Super Admin login and /ar/admin/approvals ...');
    // Dismiss pending card
    const dismissBtn = await page.waitForSelector('button:has-text("العودة لتسجيل الدخول")');
    await dismissBtn.click();

    // Log in as Super Admin
    await page.fill('input[autocomplete="username"]', 'admin');
    await page.fill('input[autocomplete="current-password"]', 'admin123');
    const adminLoginBtn = await page.waitForSelector('button[type="submit"]:has-text("تسجيل الدخول")');
    await adminLoginBtn.click();

    // Wait for redirect to /ar/admin
    await page.waitForURL('**/ar/admin', { timeout: 8000 });
    console.log('   ✓ Verified: Super Admin authenticated successfully.');

    // Navigate to /ar/admin/approvals
    await page.goto('http://localhost:3001/ar/admin/approvals', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=مركز مراجعة واعتماد الحسابات');

    // Check that pending doctor is in the list
    await page.waitForSelector('text=د. سامح عبد الفتاح');
    console.log('   ✓ Verified: Pending doctor visible in Super Admin approval queue.');

    // Click Approve button
    const approveBtn = await page.waitForSelector('button:has-text("اعتماد وتفعيل الطبيب")');
    await approveBtn.click();

    // Wait for approval confirmation toast / change
    await page.waitForSelector('text=تم اعتماد وتفعيل حساب');
    console.log('   ✓ Verified: Doctor account approved by Super Admin.');

    // ------------------------------------------------------------------------
    // Journey 5: Doctor Portal In-Clinic Patient Provisioning
    // ------------------------------------------------------------------------
    console.log('5. Testing Doctor in-clinic patient registration & auto-credentials...');
    await page.goto('http://localhost:3001/ar/admin/patients/new', { waitUntil: 'networkidle' });

    await page.fill('input[placeholder="e.g. Ahmed Mahmoud"]', 'Tariq Nabil');
    await page.fill('input[placeholder="مثال: أحمد محمود"]', 'طارق نبيل سيد');
    await page.fill('input[placeholder="01012345678"]', '01065432109');
    await page.fill('input[placeholder="70.5"]', '72.5');

    // Click auto-generate credentials
    const autoGenBtn = await page.waitForSelector('button:has-text("توليد تلقائي لبيانات الدخول")');
    await autoGenBtn.click();

    const usernameVal = await page.inputValue('input[placeholder="01012345678"]');
    const passVal = await page.inputValue('input[placeholder="01012345678aBc"]');

    if (usernameVal !== '01065432109') throw new Error(`Expected username to be phone, got: ${usernameVal}`);
    if (!passVal.startsWith('01065432109') || passVal.length !== '01065432109'.length + 3) {
      throw new Error(`Expected password to be phone + 3 letters, got: ${passVal}`);
    }
    console.log(`   ✓ Verified: Auto-generated patient credentials -> Username: ${usernameVal}, Password: ${passVal}`);

    // Submit patient creation
    const createPatientBtn = await page.waitForSelector('button[type="submit"]:has-text("إنشاء حساب للمريض")');
    await createPatientBtn.click();

    // Verify Patient Access Card modal appears
    await page.waitForSelector('text=بطاقة بيانات دخول المريض');
    await page.waitForSelector('button:has-text("نسخ بيانات الدخول")');
    await page.waitForSelector('button:has-text("إرسال عبر واتساب للمريض")');
    console.log('   ✓ Verified: Patient Access Card modal displayed with Copy and WhatsApp share options.');

    // ------------------------------------------------------------------------
    // Journey 6: Super Admin Password Rotation
    // ------------------------------------------------------------------------
    console.log('6. Testing Super Admin password rotation in /ar/admin/settings ...');
    await page.goto('http://localhost:3001/ar/admin/settings', { waitUntil: 'networkidle' });

    await page.waitForSelector('text=الأمان وكلمة مرور الإدارة الرئيسية');
    const passInputsSettings = await page.$$('input[type="password"]');
    if (passInputsSettings.length < 3) throw new Error('Expected 3 password fields in settings');

    await passInputsSettings[0].fill('admin123');
    await passInputsSettings[1].fill('AdminNewSecret2026');
    await passInputsSettings[2].fill('AdminNewSecret2026');

    const updatePassBtn = await page.waitForSelector('button:has-text("تحديث كلمة المرور")');
    await updatePassBtn.click();

    await page.waitForSelector('text=تم تحديث كلمة مرور الإدارة بنجاح');
    console.log('   ✓ Verified: Super Admin password rotated successfully.');

    // Restore password to admin123
    await passInputsSettings[0].fill('AdminNewSecret2026');
    await passInputsSettings[1].fill('admin123');
    await passInputsSettings[2].fill('admin123');
    await updatePassBtn.click();
    await page.waitForSelector('text=تم تحديث كلمة مرور الإدارة بنجاح');
    console.log('   ✓ Restored default admin password to admin123.');

    console.log('\n================================================================');
    console.log('ALL PLAYWRIGHT E2E JOURNEYS PASSED WITH 100% SUCCESS!');
    console.log('================================================================');
  } finally {
    await browser.close();
  }
}

runE2E()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Playwright E2E failed:', err);
    process.exit(1);
  });
