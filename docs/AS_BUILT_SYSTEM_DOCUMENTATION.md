# DialyCare — As-Built System Documentation
**Target Audience:** Engineers & DevOps  
**System Name:** DialyCare (Bilingual Hemodialysis Care & Adherence Platform)  
**Production URL:** [https://dialycare.vercel.app](https://dialycare.vercel.app)  
**Repository:** [https://github.com/mohamedelsaadany-art/DialyCare](https://github.com/mohamedelsaadany-art/DialyCare)  
**Branch:** `main` | **Next.js Version:** `16.4.5` (Turbopack, App Router)  
**Node.js Runtime:** `v24.x` / `v20.x` LTS  
**Current Version:** `v2.7.0` (Instant Patient Activation, Staff-Only Approvals Center & Nurse/Admin Integration)  

---

## 1. System Architecture Overview

DialyCare is architected as a high-performance, offline-first Progressive Web Application (PWA) tailored specifically for chronic hemodialysis patients, nephrologists, and dialysis unit nursing teams. The system delivers real-time clinical monitoring, fluid overload warnings, dialysis session logging, laboratory auditing, validated monthly adherence tracking, and cross-device cloud synchronization with Super Admin approval queues.

```
                           +---------------------------------------+
                           |       Next.js 16 App Router           |
                           |   (Turbopack, SSG/PPR + React 19)     |
                           +-------------------+-------------------+
                                               |
                     +-------------------------+-------------------------+
                     |                         |                         |
         +-----------v-----------+ +-----------v-----------+ +-----------v-----------+
         |    Patient Portal     | |    Doctor & Staff     | |   Super Admin Portal  |
         |    (/[locale]/patient)| |  (/[locale]/admin)    | | (/[locale]/admin/     |
         |  (Instant Activation) | |  (Staff RBAC Gate)    | |       approvals)      |
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
             |    Cloud Store      |                       |    LocalStorage     |
             |   (Vercel Blob)     |                       |   (Browser/Client)  |
             | /api/auth/register  |                       | (DIALYCARE_AUTH_...) |
             | /api/auth/accounts  |                       |                     |
             | /api/auth/approve   |                       +----------+----------+
             | /api/auth/reject    |                                  |
             +---------------------+                       +----------v----------+
                                                           |    Memory Storage   |
                                                           |  (SSR/Node Testing) |
                                                           +---------------------+
```

### Key Architectural Tenets:
1. **Instant Patient Self-Registration & Clinical Directory Enrollment:** Patients self-registering receive `status: 'active'` immediately. Their full nephrology profile (dialysis schedule, target dry weight, vascular access, viral hepatitis/HIV markers, and emergency contact) is automatically enrolled into `DIALYCARE_PATIENTS`. Patients can log in immediately with zero administrative friction.
2. **Clinical Staff & Admin Approvals Subsystem:** Registration approval in `/admin/approvals` is strictly dedicated to clinical staff: Nephrologists (`doctor`), Dialysis Nurses (`nurse`), and Unit Administrators (`staff`). Staff register with `status: 'pending'`, upload professional credentials (medical syndicate / hospital ID), and must be approved by the Super Admin before clinical access is granted.
3. **Cross-Device Cloud Synchronization (Vercel Blob):** Integrated persistent cloud storage (`dialycare_cloud_accounts.json` & `dialycare_cloud_patients.json`) connected to project `dialycare`. Cross-device registrations submitted on mobile devices automatically propagate to desktop clinic approval dashboards via Next.js API endpoints (`/api/auth/*`).
4. **Permanent Session Retention & Zero-Eviction Gate:** Session preservation engine in `auth-context.tsx` and `AdminLayout`. Super Admin accounts (`admin` / `admin-1`) have permanent immunity against refresh logouts. Eviction strictly occurs only when an account is explicitly `'rejected'` or `'pending'`.
5. **Administrative Contacts Configuration:**
   - **Primary Administrator (Senior Resident in Nephrology):** `+201080641670`
   - **Technical Administrator:** `+201552885823`
3. **Local-First Clinical Resilience:** Functions with 100% offline persistence using synchronized Web Storage with in-memory fallbacks when network connectivity is lost in hospital dialysis units.
4. **Deterministic Mathematical Engines:** Formulas for interdialytic fluid allowances, dry weight thresholds, and survey adherence percentages run client-side with zero latency.
5. **Bi-directional Reactive Event Bus:** Dispatches custom DOM events (`dialycare_approvals_updated`, `dialycare_users_updated`, `storage`, etc.) keeping tabs and components in sync.

---

## 2. Technology Stack & Runtime Specifications

| Layer | Component | Specification |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.4.5 | Turbopack compilation, App Router, React 19 Client/Server split |
| **Language** | TypeScript 5.x | Strict mode (`strict: true`), 100% type annotations |
| **Styling** | Tailwind CSS v4 | Fully customized healthcare palette (`#1e6bb8`, slate, emerald, amber, red) |
| **Cloud Storage** | Vercel Blob | Store `dialycare-data` (`store_LRYhru7zHAi3bC2n`) with global Edge CDN caching |
| **State & Auth** | React Context + Web Storage | Local-first persistence, reactive custom event bus, and cloud synchronization |
| **PWA & Offline** | Service Worker (`public/sw.js`) | Cache-first for assets, offline fallback page, push notification payload listeners |
| **Audio Alerting** | Web Audio API | Client-side synthesizers generating 880Hz alternating warning tone for critical fluid overload |
| **Testing** | Node test runner + TSX | 3,432 automated assertions across 10 master suites, adversarial auth suite, and regression tests |

---

## 3. Cloud Store & API Route Schema

### 3.1 Next.js API Routes (`src/app/api/auth/`)
- `POST /api/auth/register`:
  - Request: `{ type: 'doctor' | 'patient', data: RegistrationPayload }`
  - Response: `{ success: true, user: User }`
  - Action: Ingests into `dialycare_cloud_accounts.json`, assigns UID and `pending` status.
- `GET /api/auth/accounts`:
  - Request: Optional cache-busting timestamp parameter `?t=...`
  - Response: `{ success: true, accounts: StoredAccount[], users: User[] }`
  - Action: Reads latest accounts from Vercel Blob Edge CDN or in-memory fallback.
- `POST /api/auth/approve`:
  - Request: `{ uid: string, reviewerName?: string }`
  - Response: `{ success: true, user: User, newPatient?: Patient }`
  - Action: Updates status to `'active'`, creates and persists enrolled patient profile.
- `POST /api/auth/reject`:
  - Request: `{ uid: string, reason: string, reviewerName?: string }`
  - Response: `{ success: true, user: User }`
  - Action: Updates status to `'rejected'` with reviewer note.

### 3.2 Patient Intake & Viral Markers Schema (`src/lib/types.ts`)
```typescript
export interface PatientRegistrationProfile {
  dialysisSchedule: 'SMW' | 'STT';
  dryWeightKg: number;
  accessType: 'AVF' | 'AVG' | 'Permcath' | 'Mahurkar';
  dialysisCenter?: string;
  age?: number;
  gender?: 'male' | 'female';
  viralMarkers?: {
    hcv?: boolean; // Hepatitis C Virus
    hbv?: boolean; // Hepatitis B Virus
    hiv?: boolean; // Human Immunodeficiency Virus
  };
  emergencyContact?: {
    name: string;
    phone: string;
    relationship?: string;
  };
}
```

---

## 4. Security & Role-Based Access Control (RBAC)

1. **Super Admin Guard:**
   - Restricted to `admin` / `admin123` (password rotatable via `/admin/settings`).
   - Permanent active status; immune to session eviction on refresh.
   - Exclusive access to `/admin/approvals` for approving doctor Syndicate IDs and enrolling patients.
2. **Clinician Access Gate:**
   - Doctors self-register with full credentials and Syndicate ID photo upload.
   - Status defaults to `'pending'`; blocked from accessing clinical dashboards until approved by Super Admin.
   - Once approved (`status: 'active'`), doctors gain full access to patient logs, dialysis session records, and medication prescribing.
3. **Patient Access Gate:**
   - Self-registered patients remain in `'pending'` review state.
   - Attempting to sign in surfaces a branded review screen with a direct WhatsApp link to the Senior Resident (`+201080641670`).
   - Doctors can also provision patients in-clinic with auto-generated credentials (`$P_{phone} + \Sigma_{safe}^3`), which are pre-approved and immediately active.

---

## 5. Verification & Test Metrics

- **Master Test Runner (`run-all.ts`):** 10/10 suites, 2,118 assertions passing.
- **Adversarial Auth Suite (`adversarial-auth-edgecases.test.ts`):** 1,253 assertions passing.
- **Regression Cloud & Refresh Suite (`regression-refresh-cloudsync.test.ts`):** 61 assertions passing.
- **Total Assertions:** **3,432 / 3,432 passing (100% green)**.
- **Production Build:** Next.js 16 Turbopack compiled 56 routes with zero errors.
