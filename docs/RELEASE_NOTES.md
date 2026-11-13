# DialyCare — Release Notes & Changelog
**Target Audience:** App Stores (Apple App Store / Google Play / Web PWA), Patients & Public  
**Product Name:** DialyCare (دايلي كير)  
**Current Production Version:** `v2.5.0`  
**Live Application URL:** [https://dialycare.vercel.app](https://dialycare.vercel.app)  

---

## 🚀 Version 2.5.0 (Latest Release — Current)
**Release Date:** November 13, 2026  
**Highlights:** Real Sign Up & Sign In Architecture, Doctor Self-Registration with Syndicate ID, Patient Nephrology Self-Intake, Pending Review Guard, Super Admin Approval Center, Auto-Generated Credentials & Super Admin Password Rotation.

### ✨ What’s New
- **Real Production Sign Up & Sign In System:**
  - Transitioned platform past mock demo authentication to full local-first production account storage with seamless bridge to Firebase Cloud Auth.
  - Permanently removed all demo credential buttons ("Demo Admin", "Demo Patient", "Quick Fill") from the public login interface.
- **Doctor Self-Registration & Medical ID Verification:**
  - Independent registration flow for nephrologists and clinical staff: Full Name, Phone, Email, Specialty, Hospital/Center, Password.
  - Syndicate ID card photo upload with preview, size inspection, and local base64 storage.
  - Post-registration direct WhatsApp notification targeting the Medical Administrator (`+201552885823`) to expedite account activation.
- **Patient Self-Registration & 3-Step Nephrology Intake:**
  - Step 1 (Personal Info): Full name, mobile number, age, gender.
  - Step 2 (Nephrology Profile): Dialysis schedule (strict Saturday/Monday/Wednesday vs Sunday/Tuesday/Thursday), target dry weight (kg), vascular access type (AVF, AVG, Permcath, Mahurkar), and dialysis center.
  - Step 3 (Security): Password setup with automatic phone-number-as-username assignment.
- **Clinical Pending Review Guard:**
  - Attempting to sign in with an unapproved account displays a branded clinical review status card informing the user their credentials are under review by medical administration.
  - Direct 1-tap WhatsApp contact button to the Medical Administrator (`+201552885823`) with pre-composed bilingual inquiry text.
  - Rejection feedback card displaying supervisor's clinical rejection notes if registration is declined.
- **Super Admin Approvals Management Center (`/admin/approvals`):**
  - Dedicated review dashboard restricted to Super Administrator (`admin` / `admin123`).
  - Doctor queue with expandable high-resolution Medical ID modal.
  - Patient queue displaying full nephrology profile breakdown.
  - 1-click **Approve & Activate / Enroll** which automatically enrolls approved patients into active clinical directory (`DIALYCARE_PATIENTS`) with initial adherence reminders and welcome notifications.
  - **Reject with Reason** modal with required clinical rationale.
  - Dynamic navigation counter badge showing live count of pending approvals.
- **Doctor In-Clinic Patient Provisioning & Auto-Credentials Generator:**
  - Clinicians can register patients directly in-clinic with 1-click auto-generated credentials:
    - **Username:** Patient mobile phone number (`01012345678`).
    - **Password:** Phone number + 3 distinct random letters without overlap (`01012345678Xkz`) using safe character set excluding confusing glyphs (`0, O, 1, l, I`).
  - Branded **Patient Access Card Modal** with 1-click Copy Credentials, 1-tap WhatsApp message dispatcher to patient/family, and Print Clinical Access Card (`window.print()`).
- **Super Admin Password Rotation:**
  - Dedicated security card in `/admin/settings` allowing Super Admin to rotate password from default `admin123` with validation and confirmation.

### 🧪 Quality & Verification
- **Master Test Runner:** 10 suites and **2,115 assertions passing with 100% success** in 0.29s (`npm test` and `npx tsx src/lib/__tests__/run-all.ts`).
- **Playwright E2E Suite:** 6 comprehensive browser journeys verified with zero errors against the production build.

---

## 📦 Version 2.4.0
**Release Date:** November 13, 2026  
**Highlights:** Dialysis Treatment Adherence Questionnaire (R7), Monthly Cadence State Machine, Doctor Override Tools & Accessibility Hardening.

### ✨ What’s New
- **Dialysis Treatment Adherence Questionnaire (استبيان الالتزام بالعلاج لمرضى الغسيل الكلوي):**
  - 20-question adherence questionnaire tailored specifically for hemodialysis patients.
  - Divided into 4 essential clinical pillars (5 questions each): Dialysis Attendance, Medications, Renal Dietary Plan, Fluid Restrictions.
  - Standardized 6-point Likert response scale (*دائمًا | غالبًا | أحيانًا | نادرًا | أبدًا | لا ينطبق*).
  - Mathematical scoring engine that excludes *"Not applicable"* from the denominator.
- **Automated Monthly Cadence & Due State Machine:**
  - Baseline on first launch; subsequent follow-ups every 30 days.
- **Clinician Override & Reminder Dispatcher:**
  - Nephrologists can manually activate questionnaire and dispatch push reminders.
- **Elderly-Friendly Touch Target Upgrades:**
  - Minimum 48px touch targets on all interactive controls.

---

## 📦 Version 2.3.0
**Release Date:** November 12, 2026  
**Highlights:** Standardization of Dialysis Day Options (SMW vs STT) & UI Empty Defaults.

---

## 📦 Version 2.2.0
**Release Date:** November 11, 2026  
**Highlights:** Interactive Clinical Coaching Avatar & Synthesized Fluid Alarm.

---

## 📦 Version 2.1.0
**Release Date:** November 10, 2026  
**Highlights:** 12-Parameter Clinical Laboratory Results Tracker.

---

## 📦 Version 2.0.0
**Release Date:** November 9, 2026  
**Highlights:** Production Dual-Track PWA Platform for Hemodialysis Patients and Clinical Teams.
