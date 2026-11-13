# DialyCare — Release Notes & Changelog
**Target Audience:** App Stores (Apple App Store / Google Play / Web PWA), Patients & Public  
**Product Name:** DialyCare (دايلي كير)  
**Current Production Version:** `v2.4.0`  
**Live Application URL:** [https://dialycare.vercel.app](https://dialycare.vercel.app)  

---

## 🚀 Version 2.4.0 (Latest Release — Current)
**Release Date:** November 13, 2026  
**Highlights:** Dialysis Treatment Adherence Questionnaire (R7), Monthly Cadence State Machine, Doctor Override Tools & Accessibility Hardening.

### ✨ What’s New
- **Dialysis Treatment Adherence Questionnaire (استبيان الالتزام بالعلاج لمرضى الغسيل الكلوي):**
  - Added a 20-question adherence questionnaire tailored specifically for hemodialysis patients.
  - Divided into 4 essential clinical pillars (5 questions each):
    1. *Dialysis Attendance (حضور جلسات الغسيل)*
    2. *Medications & Phosphate Binders (الأدوية ودواء الفوسفور مع الوجبات)*
    3. *Renal Dietary Plan (النظام الغذائي والبوتاسيوم والملح)*
    4. *Fluid Restrictions & Weight Control (السوائل والتحكم بالعطش)*
  - Standardized 6-point Likert response scale:
    *1. دائمًا (Always) | 2. غالبًا (Often) | 3. أحيانًا (Sometimes) | 4. نادرًا (Rarely) | 5. أبدًا (Never) | 6. لا ينطبق (Not applicable)*
  - Mathematical scoring engine that excludes *"Not applicable"* from the denominator so patients aren't penalized for unprescribed medications.
- **Automated Monthly Cadence & Due State Machine:**
  - **Baseline (Month 0):** Prompted upon first app launch.
  - **Follow-up (Months 1, 2, 3+):** Automatically activates every 30 days with a clear countdown timer.
- **Clinician Override & Reminder Dispatcher:**
  - Nephrologists can manually activate the questionnaire anytime (`تفعيل الاستبيان الآن للمريض`).
  - Clinicians can dispatch immediate reminder alerts (`إرسال تنبيه بالاستبيان`) directly to the patient's inbox.
  - Full clinician drill-down into all 20 individual answers and past adherence trends.
- **Elderly-Friendly Touch Target Upgrades:**
  - Enforced minimum 48px touch targets (`min-h-[48px]`) on all survey options, navigation tabs, and submit buttons to accommodate patients with finger fatigue or diabetic neuropathy.

### 🐛 Bug Fixes & Improvements
- Fixed modal scroll behavior to guarantee zero horizontal overflow on mobile screens down to 375px width.
- Resolved denominator bias in adherence calculations when multiple "Not applicable" options are selected.
- Synchronized multi-tab storage events across patient and doctor browser sessions.

---

## 📦 Version 2.3.0
**Release Date:** November 12, 2026  
**Highlights:** Standardization of Dialysis Day Options & UI Empty Defaults.

### ✨ What’s New
- **Strict Dialysis Schedule Options:**
  - Standardized weekly dialysis schedules to the two clinically recognized regimens in hemodialysis units:
    - **Saturday / Monday / Wednesday (السبت / الإثنين / الأربعاء - SMW)**
    - **Sunday / Tuesday / Thursday (الأحد / الثلاثاء / الخميس - STT)**
- **Clean Empty-Default Forms:**
  - Removed confusing placeholder mock data from dialysis session forms and lab entries so clinicians start with clean, unpolluted inputs.

### 🐛 Bug Fixes & Improvements
- Corrected smart detection of today's treatment day based on Cairo/local timezone calculation.
- Improved contrast and font weights on Arabic RTL badges.

---

## 📦 Version 2.2.0
**Release Date:** November 11, 2026  
**Highlights:** Interactive Clinical Coaching Avatar & Synthesized Fluid Alarm.

### ✨ What’s New
- **Animated Patient Coaching Avatar:**
  - Introduced 8 authentic patient character presets with customizable clinical accessories (including AV fistula arm bands and permcath chest dressings).
  - Avatar provides contextual medical advice on the patient dashboard across 5 topics: session importance, fluid limits, phosphorus binders, low-potassium eating, and lab interpretation.
- **Critical Fluid Overload Acoustic Alarm:**
  - Web Audio API synthesized alert (880 Hz / 440 Hz dual tone) that triggers whenever a patient enters fluid intake exceeding their calculated critical threshold ($W_{dry} \times 26\text{ mL}$).

### 🐛 Bug Fixes & Improvements
- Fixed audio context autoplay restrictions on modern iOS Safari and Android Chrome.
- Prevented avatar tip flickering during page route transitions.

---

## 📦 Version 2.1.0
**Release Date:** November 10, 2026  
**Highlights:** 12-Parameter Clinical Laboratory Results Tracker.

### ✨ What’s New
- **Laboratory Results Suite:**
  - Tracking for 12 core hemodialysis laboratory values: Creatinine, BUN, Potassium ($K^+$), Phosphorus ($P$), Calcium ($Ca^{2+}$), Hemoglobin ($Hb$), Albumin, Parathyroid Hormone (PTH), Sodium ($Na^+$), Ferritin, Iron Saturation (TSAT), and Alkaline Phosphatase.
  - Doctor-only edit permissions with instant patient-side read synchronization.
  - Bilingual nephrology reference flags (Normal, High, Low) with actionable patient advice.

---

## 📦 Version 2.0.0
**Release Date:** November 9, 2026  
**Highlights:** 14-Parameter Dialysis Session Recorder & Doctor Portal.

### ✨ What’s New
- **14-Parameter Clinical Session Recorder:**
  - Comprehensive logging of pre/post weights (kg & g), 5-point blood pressure and pulse tracking, temperature, leg edema, lung crackles, dyspnea, access inflammation, ultrafiltration volume, blood flow, dialysate flow, access type, and machine sodium.
- **Dual-Portal System:**
  - Dedicated Doctor/Admin portal (`/admin`) for clinical surveillance alongside the Patient portal (`/patient`).

---

## 📦 Version 1.0.0
**Release Date:** November 7, 2026  
**Highlights:** Initial DialyCare Launch.

### ✨ What’s New
- Progressive Web App (PWA) with offline service worker caching.
- Native Arabic (RTL) and English (LTR) language switching.
- Medication prescription reminders and daily compliance checklists.
- Fluid allowance calculator derived from patient dry weight.
