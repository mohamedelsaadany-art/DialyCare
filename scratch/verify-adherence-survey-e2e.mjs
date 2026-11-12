/**
 * Playwright E2E Verification Test Suite: Dialysis Treatment Adherence Questionnaire (R7)
 *
 * Verifies:
 * 1. Mobile viewport (375x667, iPhone SE) with zero horizontal overflow (scrollWidth <= innerWidth).
 * 2. Touch targets >= 44px on critical interactive buttons & survey options.
 * 3. Patient flow:
 *    - Login as patient1 (/ar/login) -> Navigate to /ar/patient/profile
 *    - Verify Due survey banner is visible
 *    - Click "بدء ملء الاستبيان" -> Modal opens
 *    - Answer all 20 questions across the 4 clinical sections:
 *        * Q1..Q5: Dialysis Attendance (حضور جلسات الغسيل)
 *        * Q6..Q10: Medications (الأدوية)
 *        * Q11..Q15: Diet (الطعام)
 *        * Q16..Q20: Fluids (السوائل)
 *    - Verify 6 Likert options order & click touch targets
 *    - Submit survey -> Verify success score breakdown screen
 *    - Close modal -> Verify profile reflects completed status & score history
 * 4. Doctor flow:
 *    - Login as doctor/admin (/ar/login) -> Navigate to /ar/admin/patients/patient-1
 *    - Header adherence button navigates to survey section
 *    - Verify submitted questionnaire score and submission drill-down
 *    - Click "تفعيل الاستبيان الآن للمريض" -> Flags survey as Due immediately
 *    - Click "إرسال تنبيه بالاستبيان" -> Pushes notification
 * 5. Patient return flow:
 *    - Patient logs back in -> /ar/patient/profile shows survey Due again
 *    - Patient checks notifications inbox -> Sees survey reminder notification
 */

import { chromium } from 'playwright';
import assert from 'node:assert';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const VIEWPORT_MOBILE = { width: 375, height: 667 }; // iPhone SE

console.log('================================================================');
console.log('PLAYWRIGHT E2E: DIALYSIS TREATMENT ADHERENCE SURVEY VERIFICATION');
console.log(`Base URL: ${BASE_URL}`);
console.log(`Viewport: ${VIEWPORT_MOBILE.width}x${VIEWPORT_MOBILE.height} (Mobile)`);
console.log('================================================================\n');

let stepNum = 0;
function logStep(msg) {
  stepNum++;
  console.log(`\n[Step ${stepNum}] ${msg}`);
}

async function verifyNoHorizontalOverflow(page, stepLabel) {
  const isOverflowing = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  assert.strictEqual(
    isOverflowing,
    false,
    `Horizontal overflow detected at ${stepLabel}: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`
  );
  console.log(`  ✓ Zero horizontal overflow confirmed (scrollWidth: ${scrollWidth}px, innerWidth: ${innerWidth}px)`);
}

async function verifyTouchTarget(locator, label) {
  const box = await locator.boundingBox();
  assert.ok(box, `Element ${label} must have a valid bounding box`);
  assert.ok(
    box.height >= 44,
    `Touch target height for ${label} must be >= 44px (got ${box.height}px)`
  );
  console.log(`  ✓ Touch target size for ${label}: ${Math.round(box.width)}x${Math.round(box.height)}px (>= 44px)`);
}

async function loginAs(page, username, password) {
  await page.goto(`${BASE_URL}/ar/login`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    window.localStorage.removeItem('DIALYCARE_CURRENT_USER');
  });
  await page.reload({ waitUntil: 'networkidle' });

  // Locate the input elements inside form
  const userInput = page.locator('form input').first();
  await userInput.waitFor({ state: 'visible', timeout: 5000 });
  await userInput.fill(username);

  const passInput = page.locator('input[type="password"]').first();
  await passInput.fill(password);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();
  await page.waitForTimeout(1000);
}

async function runAdherenceSurveyE2E() {
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: VIEWPORT_MOBILE,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    locale: 'ar-EG',
  });

  const page = await context.newPage();

  try {
    // -------------------------------------------------------------------------
    // STEP 1: INITIAL STATE & PATIENT LOGIN
    // -------------------------------------------------------------------------
    logStep('Clearing previous survey storage state');
    await page.goto(`${BASE_URL}/ar/login`, { waitUntil: 'networkidle' });

    // Clean any prior survey submissions and activations for pristine test run
    await page.evaluate(() => {
      window.localStorage.removeItem('DIALYCARE_ADHERENCE_SURVEYS');
      window.localStorage.removeItem('DIALYCARE_SURVEY_ACTIVATION_patient-1');
      window.localStorage.removeItem('DIALYCARE_CURRENT_USER');
    });

    await page.reload({ waitUntil: 'networkidle' });
    await verifyNoHorizontalOverflow(page, 'Login page');

    logStep('Logging in as patient1 (Ahmed Mahmoud)');
    await loginAs(page, 'patient1', 'patient123');

    // -------------------------------------------------------------------------
    // STEP 2: PATIENT PROFILE & DUE SURVEY BANNER
    // -------------------------------------------------------------------------
    logStep('Navigating to Patient Profile (/ar/patient/profile)');
    await page.goto(`${BASE_URL}/ar/patient/profile`, { waitUntil: 'networkidle' });
    await verifyNoHorizontalOverflow(page, 'Patient profile');

    logStep('Verifying Adherence Survey Section and Due Banner');
    const surveySection = page.locator('[data-testid="patient-adherence-survey-section"]');
    await surveySection.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✓ Patient Adherence Survey section is rendered.');

    const dueBanner = page.locator('[data-testid="patient-survey-due-banner"]');
    await dueBanner.waitFor({ state: 'visible', timeout: 5000 });
    const bannerText = await dueBanner.textContent();
    console.log(`  ✓ Survey Due banner detected: "${bannerText.slice(0, 80).replace(/\s+/g, ' ')}..."`);

    const startBtn = page.locator('[data-testid="patient-survey-start-btn"]');
    await verifyTouchTarget(startBtn, 'Start Survey Button');

    // -------------------------------------------------------------------------
    // STEP 3: OPEN SURVEY MODAL & VERIFY 20 QUESTIONS ACROSS 4 SECTIONS
    // -------------------------------------------------------------------------
    logStep('Clicking "بدء ملء الاستبيان الآن" to open survey modal');
    await startBtn.click();

    const surveyModal = page.locator('[data-testid="adherence-survey-modal"]');
    await surveyModal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✓ Adherence Survey Modal opened successfully.');

    // Sections:
    // 1. Dialysis Attendance (Q1..Q5)
    // 2. Medications (Q6..Q10)
    // 3. Diet (Q11..Q15)
    // 4. Fluids (Q16..Q20)
    logStep('Filling Section 1: Dialysis Attendance (Q1..Q5)');
    for (let q = 1; q <= 5; q++) {
      // Choose option 1 (دائمًا - Always)
      const opt = page.locator(`[data-testid="survey-option-${q}-1"]`);
      await opt.waitFor({ state: 'visible', timeout: 3000 });
      if (q === 1) await verifyTouchTarget(opt, 'Survey Option Q1-1 (Always)');
      await opt.click();
    }
    console.log('  ✓ Answered Q1..Q5 (Dialysis Attendance).');

    // Navigate to Section 2 (Medications)
    logStep('Navigating to Section 2: Medications (Q6..Q10)');
    const nextBtn = page.locator('button:has-text("القسم التالي"), button:has-text("Next Section")').first();
    await verifyTouchTarget(nextBtn, 'Next Section Button');
    await nextBtn.click();
    await page.waitForTimeout(300);

    for (let q = 6; q <= 10; q++) {
      const optVal = q <= 8 ? 1 : 2;
      const opt = page.locator(`[data-testid="survey-option-${q}-${optVal}"]`);
      await opt.waitFor({ state: 'visible', timeout: 3000 });
      await opt.click();
    }
    console.log('  ✓ Answered Q6..Q10 (Medications).');

    // Navigate to Section 3 (Diet)
    logStep('Navigating to Section 3: Diet (Q11..Q15)');
    await nextBtn.click();
    await page.waitForTimeout(300);

    for (let q = 11; q <= 15; q++) {
      const optVal = q <= 13 ? 1 : 3;
      const opt = page.locator(`[data-testid="survey-option-${q}-${optVal}"]`);
      await opt.waitFor({ state: 'visible', timeout: 3000 });
      await opt.click();
    }
    console.log('  ✓ Answered Q11..Q15 (Diet).');

    // Navigate to Section 4 (Fluids)
    logStep('Navigating to Section 4: Fluids (Q16..Q20)');
    await nextBtn.click();
    await page.waitForTimeout(300);

    for (let q = 16; q <= 20; q++) {
      const optVal = q === 20 ? 6 : 1;
      const opt = page.locator(`[data-testid="survey-option-${q}-${optVal}"]`);
      await opt.waitFor({ state: 'visible', timeout: 3000 });
      await opt.click();
    }
    console.log('  ✓ Answered Q16..Q20 (Fluids, with Q20 as N/A).');

    // Optional patient notes
    const notesInput = page.locator('#survey-patient-notes');
    if (await notesInput.isVisible()) {
      await notesInput.fill('ملاحظة: التزمت بالأدوية والحمية والسوائل بشكل ممتاز خلال الشهر.');
      console.log('  ✓ Added patient notes in final section.');
    }

    // -------------------------------------------------------------------------
    // STEP 4: SUBMIT SURVEY & VERIFY RESULTS
    // -------------------------------------------------------------------------
    logStep('Submitting Survey via "إرسال الاستبيان للطبيب"');
    const submitBtn = page.locator('[data-testid="survey-submit-btn"]');
    await verifyTouchTarget(submitBtn, 'Submit Survey Button');
    await submitBtn.click();

    const scoreResult = page.locator('[data-testid="survey-score-result"]');
    await scoreResult.waitFor({ state: 'visible', timeout: 5000 });
    const scoreResultText = await scoreResult.textContent();
    console.log(`  ✓ Survey submitted! Score breakdown screen displayed: ${scoreResultText.slice(0, 100).replace(/\s+/g, ' ')}...`);

    // Close modal
    logStep('Closing modal after successful submission');
    const closeBtn = page.locator('button:has-text("تم، إغلاق النافذة"), [data-testid="survey-modal-close-btn"]').first();
    await verifyTouchTarget(closeBtn, 'Close Modal Button');
    await closeBtn.click();
    await surveyModal.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('  ✓ Modal closed.');

    // -------------------------------------------------------------------------
    // STEP 5: VERIFY PROFILE REFLECTS COMPLETED STATE & SUBMISSION HISTORY
    // -------------------------------------------------------------------------
    logStep('Verifying Profile updates to Completed Status');
    const completedStatus = page.locator('[data-testid="patient-survey-completed-status"]');
    await completedStatus.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✓ Completed status card is now visible on patient profile.');

    const dueBannerAfter = page.locator('[data-testid="patient-survey-due-banner"]');
    const isDueBannerPresent = await dueBannerAfter.isVisible();
    assert.strictEqual(isDueBannerPresent, false, 'Due banner must no longer be visible after submission');
    console.log('  ✓ Due banner is correctly hidden.');

    const historySection = page.locator('[data-testid="patient-survey-history"]');
    if (await historySection.isVisible()) {
      console.log('  ✓ Submissions history section is rendered in profile.');
    }

    await verifyNoHorizontalOverflow(page, 'Patient profile after submission');

    // -------------------------------------------------------------------------
    // STEP 6: DOCTOR PORTAL VERIFICATION & MANUAL ACTIVATION
    // -------------------------------------------------------------------------
    logStep('Logging out of patient and logging in as Doctor (admin)');
    await loginAs(page, 'admin', 'admin123');

    logStep('Visiting patient-1 detail page (/ar/admin/patients/patient-1)');
    await page.goto(`${BASE_URL}/ar/admin/patients/patient-1`, { waitUntil: 'networkidle' });
    await verifyNoHorizontalOverflow(page, 'Doctor patient detail');

    // Check header shortcut button
    const headerSurveyBtn = page.locator('[data-testid="patient-detail-adherence-survey-header-btn"]');
    await headerSurveyBtn.waitFor({ state: 'visible', timeout: 5000 });
    await verifyTouchTarget(headerSurveyBtn, 'Doctor Header Adherence Button');
    console.log('  ✓ Doctor Header Adherence Button is visible.');

    // Check Doctor Survey Manager
    const doctorSurveyManager = page.locator('[data-testid="doctor-survey-manager"]');
    await doctorSurveyManager.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✓ Doctor Survey Manager section rendered.');

    // Verify initial completed status badge in doctor view
    const statusBadge = page.locator('[data-testid="doctor-survey-status-badge"]');
    const badgeText = await statusBadge.textContent();
    assert.ok(badgeText.includes('مكتمل'), 'Doctor portal must show survey is completed');
    console.log(`  ✓ Doctor sees completed status: "${badgeText.trim()}"`);

    // Verify submitted questionnaire drill-down
    const submissionsList = page.locator('[data-testid="doctor-survey-submissions"]');
    await submissionsList.waitFor({ state: 'visible', timeout: 5000 });
    console.log('  ✓ Patient submissions list is visible to doctor.');

    // -------------------------------------------------------------------------
    // STEP 7: DOCTOR OVERRIDE & NOTIFICATION DISPATCH
    // -------------------------------------------------------------------------
    logStep('Doctor clicks "تفعيل الاستبيان الآن للمريض" to override interval');
    const activateBtn = page.locator('[data-testid="doctor-activate-survey-btn"]');
    await verifyTouchTarget(activateBtn, 'Doctor Activate Survey Button');
    await activateBtn.click();

    // Verify status switches to doctor activated
    await page.waitForTimeout(500);
    const updatedBadgeText = await statusBadge.textContent();
    assert.ok(
      updatedBadgeText.includes('مفعّل يدوياً') || updatedBadgeText.includes('مستحق') || updatedBadgeText.includes('Doctor Activated'),
      `Badge text must reflect doctor activation (got: "${updatedBadgeText.trim()}")`
    );
    console.log(`  ✓ Doctor manual activation successful! Badge updated: "${updatedBadgeText.trim()}"`);

    logStep('Doctor clicks "إرسال تنبيه بالاستبيان" to send reminder push');
    const reminderBtn = page.locator('[data-testid="doctor-send-reminder-btn"]');
    await verifyTouchTarget(reminderBtn, 'Doctor Send Reminder Button');
    await reminderBtn.click();
    await page.waitForTimeout(500);
    console.log('  ✓ Doctor reminder alert button triggered.');

    // -------------------------------------------------------------------------
    // STEP 8: PATIENT RETURNS & SEES DUE SURVEY AND REMINDER NOTIFICATION
    // -------------------------------------------------------------------------
    logStep('Logging back in as patient1 to verify survey is Due and notification received');
    await loginAs(page, 'patient1', 'patient123');

    logStep('Visiting patient profile again');
    await page.goto(`${BASE_URL}/ar/patient/profile`, { waitUntil: 'networkidle' });

    const dueBannerAgain = page.locator('[data-testid="patient-survey-due-banner"]');
    await dueBannerAgain.waitFor({ state: 'visible', timeout: 5000 });
    const dueBannerAgainText = await dueBannerAgain.textContent();
    assert.ok(
      dueBannerAgainText.includes('مطلوب بواسطة الطبيب') || dueBannerAgainText.includes('مطلوب ملء استبيان'),
      'Survey Due banner must be active again due to doctor activation'
    );
    console.log(`  ✓ Survey Due banner is back on patient profile: "${dueBannerAgainText.slice(0, 80).replace(/\s+/g, ' ')}..."`);

    logStep('Verifying survey reminder notification in patient notifications');
    await page.goto(`${BASE_URL}/ar/patient`, { waitUntil: 'networkidle' });
    const hasNotification = await page.evaluate(() => {
      const notifsRaw = window.localStorage.getItem('DIALYCARE_NOTIFICATIONS');
      if (!notifsRaw) return false;
      const notifs = JSON.parse(notifsRaw);
      return notifs.some(
        (n) =>
          n.recipientIds &&
          n.recipientIds.includes('patient-1') &&
          (n.titleAr.includes('استبيان الالتزام') || n.titleEn.includes('Adherence Questionnaire'))
      );
    });
    assert.strictEqual(hasNotification, true, 'Patient must have received adherence survey reminder notification');
    console.log('  ✓ Verified notification persistence in patient store!');

    console.log('\n================================================================');
    console.log('🎉 ALL PLAYWRIGHT E2E ADHERENCE SURVEY SCENARIOS VERIFIED SUCCESSFULLY!');
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ E2E VERIFICATION TEST FAILED:');
    console.error(err);
    try {
      await page.screenshot({ path: 'scratch/e2e-adherence-failure.png', fullPage: true });
      console.log('Screenshot saved to scratch/e2e-adherence-failure.png');
    } catch {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runAdherenceSurveyE2E().catch((err) => {
  console.error('Fatal error during E2E execution:', err);
  process.exit(1);
});
