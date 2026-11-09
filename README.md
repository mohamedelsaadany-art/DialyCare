# DialyCare (دياكير)
### Clinical Adherence, Fluid & Diet Coaching Platform for ESRD Patients on Hemodialysis

DialyCare is a full-stack medical Progressive Web App (PWA) and clinical portal tailored specifically for End-Stage Renal Disease (ESRD) patients undergoing maintenance hemodialysis. It bridges the critical interdialytic gap between hospital sessions with automated reminders, adherence tracking, educational coaching, and real-time clinical broadcast & individual messaging from attending healthcare providers.

---

## 🌟 Key Capabilities

### 📱 For Patients (Mobile PWA)
- **Triple Adherence Tracking**:
  - **Medication (TTT)**: Scheduled morning, afternoon, and evening medication acknowledgment (Taken ✅ / Skipped ⏭️).
  - **Fluid Management**: Track fluid in **milliliters (mL)** or **cups** with quick-add shortcuts (100mL, 200mL, 250mL, 500mL, 1 cup = 240mL) and automated progress bars against personalized daily allowances (e.g. 1000 mL).
  - **Renal Diet Checklist**: Meal-by-meal adherence checks (low sodium, limited potassium, controlled phosphorus, adequate high-biological protein, fluid in food).
- **On-Demand Doctor Messages & Clinical Inbox**:
  - Receive urgent advisories, lab work notices, medication adjustments, and dialysis schedule updates dispatched live by attending clinicians.
  - Interactive notification bell with unread badge and instant alert banner on dashboard.
  - Browser notifications via Service Worker fallback on Android Chrome.
- **Smart Dialysis Day Awareness**:
  - Automatically identifies whether today is an on-site treatment day (`MWF` Mon/Wed/Fri or `TTS` Tue/Thu/Sat) or interdialytic home rest day.
  - Delivers tailored clinical alerts (e.g. vascular access thrill check, pre-dialysis weight, phosphate binder timing).
- **30+ Preloaded Bilingual Coaching Tips**:
  - Evidence-based renal education across Diet, Fluid, Medication, and General Vascular Care in English and medical Arabic.
- **Accessible Design for Elderly Patients**:
  - High-contrast clinical typography, minimum 48px touch targets, and full RTL layout support for Arabic.

### 💻 For Healthcare Providers (Admin Dashboard)
- **Patient Population Management**:
  - Manage ~150+ patients, configure custom dialysis shifts (`MWF` vs `TTS`), and customize baseline reminder times.
  - Register new patient accounts with persistent credentials.
- **Live Adherence Analytics & Flagging**:
  - Population adherence rates across TTT, Fluid, and Diet.
  - Visual trend charts (LineChart, BarChart, Status Tier PieChart via Recharts).
  - Automatic flagging of non-adherent patients (<70% critical threshold).
- **One-Click Clinical Communications**:
  - **Broadcast**: Send clinic-wide announcements to all 150+ patients.
  - **Shift Groups**: Target patients on specific dialysis shifts (e.g., MWF morning run).
  - **Direct Patient Chart Alerts**: Compose on-demand advisories directly inside individual patient charts (`/admin/patients/[id]`).
- **Reporting & Auditing**:
  - Client-side export to **CSV** and styled **PDF reports** (via jsPDF & autoTable).

---

## 🔐 Demo Accounts & Credentials

The system initializes with demo accounts for immediate clinical testing:

| Role | Username | Password | Notes |
|---|---|---|---|
| **Attending Clinician (Admin)** | `admin` | `admin123` | Full dashboard, patient management, analytics, messaging |
| **Patient 1 (Ahmed Mahmoud)** | `patient1` | `patient123` | Dialysis schedule: MWF (Mon/Wed/Fri), fluid limit: 1000 mL |
| **Patient 2 (Fatima El-Sayed)** | `patient2` | `patient123` | Dialysis schedule: TTS (Tue/Thu/Sat), fluid limit: 800 mL |

*Note: Usernames are case-insensitive (e.g. `Patient1` or `admin`). Attending physicians can register new patients at any time through the Admin Portal.*

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (tested on Node 20 / 22)
- npm or pnpm

### Installation
```bash
# Clone or navigate to the directory
cd dialycare

# Install dependencies (already initialized)
npm install
```

### Running Locally
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser:
- Redirects to `/en/login` or `/ar/login`.
- Toggle between English and العربية at the top-right corner.

---

## 📲 How to Install as an App on Android (PWA)

DialyCare is a full Progressive Web App with zero app-store friction:

1. **Deploy or host** over HTTPS (e.g., Vercel free tier) or open `http://<your-local-ip>:3000` on your Android phone's Chrome browser.
2. An automatic install prompt appears at the top:
   > *"📲 Install DialyCare on your phone for easy daily access and reminders"*
3. Tap **Install (تثبيت)** or open the Chrome menu (⋮) and tap **Add to Home Screen / Install app**.
4. The DialyCare icon appears on your home screen and launches standalone without browser navigation bars.
5. Reminders and cached views function even when offline!

---

## 📦 Building a Native Android APK (Capacitor)

If you prefer distributing a standalone `.apk` package to sideload directly onto Android devices:

```bash
# 1. Install Capacitor dependencies
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Build the web app
npm run build

# 3. Initialize the native Android project
npx cap add android

# 4. Open in Android Studio to generate release/debug APK
npx cap open android
# In Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)
```
The compiled APK will be output to `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 🧪 Automated Testing & Verification

The project includes unit, integration, and UI verification suites:

```bash
# Run PWA and Service Worker verification
npx tsx src/lib/__tests__/pwa-verification.test.ts

# Run Dialysis Day & Patient Notification filtering tests
npx tsx src/lib/__tests__/patient-features.test.ts

# Run Direct Messaging & Admin Chart tests
npx tsx src/lib/__tests__/patient-messaging.test.ts

# TypeScript static analysis
npx tsc --noEmit

# Lint check
npm run lint

# Production compilation
npm run build
```

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) + React 18 |
| **Language** | TypeScript (Strict mode) |
| **Styling & Theme** | Tailwind CSS (Medical palette: `#1e6bb8` Primary Blue, `#10b981` Emerald, `#ef4444` Alert Red) |
| **Internationalization** | `next-intl` (English & Egyptian Medical Arabic RTL) |
| **PWA & Offline** | Web App Manifest + Service Worker (`public/sw.js`) + Push API |
| **Data Visualization** | `recharts` (Responsive Trend Line, Bar, and Tier Pie charts) |
| **Report Generation** | `jspdf` + `jspdf-autotable` & native RFC-4180 CSV export |
| **Backend & Sync** | Reactive LocalStore with cross-tab sync & Firebase Client SDK hooks |

---

## 👨‍⚕️ Clinical Disclaimer
DialyCare is designed as a patient engagement and self-management support platform. It assists ESRD patients in adhering to prescribed dietary restrictions, fluid allowances, and medication schedules. All therapeutic decisions and regimen changes remain under the exclusive clinical judgment of the attending nephrologist.
