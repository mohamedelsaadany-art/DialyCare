# DialyCare — Final Functional Specification (FSD)
**Target Audience:** Product Managers & Clinical Leadership  
**Product Name:** DialyCare (Bilingual Hemodialysis Companion & Clinic Command Platform)  
**Version:** 2.4.0 (Production Live)  
**Deployment URL:** [https://dialycare.vercel.app](https://dialycare.vercel.app)  
**Document Status:** Final As-Shipped Specification  

---

## 1. Product Vision & Clinical Objectives

DialyCare addresses the triple challenge of chronic hemodialysis management: **fluid overload, medication non-adherence, and missed dialysis treatments**. 

Patients with End-Stage Renal Disease (ESRD) face high mortality risks between hemodialysis treatments (particularly after the long 2-day weekend interval). DialyCare bridges the gap between home and the dialysis clinic by empowering patients with accessible, bilingual self-monitoring tools while providing nephrologists and clinical nurses with transparent, real-time auditability.

```
                           +---------------------------+
                           |      Clinical Pillars     |
                           +-------------+-------------+
                                         |
     +-------------------+---------------+---------------+-------------------+
     |                   |                               |                   |
+----v----+         +----v----+                     +----v----+         +----v----+
| 1. Fluid|         | 2. Meds |                     | 3. Care |         | 4. Audit|
| Overload|         | & Diet  |                     | Sessions|         | & Labs  |
| Control |         | Adhere  |                     | Tracking|         | Monthly |
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
| **F-09** | **PWA Offline Resilience** | Offline service worker caching, home screen install prompt, >= 48px touch targets. | All | Mobile / Desktop Browser |

---

## 3. End-to-End User Journeys

### 3.1 Patient Journey: Monthly Adherence & Daily Session Logging
```
[Patient Login]
       │
       ▼
[Patient Dashboard] ──> Sees Avatar Coaching Tip & Today's Dialysis Status
       │
       ├───> [Dialysis Day] ──> Records Session (Pre/Post Weight, Vitals, Access Check)
       │
       ├───> [Off-Dialysis Day] ──> Logs Fluid & Diet Intake
       │           │
       │           ├───> Under Limit: Green Safe Zone
       │           └───> Above Critical Threshold: Emergency Alarm + Visual Alert
       │
       └───> [Profile Page] ──> Checks Adherence Survey Banner
                   │
                   ├───> Status: DUE (Initial, Monthly, or Doctor Triggered)
                   │           │
                   │           ▼
                   │     [Opens Modal] ──> Answers 20 Questions across 4 Sections
                   │           │
                   │           ▼
                   │     [Submits Survey] ──> Instant Score Breakdown Screen
                   │
                   └───> Status: COMPLETED ──> Views Days Remaining to Next Cycle
```

### 3.2 Doctor / Nurse Journey: Clinical Surveillance & Intervention
```
[Doctor Login: /admin]
       │
       ▼
[Patient Directory] ──> Selects Patient (e.g. Ahmed Mahmoud)
       │
       ▼
[Patient Details Page: /admin/patients/[id]]
       │
       ├───> [Session History] ──> Audits past hemodialysis sessions & vascular access
       ├───> [Medications] ──> Adds/edits prescription dosage & schedule
       ├───> [Laboratory Results] ──> Enters new lab values (K+, P, Hemoglobin)
       │
       └───> [Adherence Survey Manager]
                   │
                   ├───> Audits 20-question responses & domain percentages
                   ├───> Clicks "تفعيل الاستبيان الآن للمريض" (Overrides 30-day interval)
                   └───> Clicks "إرسال تنبيه بالاستبيان" (Dispatches targeted inbox reminder)
```

---

## 4. Detailed Functional Specifications

### 4.1 Treatment Adherence Questionnaire (R7 Specification)
- **Target Category:** Validated ESRD Adherence Instrument.
- **Location:** Patient Profile (`/patient/profile`) & Doctor Patient Manager (`/admin/patients/[id]`).
- **Structure:** Exactly 20 questions categorized into 4 clinical domains (5 questions each):
  1. **Dialysis Attendance (أولاً: حضور جلسات الغسيل):** Q1 to Q5
  2. **Medications (ثانياً: الأدوية):** Q6 to Q10 (specifically including phosphate binders with meals in Q8)
  3. **Diet (ثالثاً: الطعام):** Q11 to Q15 (potassium, phosphorus, salt, and dining out)
  4. **Fluids (رابعاً: السوائل):** Q16 to Q20 (daily allowance, measuring, thirst control, hidden fluids, and IDWG)
- **Response Scale (Strict Sequence):**
  1. `دائمًا` (Always) — 5 pts
  2. `غالبًا` (Often) — 4 pts
  3. `أحيانًا` (Sometimes) — 3 pts
  4. `نادرًا` (Rarely) — 2 pts
  5. `أبدًا` (Never) — 1 pt
  6. `لا ينطبق` (Not applicable) — Denominator Excluded (`null`)
- **Cadence Rules:**
  - **Baseline:** Appears upon first application use (Cycle 1).
  - **Month 1:** Becomes due exactly 30 days post-baseline submission (Cycle 2).
  - **Month 2:** Becomes due 30 days post-month-1 submission (Cycle 3).
  - **Month 3:** Becomes due 30 days post-month-2 submission (Cycle 4).
  - **Subsequent Months:** Repeats every 30 days continuously.
- **Doctor Override Actions:**
  - `تفعيل الاستبيان الآن للمريض`: Instantly switches patient status to `isDue = true` with reason `'doctor_activated'`.
  - `إرسال تنبيه بالاستبيان`: Pushes an urgent notification to the patient inbox with localized instructions.
  - Automatically resets to `completed` upon patient submission.

### 4.2 14-Parameter Dialysis Session Recorder
Enforces the mandatory 14 hemodialysis clinical parameters:
1. **Medical Compliance Rating:** 1 to 5 stars.
2. **Pre-Dialysis Weight:** Kilograms and Grams inputs.
3. **Post-Dialysis Weight:** Kilograms and Grams inputs.
4. **Blood Pressure (mmHg):** Pre-session, Hour 1, Hour 2, Hour 3, and End of session.
5. **Heart Rate (BPM):** Pre-session, Hour 1, Hour 2, Hour 3, and End of session.
6. **Body Temperature (°C):** Recorded once per session (range: 34.0°C - 42.0°C).
7. **Fluid Assessment Triad:**
   - Leg edema (`None`, `Mild`, `Moderate`, `Severe`).
   - Lung crackles (`None`, `Bases`, `Mid-lungs`, `Generalized`).
   - Dyspnea / Shortness of breath (`None`, `Mild`, `Moderate`, `Severe`).
8. **Vascular Access Check:** `Normal` or `Inflammation Signs Present`.
9. **Session Duration:** 1, 2, 3, or 4 hours.
10. **Ultrafiltration Volume:** Extracted fluid volume in milliliters (mL).
11. **Blood Flow Rate (Qb):** Speed in mL/min.
12. **Dialysate Flow Rate (Qd):** Prescribed options: `300`, `500`, `700`, `800 mL/min`.
13. **Vascular Access Type:** `AVF (وصلة شريانية وريدية)`, `AVG (وصلة صناعية)`, `Permcath (قسطرة دائمة)`, `Mahurkar (قسطرة مؤقتة)`.
14. **Machine Sodium Concentration:** Sodium dialysate in mEq/L (range: 130 - 150).

---

## 5. Clinical Edge Cases & Handling Rules

| Scenario | Edge Case Behavior | Resolution / Handling |
| :--- | :--- | :--- |
| **Patient selects "Not applicable" on multiple questions** | Denominator must not stay at 100 points. | Formula divides earned points by `applicableCount * 5`. Max score remains 100%. |
| **All 20 questions answered with "Not applicable"** | Zero division error (`0 / 0`). | Safe catch fallback returns `100%` and skips score calculation. |
| **Doctor manual activation when survey already due** | Duplicate activation. | Idempotent operation: preserves due state without corrupting cycle counter. |
| **Session weight paradox (Post > Pre)** | Patient gained weight during dialysis. | Warning banner triggers requiring clinician confirmation before save. |
| **Critical fluid limit exceeded repeatedly** | Alarm fatigue / audio blocking. | Web Audio synthesized beeps re-trigger on every additional fluid submission. |
| **Patient accesses offline inside hospital ward** | Network disconnect. | PWA Service Worker handles offline caching; data writes to local reactive store. |
| **Elderly patient touch target accuracy** | Finger tremors or neuropathy. | All buttons, tabs, inputs, and Likert choices strictly enforce `min-h-[48px]`. |

---

## 6. Regulatory, Compliance & Accessibility Metrics

- **WCAG 2.1 Level AA Compliance:** 100% pass on color contrast (minimum 4.5:1 for text), clear focus rings, and touch targets $\ge 48\text{px}$.
- **Zero Horizontal Viewport Overflow:** Tested and verified on ultra-compact mobile viewports (375x667, iPhone SE).
- **Internationalization Parity:** 100% parity across all 600+ translation keys in `ar.json` and `en.json`.
- **Medical Disclaimer:** Visible on patient dashboards and footer: *"DialyCare is a supportive tracking companion and does not replace emergency clinical judgment."*
