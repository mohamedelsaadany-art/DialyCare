# DialyCare — Final Functional Specification (FSD)
**Target Audience:** Product Managers & Clinical Leadership  
**Product Name:** DialyCare (Bilingual Hemodialysis Companion & Clinic Command Platform)  
**Version:** 2.7.0 (Production Live)  
**Deployment URL:** [https://dialycare.vercel.app](https://dialycare.vercel.app)  
**Document Status:** Final As-Shipped Specification  

---

## 1. Product Vision & Clinical Objectives

DialyCare addresses the triple challenge of chronic hemodialysis management: **fluid overload, medication non-adherence, and missed dialysis treatments**. 

Patients with End-Stage Renal Disease (ESRD) face high mortality risks between hemodialysis treatments (particularly after the long 2-day weekend interval). DialyCare bridges the gap between home and the dialysis clinic by empowering patients with accessible, bilingual self-monitoring tools while providing nephrologists, clinical nurses, and medical administrators with transparent, real-time auditability, cross-device registration sync, and real identity onboarding.

```
                           +---------------------------+
                           |      Clinical Pillars     |
                           +-------------+-------------+
                                         |
     +-------------------+---------------+---------------+-------------------+
     |                   |                               |                   |
+----v----+         +----v----+                     +----v----+         +----v----+
| 1. Fluid|         | 2. Meds |                     | 3. Care |         | 4. Cloud|
| Overload|         | & Diet  |                     | Sessions|         | Sync &  |
| Control |         | Adhere  |                     | Tracking|         | Approvals|
+---------+         +---------+                     +---------+         +---------+
```

---

## 2. Shipped Feature Matrix & Scope

| Feature ID | Feature Name | Core Functionality | User Roles | Primary Route |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | **Bilingual Localization** | 100% Arabic (RTL) & English (LTR) with authentic Egyptian/Arab nephrology terminology. | All | `/[locale]/*` |
| **F-02** | **Dialysis Regimen Engine** | Strict clinically approved schedules: Sat/Mon/Wed (SMW) or Sun/Tue/Thu (STT). | Patient, Doctor | `/patient`, `/admin/patients` |
| **F-03** | **Coaching Avatar** | 8 distinct patient avatar presets offering real-time tips on diet, fluids, and dialysis prep. | Patient | `/patient`, `/patient/log` |
| **F-04** | **Smart Fluid Restriction** | Dry weight warning ($20 \times W_{dry}$) & critical ($26 \times W_{dry}$) limits with Web Audio alarm. | Patient, Doctor | `/patient/log`, `/admin/patients/[id]` |
| **F-05** | **14-Parameter Session Log** | Full clinical session documentation (weights, 5 vitals, fluid triad, access status). | Patient, Doctor | `/patient/log`, `/admin/patients/[id]` |
| **F-06** | **12-Parameter Lab Tracker** | Biochemistry panels ($K^+$, $P$, $Ca^{2+}$, $Hb$, Creatinine) with normal/high/low guidance. | Patient (View), Doctor (Edit) | `/patient/log`, `/admin/patients/[id]` |
| **F-07** | **Prescription Manager** | Exact drug names, doses, units, and multi-schedule daily reminder intervals. | Patient (View), Doctor (Edit) | `/patient/reminders`, `/admin/patients/[id]` |
| **F-08** | **Treatment Adherence Survey** | 20 clinical questions, 6 ordered options, monthly cadence (M0, M1, M2, M3+). | Patient (Submit), Doctor (Review/Trigger) | `/patient/profile`, `/admin/patients/[id]` |
| **F-09** | **PWA Offline Resilience** | Offline service worker caching, home screen install prompt, $\ge 48\text{px}$ touch targets. | All | Mobile / Desktop Browser |
| **F-10** | **Production Sign Up / In** | Clean tabbed interface; phone, email, and username identifier matching. | Public / All | `/[locale]/login` |
| **F-11** | **Staff Self-Registration** | Doctor, Nurse, and Unit Admin intake with Professional ID photo upload and WhatsApp routing to Senior Resident (+201080641670). | Doctor, Nurse, Admin | `/[locale]/login?tab=signup` |
| **F-12** | **Instant Patient Intake** | Demographics $\to$ Nephrology Profile $\to$ Password. Status is instantly active; auto-enrolled into official patient registry with zero approval wait. | Patient | `/[locale]/login?tab=signup` |
| **F-13** | **Clinical Review Guard** | Pending/rejected staff accounts intercepted; surfaces status card with 1-click WhatsApp inquiry to Senior Resident. | Doctor, Nurse, Admin | `/[locale]/login` |
| **F-14** | **Staff Approvals Center** | Super Admin (`admin`/`admin123`) review center; ID photo zoom modal; 4 filter tabs (All, Doctors, Nurses, Unit Admins); 1-click Approve/Reject. | Super Admin | `/[locale]/admin/approvals` |
| **F-15** | **In-Clinic Auto-Credentials** | Doctors auto-generate patient credentials: Username = Phone, Password = Phone + 3 random letters. | Doctor, Nurse | `/[locale]/admin/patients/new` |
| **F-16** | **Password Rotation** | Super Admin can securely rotate default password with live confirmation in `/admin/settings`. | Super Admin | `/[locale]/admin/settings` |
| **F-17** | **Cross-Device Cloud Sync** | Vercel Blob cloud engine (`/api/auth/*`) syncing patient & staff registrations across smartphones and desktop. | All | `/api/auth/*` |
| **F-18** | **Session Refresh Resilience** | Zero-eviction session preservation; Super Admin immune to refresh logout; legacy tokens auto-healed. | Admin, Staff | Portal Wide |
| **F-19** | **Nephrology Viral Markers** | HCV, HBV, and HIV isolation screening during intake, displayed on staff cards, mapped to patient registry. | Patient, Admin | `/login`, `/admin/approvals` |
| **F-20** | **Emergency Contact Persona** | Emergency person name, phone, and relationship captured and linked to active clinical record. | Patient, Admin | `/login`, `/admin/approvals` |
| **F-21** | **Live Multi-Device Polling** | 8s auto-polling on approvals queue, 15s badge refresh, and interactive 1-click Cloud Sync button. | Super Admin | `/admin/approvals` |

---

## 3. End-to-End User Journeys

### User Journey 1: Patient Smartphone Intake to Desktop Clinic Approval
1. **Intake on Mobile Phone:** Patient navigates to `https://dialycare.vercel.app/ar/login?tab=signup` on their phone.
2. **Step 1:** Enters full name, phone (`01012345678`), age, and gender.
3. **Step 2:** Selects strict dialysis regimen (`السبت / الاثنين / الأربعاء`), dry weight (`70 kg`), vascular access (`AVF`), viral status (`HCV: -`, `HBV: -`, `HIV: -`), and emergency contact (`محمد - 01234567890 - ابن`).
4. **Step 3:** Sets secure password and submits.
5. **Cloud Dispatch:** Phone immediately executes `POST /api/auth/register`, saving the record into Vercel Blob cloud store.
6. **Desktop Clinic Reception:** Super Admin at laptop opens `https://dialycare.vercel.app/en/admin/approvals`.
7. **Instant Visibility:** Patient card appears in real time (within 8 seconds or immediately upon clicking **Sync Cloud**).
8. **1-Click Clinical Enrollment:** Admin reviews viral markers and emergency contact, clicks **Approve & Activate Account**.
9. **Active Patient Record:** Account is now active; patient is auto-enrolled into `DIALYCARE_PATIENTS` with reminder schedules initialized.
10. **Patient Sign In:** Patient signs in on their phone and accesses their personalized dashboard immediately.

### User Journey 2: Doctor Self-Registration & Syndicate ID Audit
1. Doctor registers with name, phone, medical specialty, hospital name, and photo upload of Egyptian Medical Syndicate ID card.
2. Registration payload is pushed to cloud store; applicant sees clinical pending status card with WhatsApp dispatch to Senior Resident (`+201080641670`).
3. Super Admin audits Syndicate ID photo in high-resolution modal, confirms legitimacy, and clicks **Approve Doctor**.
4. Doctor signs in and gains complete clinical management privileges.

### User Journey 3: Browser Refresh Immunity
1. Super Admin is logged in and managing registrations on `/admin/approvals`.
2. Admin presses browser Refresh (F5 / reload).
3. The session is retained with `status: 'active'`. No eviction occurs, no redirect to `/login` occurs, and work continues uninterrupted.
