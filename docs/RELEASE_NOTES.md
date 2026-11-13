# DialyCare — Release Notes & Changelog
**Target Audience:** App Stores (Apple App Store / Google Play / Web PWA), Patients & Public  
**Product Name:** DialyCare (دايلي كير)  
**Current Production Version:** `v2.7.0`  
**Live Application URL:** [https://dialycare.vercel.app](https://dialycare.vercel.app)  

---

## 🚀 Version 2.7.0 (Latest Release — Current)
**Release Date:** November 13, 2026  
**Highlights:** Instant Patient Self-Registration & Directory Auto-Enrollment (Zero-Friction Access), Clinical Staff Approvals Queue with Expanded Nurse and Unit Administrator Roles, Professional ID Card Verification, and Senior Resident Primary Contact Routing (`+201080641670`).

### ✨ What’s New
- **Instant Patient Self-Registration & Immediate Activation:**
  - Removed administrative approval gating for hemodialysis patients. Patients registering self-activate immediately (`status: 'active'`).
  - Automatic clinical registry enrollment: self-registering patients are immediately inserted into the official `DIALYCARE_PATIENTS` database with complete nephrology profile (dialysis schedule, target dry weight, vascular access type, viral markers, emergency contact).
  - Streamlined patient onboarding UX: post-registration success screen replaces approval wait warnings with an immediate **"Sign In Now ➔"** action, pre-filling their phone number into the sign-in form for instantaneous access to fluid tracking and session adherence.
- **Dedicated Clinical Staff & Administrator Approvals Center:**
  - Refocused the Super Admin Approvals Center (`/admin/approvals`) strictly on medical and administrative staff credentialing.
  - Expanded role taxonomy to support **Nephrologists (`doctor`)**, **Dialysis Nurses (`nurse`)**, and **Dialysis Unit Administrators (`staff`)**.
  - 4-way filter tabs: **All Staff (`all`)**, **Doctors (`doctors`)**, **Nurses (`nurses`)**, and **Unit Admins (`staff`)**.
  - Professional Syndicate / Hospital ID card preview modal with high-resolution image zoom.
  - Real-time cloud sync and one-click authorization turning staff status to `'active'`.
- **Senior Resident Nephrologist Primary Contact Routing:**
  - Updated primary administrative contact to Senior Resident in Nephrology: `+201080641670`.
  - Secondary / Technical Administrator: `+201552885823`.
  - All pre-filled WhatsApp alert and inquiry links route directly to the Senior Resident.
- **Session Refresh Immunity & Cloud Sync:**
  - Cross-device cloud accounts synchronization via Vercel Blob.
  - Full session persistence on browser reload across all browsers and devices.

### 🧪 Quality & Verification
- **Automated Test Coverage:** **3,448 automated assertions passing (100% success, 0 failures)** across 10 core test suites and specialized adversarial/regression suites:
  - `run-all.ts`: 10 suites, 2,121 assertions.
  - `adversarial-auth-edgecases.test.ts`: 1,258 assertions.
  - `regression-refresh-cloudsync.test.ts`: 69 assertions.
- **Next.js 16 Turbopack Build:** Clean compilation of **56 routes (52 static/PPR + 4 dynamic API endpoints)** in 1.3s with zero errors.

---

## 📦 Version 2.6.0
**Release Date:** November 13, 2026  
**Highlights:** Cross-Device Cloud Synchronization (Vercel Blob), Permanent Session Retention on Browser Refresh, Viral Hepatitis & HIV Screening Isolation Markers, Emergency Contact Person Intake, and Real-Time Multi-Device Approval Polling.

### ✨ What’s New
- **Cross-Device Cloud Synchronization Engine:**
  - Integrated persistent cloud storage powered by **Vercel Blob** (`dialycare_cloud_accounts.json` & `dialycare_cloud_patients.json`) connected directly to project `dialycare`.
  - Full-stack API endpoints (`/api/auth/register`, `/api/auth/accounts`, `/api/auth/approve`, `/api/auth/reject`) enabling instant registration propagation across different physical devices (smartphones, tablets, and desktop workstations).
  - Patients registering on their mobile phones now appear instantly in the clinic administrator's desktop approval queue.
- **Permanent Browser Refresh Session Retention:**
  - Completely resolved the refresh logout bug where refreshing `/admin/approvals` or any admin route redirected to `/en/login`.
  - Added permanent session immunity for Super Administrators (`admin` / `admin-1`).
  - Added safe backward compatibility migration for legacy storage tokens where `status` was undefined, defaulting to `'active'` rather than triggering eviction.
  - Strict negative gating ensures only accounts explicitly marked `'pending'` or `'rejected'` are ever evicted.
- **Nephrology Viral Hepatitis & HIV Screening Protocol:**
  - Expanded patient intake to capture mandatory hemodialysis unit isolation markers:
    - **HCV (Hepatitis C Virus):** Crucial for machine isolation protocol.
    - **HBV (Hepatitis B Virus):** Mandatory for dedicated isolation station in hemodialysis units.
    - **HIV (Human Immunodeficiency Virus):** Routine hemodialysis clinical surveillance.
  - Accessible $\ge 48\text{px}$ touch targets on mobile registration wizard.
  - Color-coded badges displayed in Super Admin review card (`HCV: + / -`, `HBV: + / -`, `HIV: + / -`).
  - Automatic transfer of viral markers to active clinical record (`Patient.viralMarkers`) upon approval.
- **Emergency Contact Persona Intake:**
  - 3-field emergency contact intake during patient self-registration: Contact Name, Relationship (e.g. Son, Spouse), and Telephone Number.
  - Displayed on Super Admin approval card with 1-click telephone dialer (`tel:`).
  - Automatically enrolled into the official `Patient.emergencyContact` record for acute complications (e.g. vascular access bleeding, hypotensive episodes).
- **Multi-Device Live Polling & Manual Cloud Sync:**
  - Auto-polls cloud store every 8 seconds on `/admin/approvals` and every 15 seconds in `AdminLayout` to maintain real-time counter badges without manual reloading.
  - Auto-sync on window focus (`focus` event).
  - Added interactive **"تحديث السحابة / Sync Cloud"** button with spinning refresh animation in the approvals filter bar.
  - Cross-device login fallback: If an account was created on another device, the sign-in routine automatically fetches the latest credentials from the cloud.

### 🧪 Quality & Verification
- **Automated Test Coverage:** **3,432 automated assertions passing (100% success, 0 failures)** across 10 core test suites and specialized adversarial/regression suites:
  - `run-all.ts`: 10 suites, 2,118 assertions.
  - `adversarial-auth-edgecases.test.ts`: 1,253 assertions.
  - `regression-refresh-cloudsync.test.ts`: 61 assertions.
- **Next.js 16 Turbopack Build:** Clean compilation of **56 routes (52 static/PPR + 4 dynamic API endpoints)** in 1.3s with zero errors.

---

## 📦 Version 2.5.0
**Release Date:** November 13, 2026  
**Highlights:** Real Sign Up & Sign In Architecture, Doctor Self-Registration with Syndicate ID, Patient Nephrology Self-Intake, Pending Review Guard, Super Admin Approval Center, Auto-Generated Credentials & Super Admin Password Rotation.

---

## 📦 Version 2.4.0
**Release Date:** November 12, 2026  
**Highlights:** Dialysis Treatment Adherence Questionnaire (R7), Monthly Cycle Automation (Baseline, Month 1, Month 2, Month 3), Doctor Manual Activation Override, and Bilingual Adherence Scoring Engine.
