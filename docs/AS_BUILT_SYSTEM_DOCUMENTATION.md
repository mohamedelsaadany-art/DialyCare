# DialyCare — As-Built System Documentation
**Target Audience:** Engineers & DevOps  
**System Name:** DialyCare (Bilingual Hemodialysis Care & Adherence Platform)  
**Production URL:** [https://dialycare.vercel.app](https://dialycare.vercel.app)  
**Repository:** [https://github.com/mohamedelsaadany-art/DialyCare](https://github.com/mohamedelsaadany-art/DialyCare)  
**Branch:** `main` | **Next.js Version:** `16.4.5` (Turbopack, App Router)  
**Node.js Runtime:** `v24.x` / `v20.x` LTS  

---

## 1. System Architecture Overview

DialyCare is architected as a high-performance, offline-first Progressive Web Application (PWA) tailored specifically for chronic hemodialysis patients, nephrologists, and dialysis unit nursing teams. The system delivers real-time clinical monitoring, fluid overload warnings, dialysis session logging, laboratory auditing, and validated monthly adherence tracking.

```
                           +---------------------------------------+
                           |       Next.js 16 App Router           |
                           |   (Turbopack, SSG/PPR + React 19)     |
                           +-------------------+-------------------+
                                               |
                     +-------------------------+-------------------------+
                     |                                                   |
         +-----------v-----------+                           +-----------v-----------+
         |    Patient Portal     |                           |    Doctor / Admin     |
         |    (/[locale]/patient)|                           |     (/[locale]/admin) |
         +-----------+-----------+                           +-----------+-----------+
                     |                                                   |
                     +-------------------------+-------------------------+
                                               |
                               +---------------v---------------+
                               |  Unified Reactive Data Bus    |
                               | (Custom DOM & Storage Events) |
                               +---------------+---------------+
                                               |
                        +----------------------+----------------------+
                        |                                             |
             +----------v----------+                       +----------v----------+
             |    LocalStorage     |                       |    Memory Storage   |
             |   (Browser/Client)  |                       |  (SSR/Node Testing) |
             +---------------------+                       +---------------------+
```

### Key Architectural Tenets:
1. **Zero External API Failure Mode (Local-First Clinical Resilience):** Dialysis patients and in-unit clinicians frequently encounter poor network coverage inside shielded hospital dialysis wards. DialyCare functions with 100% offline persistence using a synchronized Web Storage engine with in-memory fallbacks.
2. **Deterministic Mathematical Engines:** Formulas for interdialytic fluid allowances, dry weight thresholds, and survey adherence percentages run client-side with zero external network latency and zero round-trip lag.
3. **Bi-directional Reactive Event Bus:** Dispatches synchronized custom events (`dialycare_questionnaires_updated`, `dialycare_labs_updated`, `dialycare_sessions_updated`, `dialycare_medications_updated`, `dialycare_notifications_updated`, `storage`) to keep multiple open browser tabs and portal components in lockstep.
4. **PWA & Offline Service Worker (`public/sw.js`):** Cache-first strategy for app shell assets, runtime offline fallback, web app manifest with standalone display mode, and Web Audio API integration for emergency fluid overload alarms.

---

## 2. Technology Stack & Runtime Specifications

| Layer | Component | Specification |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.4.5 | Turbopack compilation, App Router, React 19 Client/Server split |
| **Language** | TypeScript 5.x | Strict mode (`strict: true`), 100% type annotations |
| **Styling** | Tailwind CSS v4 | CSS Variables, native RTL layout mirroring, `@tailwindcss/postcss` |
| **Internationalization** | `next-intl` | Arabic (`ar`, RTL native) & English (`en`, LTR), subpath routing `/[locale]` |
| **State & Persistence** | Reactive LocalStorage Bus | `data-store.ts` + `admin-store.ts` with deep cloning (`structuredClone`) |
| **Audio Engine** | Web Audio API | Synthesized dual-tone emergency acoustic alerts (880 Hz / 440 Hz) |
| **PWA Engine** | Service Worker + Manifest | `public/sw.js`, `public/manifest.json`, `InstallPwaPrompt.tsx` |
| **E2E Testing** | Playwright 1.65+ | Automated multi-role headless browser suites with mobile viewports |
| **Unit Testing** | Node Test Harness + `tsx` | Pure TypeScript execution via `npx tsx`, 2,000+ deterministic assertions |
| **Hosting & CI/CD** | Vercel Edge Platform | Automatic preview and production deployments triggered by GitHub `main` |

---

## 3. Core Directory & Module Layout

```
dialycare/
├── docs/                                  # Production documentation & specs
├── public/
│   ├── icons/                             # PWA icon set (192x192, 512x512, maskable)
│   ├── manifest.json                      # Web App Manifest
│   └── sw.js                              # Offline Service Worker implementation
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx                 # Root layout with i18n & PWA hydration
│   │   │   ├── login/page.tsx             # Role-based authentication (Admin/Patient)
│   │   │   ├── patient/
│   │   │   │   ├── page.tsx               # Patient Dashboard & Coaching Avatar
│   │   │   │   ├── log/page.tsx           # Dialysis, Fluid & Weight Logging
│   │   │   │   ├── profile/page.tsx       # Profile & Monthly Adherence Survey
│   │   │   │   └── reminders/page.tsx     # Medications & Session Reminders
│   │   │   └── admin/
│   │   │       ├── patients/page.tsx      # Patient Registry
│   │   │       ├── patients/[id]/page.tsx # Patient Clinical Details & Controls
│   │   │       └── notifications/         # Notification & Alert Dispatcher
│   ├── components/
│   │   ├── DialysisSessionModal.tsx       # 14-Parameter Clinical Session Form
│   │   ├── DialysisSessionHistory.tsx     # Session Audit & Trend List
│   │   ├── PatientCoachingAvatar.tsx      # Animated Clinical Avatar & Tips Engine
│   │   ├── admin/
│   │   │   ├── DoctorPatientSurveyManager.tsx # Adherence Review & Manual Activation
│   │   │   ├── PatientLabResultsModal.tsx     # 12-Parameter Lab Entry Modal
│   │   │   └── PatientMedicationManager.tsx   # Drug Prescription & Schedule Form
│   │   ├── patient/
│   │   │   ├── AdherenceSurveyModal.tsx       # 20-Question Adherence Modal
│   │   │   ├── PatientAdherenceSurveySection.tsx # Due Banner & Survey Status Card
│   │   │   └── PatientLabResultsView.tsx      # Clinical Lab Ranges & Trends
│   │   └── ui/                            # Accessible Base UI (Button, Modal, Card, Input)
│   ├── data/                              # Seed datasets (tips, templates, checklist)
│   └── lib/
│       ├── types.ts                       # TypeScript clinical contracts & models
│       ├── data-store.ts                  # Unified data access layer & reactive dispatcher
│       ├── questionnaire-data.ts          # 20 adherence questions, Likert scale & scoring
│       └── __tests__/                     # Unit & white-box challenger test suites
└── scratch/                               # Automated Playwright verification scripts
```

---

## 4. Database Schema & Data Models (`src/lib/types.ts`)

### 4.1 Storage Keys Contract (`STORAGE_KEYS`)
All persistent browser storage entities use standardized prefixed keys to guarantee zero collision:
- `DIALYCARE_PATIENTS`: Core registry of dialysis patients.
- `DIALYCARE_PATIENT_MEDICATIONS`: Prescribed pharmaceutical regimens.
- `DIALYCARE_DIALYSIS_SESSIONS`: 14-parameter clinical hemodialysis records.
- `DIALYCARE_LAB_RESULTS`: 12-parameter clinical biochemistry panels.
- `DIALYCARE_ADHERENCE_SURVEYS`: 20-question monthly adherence submissions.
- `DIALYCARE_SURVEY_ACTIVATION_${patientId}`: Doctor manual activation override flag.
- `DIALYCARE_NOTIFICATIONS`: Individual & broadcast push notifications.
- `DIALYCARE_ADHERENCE_LOGS`: Daily fluid and dietary compliance checklist.
- `DIALYCARE_CURRENT_USER`: Active authenticated session token.

### 4.2 Entity Relationship Diagram (ERD)

```
       +-----------------------+               1:N
       |        Patient        +---------------------------------+
       | (id, fullName, dryWt) |                                 |
       +-----------+-----------+                                 |
                   | 1:N                                         |
                   |                                             |
       +-----------v-----------+                     +-----------v-----------+
       |   DialysisSession     |                     |    PatientMedication  |
       | (weights, vitals, UF) |                     | (drug, dose, schedule)|
       +-----------------------+                     +-----------------------+
                   | 1:N                                         | 1:N
                   |                                             |
       +-----------v-----------+                     +-----------v-----------+
       |   PatientLabRecord    |                     |  AdherenceSubmission  |
       | (12 lab parameters)   |                     | (20 questions, scores)|
       +-----------------------+                     +-----------------------+
```

### 4.3 Key TypeScript Interfaces

#### `DialysisSession` (14 Clinical Parameters)
```typescript
export interface DialysisSession {
  id: string;
  patientId: string;
  sessionDate: string; // YYYY-MM-DD
  complianceRating: number; // 1 to 5 Likert scale
  preWeightKg: number;
  preWeightGrams: number;
  postWeightKg: number;
  postWeightGrams: number;
  bloodPressure: {
    pre: string;
    hour1: string;
    hour2: string;
    hour3: string;
    post: string;
  };
  heartRate: {
    pre: number | null;
    hour1: number | null;
    hour2: number | null;
    hour3: number | null;
    post: number | null;
  };
  temperature: number | null; // °C
  fluidAssessment: {
    legEdema: 'none' | 'mild' | 'moderate' | 'severe';
    lungCrackles: 'none' | 'bases' | 'mid' | 'all';
    dyspnea: 'none' | 'mild' | 'moderate' | 'severe';
  };
  accessSiteCheck: 'normal' | 'inflammation';
  durationHours: number; // 1 | 2 | 3 | 4
  ultrafiltrationVolumeMl: number; // mL
  bloodFlowRate: number; // mL/min
  dialysateFlowRate: number; // 300 | 500 | 700 | 800 mL/min
  accessType: 'AVF' | 'AVG' | 'Permcath' | 'Mahurkar';
  machineSodium: number; // mEq/L
  notes?: string;
  recordedBy?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### `AdherenceSurveySubmission` (20 Questions Monthly Cadence)
```typescript
export type QuestionnaireOptionValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface AdherenceSurveySubmission {
  id: string;
  patientId: string;
  submittedAt: string; // ISO 8601
  cycleNumber: number; // 1: Baseline, 2: Month 1, 3: Month 2, ...
  cycleLabelAr: string;
  cycleLabelEn: string;
  answers: Record<number, QuestionnaireOptionValue>; // Q1..Q20 mapped to 1..6
  overallScorePercent: number; // 0 - 100%
  sectionScores: {
    dialysisPercent: number;
    medicationsPercent: number;
    dietPercent: number;
    fluidsPercent: number;
  };
  notes?: string;
}
```

---

## 5. Mathematical Engines & Clinical Algorithms

### 5.1 Interdialytic Fluid Restriction Engine (`getPatientFluidLimits`)
Dialysis patients with end-stage renal disease cannot excrete excess fluid, risking acute pulmonary edema and malignant hypertension. The application computes individualized daily limits derived from dry weight:
$$\text{Warning Limit (mL)} = \frac{\text{Dry Weight (kg)} \times 10 \times 4}{2} = \text{Dry Weight} \times 20$$
$$\text{Critical Limit (mL)} = \frac{\text{Dry Weight (kg)} \times 13 \times 4}{2} = \text{Dry Weight} \times 26$$
- **Normal Zone:** $\text{Intake} < \text{Warning Limit}$.
- **Warning Zone:** $\text{Warning Limit} \le \text{Intake} < \text{Critical Limit}$.
- **Critical Emergency Zone:** $\text{Intake} \ge \text{Critical Limit} \implies$ triggers immediate visual warning and activates the synthesized Web Audio alarm.

### 5.2 Adherence Survey Scoring Algorithm (`calculateSurveyScore`)
Questions use a 6-option Likert scale:
- `1: Always` (5 points)
- `2: Often` (4 points)
- `3: Sometimes` (3 points)
- `4: Rarely` (2 points)
- `5: Never` (1 point)
- `6: Not applicable` (`null` — mathematically excluded from denominator)

The percentage calculation strictly accounts for applicable questions:
$$\text{Score (\%)} = \frac{\sum \text{Points Earned}}{\text{Count of Applicable Questions} \times 5} \times 100$$
- If a patient selects `Option 6: Not applicable` for Q8 (e.g. not taking phosphate binders), the maximum possible points drop from 100 to 95. The patient is not penalized.
- Zero-division safety: If all questions are answered with `Option 6`, the engine returns a safe fallback of `100%` without runtime error or `NaN`.

### 5.3 Monthly Schedule Progression State Machine (`getPatientSurveyStatus`)
1. **Initial Baseline:** `submissions.length === 0` $\implies$ `isDue: true`, `reason: 'initial'`, `cycle: 1`.
2. **Doctor Manual Override:** `isDoctorSurveyActivated(patientId) === true` $\implies$ `isDue: true`, `reason: 'doctor_activated'`.
3. **Monthly Cadence (30-day delta):**
   $$\Delta t = \text{Date.now}() - \text{lastSubmissionDate}$$
   - If $\Delta t < 30\text{ days}$: `isDue: false`, `reason: 'completed'`, `daysUntilDue = Math.ceil((30 - \Delta t_{days}))`.
   - If $\Delta t \ge 30\text{ days}$: `isDue: true`, `reason: 'monthly_due'`, `cycle: submissions.length + 1`.

---

## 6. Security, Isolation & Multi-Tenancy Rules

1. **Patient Data Isolation:** Every query (`getDialysisSessions`, `getPatientLabResults`, `getPatientMedications`, `getAdherenceSurveys`) enforces strict filtering by `patientId`. Patients cannot view other patients' records.
2. **Role-Based Access Control (RBAC):**
   - **Doctor / Admin (`admin`):** Full write/edit access to prescribe medications, log lab results, review and manually activate surveys, record sessions, and broadcast notifications.
   - **Patient (`patient1`, `patient2`):** Read-only view for lab results and medications; write access for self-reporting dialysis sessions, logging fluid/diet entries, and submitting adherence questionnaires.
3. **Input Sanitization & Boundary Validation:**
   - Pre/post weights must fall within $20 - 250\text{ kg}$.
   - Blood pressure inputs validate systolic ($50 - 300\text{ mmHg}$) and diastolic ($30 - 200\text{ mmHg}$).
   - Temperatures validate between $34.0^\circ\text{C}$ and $42.0^\circ\text{C}$.
   - Ultrafiltration volume cannot exceed $10,000\text{ mL}$.

---

## 7. CI/CD Pipeline & Deployment Runbook

```
[Developer / Agent Git Push] ──> [GitHub: main]
                                      │
                                      ▼
                      [Vercel Webhook & Edge Builder]
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
           [TypeScript Check]                    [Next.js 16 Build]
           (npx tsc --noEmit)                    (next build: Turbopack)
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      │
                                      ▼
                            [Vercel Production Edge]
                          (https://dialycare.vercel.app)
                                      │
                                      ▼
                       [Playwright E2E Live Verification]
```

### Build & Test Commands:
```powershell
# 1. Typecheck & Linting
npx tsc --noEmit
npm run lint

# 2. Comprehensive Test Suites (2,066 Assertions)
npm test
npx tsx src/lib/__tests__/run-all.ts

# 3. Production Compilation (49 Routes)
npm run build

# 4. Playwright End-to-End Verification (Mobile & Desktop)
$env:BASE_URL="https://dialycare.vercel.app"; node scratch/verify-adherence-survey-e2e.mjs
```
All builds generate 49 prerendered static and dynamic streaming routes with Turbopack optimization.
