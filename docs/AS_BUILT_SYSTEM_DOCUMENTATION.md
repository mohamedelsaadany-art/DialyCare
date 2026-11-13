# DialyCare — As-Built System Documentation
**Target Audience:** Engineers & DevOps  
**System Name:** DialyCare (Bilingual Hemodialysis Care & Adherence Platform)  
**Production URL:** [https://dialycare.vercel.app](https://dialycare.vercel.app)  
**Repository:** [https://github.com/mohamedelsaadany-art/DialyCare](https://github.com/mohamedelsaadany-art/DialyCare)  
**Branch:** `main` | **Next.js Version:** `16.4.5` (Turbopack, App Router)  
**Node.js Runtime:** `v24.x` / `v20.x` LTS  
**Current Version:** `v2.5.0` (Real Auth, Approvals & Patient Auto-Provisioning)  

---

## 1. System Architecture Overview

DialyCare is architected as a high-performance, offline-first Progressive Web Application (PWA) tailored specifically for chronic hemodialysis patients, nephrologists, and dialysis unit nursing teams. The system delivers real-time clinical monitoring, fluid overload warnings, dialysis session logging, laboratory auditing, validated monthly adherence tracking, and full real-time authentication with Super Admin approval queues.

```
                           +---------------------------------------+
                           |       Next.js 16 App Router           |
                           |   (Turbopack, SSG/PPR + React 19)     |
                           +-------------------+-------------------+
                                               |
                     +-------------------------+-------------------------+
                     |                         |                         |
         +-----------v-----------+ +-----------v-----------+ +-----------v-----------+
         |    Patient Portal     | |    Doctor Portal      | |   Super Admin Portal  |
         |    (/[locale]/patient)| |  (/[locale]/admin)    | | (/[locale]/admin/     |
         |                       | |  (Staff RBAC Gate)    | |       approvals)      |
         +-----------+-----------+ +-----------+-----------+ +-----------+-----------+
                     |                         |                         |
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
             | (DIALYCARE_AUTH_...) |                       |                     |
             +---------------------+                       +---------------------+
```

### Key Architectural Tenets:
1. **Zero External API Failure Mode (Local-First Clinical Resilience):** Dialysis patients and in-unit clinicians frequently encounter poor network coverage inside shielded hospital dialysis wards. DialyCare functions with 100% offline persistence using a synchronized Web Storage engine with in-memory fallbacks, while providing a clear bridge to Firebase Cloud Auth.
2. **Deterministic Mathematical Engines:** Formulas for interdialytic fluid allowances, dry weight thresholds, and survey adherence percentages run client-side with zero external network latency and zero round-trip lag.
3. **Bi-directional Reactive Event Bus:** Dispatches synchronized custom events (`dialycare_questionnaires_updated`, `dialycare_labs_updated`, `dialycare_sessions_updated`, `dialycare_medications_updated`, `dialycare_notifications_updated`, `dialycare_approvals_updated`, `storage`) to keep multiple open browser tabs and portal components in lockstep.
4. **PWA & Offline Service Worker (`public/sw.js`):** Cache-first strategy for app shell assets, runtime offline fallback, web app manifest with standalone display mode, and Web Audio API integration for emergency fluid overload alarms.
5. **Real Production Sign Up & Sign In:** Local-first identity management supporting phone number, email, and username credentials with clinical audit status gates (`active`, `pending`, `rejected`).

---

## 2. Technology Stack & Runtime Specifications

| Layer | Component | Specification |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.4.5 | Turbopack compilation, App Router, React 19 Client/Server split |
| **Language** | TypeScript 5.x | Strict mode (`strict: true`), 100% type annotations |
| **Styling** | Tailwind CSS v4 | CSS Variables, native RTL layout mirroring, `@tailwindcss/postcss` |
| **Internationalization** | `next-intl` | Arabic (`ar`, RTL native) & English (`en`, LTR), subpath routing `/[locale]` |
| **Authentication** | `AuthContext` + Storage Bus | `login()`, `registerDoctor()`, `registerPatient()`, `status: AccountStatus` |
| **State & Persistence** | Reactive LocalStorage Bus | `data-store.ts` + `admin-store.ts` with deep cloning (`structuredClone`) |
| **Audio Engine** | Web Audio API | Synthesized dual-tone emergency acoustic alerts (880 Hz / 440 Hz) |
| **PWA Engine** | Service Worker + Manifest | `public/sw.js`, `public/manifest.json`, `InstallPwaPrompt.tsx` |
| **E2E Testing** | Playwright 1.65+ | Automated multi-role headless browser suites with mobile viewports |
| **Unit Testing** | Node Test Harness + `tsx` | Pure TypeScript execution via `npx tsx`, 2,115 deterministic assertions |
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
│   │   │   ├── login/page.tsx             # Real Sign Up & Sign In with Pending Guard
│   │   │   ├── patient/
│   │   │   │   ├── page.tsx               # Patient Dashboard & Coaching Avatar
│   │   │   │   ├── log/page.tsx           # Dialysis, Fluid & Weight Logging
│   │   │   │   ├── profile/page.tsx       # Profile & Monthly Adherence Survey
│   │   │   │   └── reminders/page.tsx     # Medications & Session Reminders
│   │   │   └── admin/
│   │   │       ├── layout.tsx             # Staff Auth Gate (Doctor & Admin) + Badge
│   │   │       ├── approvals/page.tsx     # Super Admin Registration Approvals Queue
│   │   │       ├── patients/page.tsx      # Patient Registry
│   │   │       ├── patients/new/page.tsx  # In-Clinic Patient Provisioning & Auto-Creds
│   │   │       ├── patients/[id]/page.tsx # Patient Clinical Details & Controls
│   │   │       ├── settings/page.tsx      # Clinical Settings & Master Password Rotation
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
│       ├── auth-context.tsx               # AuthProvider, LoginResult, Session Persistence
│       ├── questionnaire-data.ts          # 20 adherence questions, Likert scale & scoring
│       └── __tests__/                     # 10 Unit & white-box challenger test suites
└── test-e2e-auth-approvals.mjs            # Automated Playwright 6-journey E2E verification
```

---

## 4. Database Schema & Data Models (`src/lib/types.ts`)

### 4.1 Storage Keys Contract (`STORAGE_KEYS`)
All persistent browser storage entities use standardized prefixed keys to guarantee zero collision:
- `DIALYCARE_AUTH_ACCOUNTS`: User account registry with hashed passwords, roles, and review statuses.
- `DIALYCARE_ADMIN_CREDENTIALS`: Master Super Admin password rotation store (default: `admin123`).
- `DIALYCARE_PATIENTS`: Core clinical registry of active dialysis patients.
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
       |       AuthAccount     +---------------------------------+
       | (username, role, stat)|                                 |
       +-----------+-----------+                                 |
                   | 1:1                                         |
       +-----------v-----------+               1:N               |
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

#### `User` and `AccountStatus`
```typescript
export type UserRole = 'admin' | 'doctor' | 'patient';
export type AccountStatus = 'active' | 'pending' | 'rejected';

export interface User {
  uid: string;
  role: UserRole;
  username: string;
  displayName: string;
  language: 'ar' | 'en';
  status?: AccountStatus;
  phone?: string;
  email?: string;
  specialty?: string;
  hospital?: string;
  idCardDataUrl?: string;
  patientProfile?: PatientRegistrationProfile;
  registeredAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}
```

#### `PatientRegistrationProfile` & `GeneratedPatientCredentials`
```typescript
export interface PatientRegistrationProfile {
  dialysisSchedule: 'SMW' | 'STT';
  dryWeightKg: number;
  accessType: 'AVF' | 'AVG' | 'Permcath' | 'Mahurkar';
  dialysisCenter: string;
  age?: number;
  gender?: 'male' | 'female';
}

export interface GeneratedPatientCredentials {
  username: string;
  password: string;
  phone: string;
  randomSuffix: string;
}
```

---

## 5. Security, Isolation & Multi-Tenancy Rules

1. **Pending Account Security Guard:** Any account with `status: 'pending'` or `status: 'rejected'` is prohibited from establishing a persistent session. The login interface immediately intercepts the attempt and surfaces the appropriate clinical review or rejection card with a direct WhatsApp contact link targeting `ADMIN_CONFIG.primaryPhone` (`+201552885823`).
2. **Super Admin Restricted Access:** Only `user.role === 'admin'` can access `/admin/approvals` and rotate master credentials in `/admin/settings`.
3. **Staff Privileges for Clinicians (`isStaff = isAdmin || isDoctor`):** Doctors (`role === 'doctor'`) have access to `/admin/patients`, clinical recording, and prescribing, but cannot approve other doctors or modify system settings.
4. **Safe Credential Generation Algorithm ($P_{phone} + \Sigma_{safe}^3$):** In-clinic patient account creation automatically generates passwords using the patient's phone concatenated with 3 random, distinct, non-overlapping characters drawn strictly from a sanitized alphabet excluding confusing glyphs (`0, O, 1, l, I`):
   $$\Sigma_{safe} = \{a..z, A..Z, 2..9\} \setminus \{0, O, 1, l, I\}$$
5. **Patient Data Isolation:** Every query (`getDialysisSessions`, `getPatientLabResults`, `getPatientMedications`, `getAdherenceSurveys`) enforces strict filtering by `patientId`.

---

## 6. CI/CD Pipeline & Deployment Runbook

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

# 2. Comprehensive Test Suites (2,115 Assertions across 10 Suites)
npm test
npx tsx src/lib/__tests__/run-all.ts

# 3. Production Compilation (52 Routes)
npm run build

# 4. Playwright End-to-End Verification (Mobile & Desktop)
node test-e2e-auth-approvals.mjs
```
All builds generate 52 prerendered static and dynamic streaming routes with Turbopack optimization.
