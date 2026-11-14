# Handover to Antigravity — overnight run of 2026-11-14

This covers what changed in Waslity (وَصْلِتي, repo `DialyCare`) between v2.13.0 (`3aeebdb`) and the end of the overnight
run at 14:00 Cairo on 2026-11-14. Read it before touching auth, sync or storage code: the security model changed.

> **Read first:** the login model is now server-side. Old assumptions from the previous handover (client-side login,
> every browser holding every account, `/api/sync` open to anyone) are **no longer true**, and code that relies on them
> will break or reopen holes.

---

## 1. State at handover

| Thing | Value |
|---|---|
| Branch | `main` on GitHub = `team/overnight-2026-11-14` = the live production build (`1a53ec3` + this doc update) |
| Production | waslity.vercel.app and dialycare.vercel.app (one Vercel project, `dialycare`, deployed with the Vercel CLI; **not** git-connected, so pushing does not deploy) |
| Live version | `1a53ec3`, Vercel deployment `dialycare-e0dmuwmwk`, deployed ~13:34 Cairo |
| Tests | `npm test` runs every suite in `src/lib/__tests__` (32 files) as a fail-fast chain; `npx tsc --noEmit`, `npm run lint` clean; GitHub CI green |

## 2. Why so much changed: what was found

At the start of the run, production had these holes, all verified without logging in:

1. **B1 — `GET /api/sync` returned the whole clinical database to anyone, and `GET /api/auth/accounts` returned every
   account with its plaintext password.** Login was done in the browser by downloading that list; the "session" was an
   unsigned JSON object in localStorage that anyone could edit to become admin.
2. **B3 — anyone could register as an active admin** (the register route trusted a client-supplied `role`, and
   `sanitizeAccount` auto-activated any admin).
3. **B4 — the public register route replaced existing accounts** with the same phone/username/uid, including `admin`.
4. Unauthenticated writes: `POST /api/sync` and `/api/auth/accounts` merged anything; approve/reject had no caller check.
5. **B2/B6 — passwords stored in plaintext**; the admin "change password" button only wrote localStorage.

## 3. What was done (all reviewed, tested, committed, and — unless marked — deployed)

| ID | Commit | What |
|---|---|---|
| U1 | `80fabaf` | `npm test` runs all test files (was 7 of 23) |
| U2 | `7501a63` | Removed unused `firebase` dependency and `src/lib/firebase.ts` |
| B1a | `70fff29` | Server session layer: `src/lib/server-auth.ts`; `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` |
| U3 | `6a9bcc6` | Plausibility ranges on the dialysis-session and new-patient forms (`src/lib/clinical-validation.ts`) |
| U4 | `2971a5d` | Patient fluid entry 1–3000 mL, daily limit 200–5000 mL, visible AR/EN errors |
| B1b | `c1b9158` | Client uses server login (`src/lib/session-client.ts`, `/api/auth/status`); one-time Arabic "please sign in again" notice; local passwords removed |
| B1c+B3+B4 | `34f520c` | Every data route needs a session and is scoped per role (`src/lib/api-scope.ts`); accounts route read-only; approve/reject admin-only; register hardened (role whitelist, `admin` reserved, 409 on existing uid/username/phone); service worker cache `dialycare-v2-auth` |
| U5a/U5b | `42fd6cd`, `7db54d9` | Numeric keypads (`inputMode`) and label links on number inputs |
| B7 | `e0daa8e` | Card subtitle `<p>` → `<div>` (hydration error on the patient detail page) |
| B2+B5 | `d95b896` | scrypt password hashing (per-password salt, versioned format, fail-closed); plaintext upgraded on login; first admin login hashes the rest (2 s / 300 cap, accounts blob only); `POST /api/auth/change-password` (signs out other sessions); Arabic/Persian-digit phone numbers (`src/lib/phone.ts`) |
| U6 | `fa7d422` | Background sync backs off while the tab is hidden (one sync on hide/show, ≤ 1 per 2 min hidden); duplicate admin-dashboard poll removed (`src/lib/visibility-poll.ts`) |
| B14 | `fde2668` | Every login lasts 30 days, all roles ("remember me" only controls whether the cookie survives closing the browser) — for clinics with poor connectivity |
| U7 | `6db9baa` | Admin settings adherence threshold can be typed again (clamped 40–95 on blur/save) |
| B11+B2.1+B9 | `022b78b` (deployed 13:22, owner watching) | Storage reads fail safe (a failed read never falls back to demo seeds or an empty DB that a write would save; production never seeds; read-then-write paths read fresh); account reconcile never takes passwords from the DB-blob copy; DB blob never stores password fields |
| B13 | `1a53ec3` | A confirmed 401 from sync while signed in → one-time Arabic "please sign in again" and the login page; local entries kept and synced after re-login; offline/5xx stay silent |

### Offline behaviour (the owner's main requirement: low/no internet)
Verified on a production build with the network switched off, for a patient and a doctor who first signed in online:
reloading offline stays in the app (no login redirect, no error page), main pages work, a fluid log and a dialysis session
can be added offline, the user stays signed in, and both entries reach the server within 20 s of reconnecting.
Limits: only a confirmed 401 from the server signs someone out; the first sign-in on a device needs internet; a page
works offline only if it was opened once while online (the service worker caches on visit); sessions are not renewed
automatically, so after 30 days the user signs in again once (when online).

### How auth works now
- **Login** `POST /api/auth/login {identifier, password, remember?}` → verifies against the accounts store (scrypt) →
  sets an HttpOnly signed session cookie. **Signing key:** `SESSION_SECRET` if set; otherwise derived server-side as
  HMAC-SHA256(`BLOB_READ_WRITE_TOKEN`, "waslity-session-v1"); in local dev/tests with neither, a fixed dev key with a loud
  warning (unreachable on Vercel/production). `GET /api/auth/session` returns 401 when the key exists and the user isn't
  signed in, 503 when no key is configured — use it as a no-login health check.
- **Client**: only a real 401 from the session check signs the user out; network errors keep the cached user (offline use).
- **Scopes** (`src/lib/api-scope.ts`): patients read only their own rows, may only append their own new rows and change
  only `fluidLimit`/avatar on their record; staff read/write clinical data; accounts never travel through `/api/sync`.
- **Registration**: patients/doctors/nurses/staff only; existing identity → 409 (clinic-created patient records are linked
  when the uid matches and no account owns it).
- **Passwords**: never returned by any route; hashes live only in the accounts store.

## 4. Release history (production)

| Release | Cairo | Commit | Notes |
|---|---|---|---|
| R0 | 08:20 | `2971a5d` | U1–U4, B1a |
| R1 | ~08:25 | `34f520c` | the security release; prod smoke 20/20 on both hosts; `/api/sync` went from 200/41 KB (13 accounts with passwords) to 401/40 B |
| R2 | 08:33 | `d95b896` | hashing, password change, Arabic digits, U5, B7. By 13:02 all live accounts were hashed |
| R3 | 13:12 | `6db9baa` | U6, B14, U7 |
| R4 | 13:22 | `8044378` | B11+B2.1+B9 (storage fail-safe), deployed while the owner was awake to watch; smoke 22/22 |
| R5 | ~13:34 | `1a53ec3` | B13 — final release of the run |

Every release: production data backed up first, deployed from a clean worktree of the exact commit (never from a dirty
tree — the Vercel CLI uploads the working directory), GitHub `main` fast-forwarded to the deployed commit, then an
unauthenticated, zero-write smoke test.

## 5. Open bugs (not fixed tonight)

| ID | Pri | Problem | Notes |
|---|---|---|---|
| B11 watch | P1 | B11 (storage fail-safe) went live at 13:22. Watch the first hours of real use: if syncs start failing or pages error, roll back to `dialycare-4z6uq316w` (`6db9baa`). If the live account count ever drops to exactly 8 (the demo set), restore the accounts file from a backup. | |
| B12 | P1 | Deleting a dialysis session (and probably labs, meds, reminders, tips) doesn't stick: it reappears within ~1 s. | Pre-existing. Sync is union-only; deletes never reach the server. Needs a staff-only `deletedAt` tombstone merged server-side. |
| B10 | P2 | Clinic-created patient: the background registration in `admin/patients/new` ignores failures, so the clinic sees success but the patient may have no login. | Show the error / offer retry. |
| B8 | P3 | The one-time re-login notice doesn't show under `next dev` (StrictMode double effect). Production is fine. | |
| — | P2 | Logout doesn't revoke the 30-day token (rejection and password change do). No login rate limit. | |
| — | P2 | Two simultaneous writes to the accounts blob can race (no atomic write in Vercel Blob). | |
| — | P3 | No admin flow to give an existing account-less patient record a login. | 0 such records at handover. |
| — | P3 | Offline needs each page visited once online; consider precaching the admin and patient sub-pages in `public/sw.js`. | |

## 6. Decisions the owner must make (not done by the team on purpose)

1. **Make the GitHub repo private.** It is public and contains seed/demo credentials and the full app logic.
2. **Move the Vercel Blob store to private access.** Both data files are still `access: 'public'`: anyone with the URL
   can read the clinical database and the (now hashed) accounts. This needs a new private store + migration + code
   change from `put(..., {access:'public'})` and public-URL fetches to authenticated reads.
3. **Scope `BLOB_READ_WRITE_TOKEN` to Production only.** It is also set for Preview and Development, so any preview
   deployment reads and writes the real patient data. Give previews their own store.
4. **Set `SESSION_SECRET` in Vercel (Production).** Today the signing key is derived from the blob token; rotating that
   token would sign everyone out.
5. **Change the default passwords** (admin and demo accounts from the previous handover are in the public repo history).
6. **Rollback rule:** passwords are now hashed in production. Rolling back to any build before `d95b896` breaks every
   login. Safe rollback targets: `dialycare-n2blvi15k` (B11), `dialycare-4z6uq316w` (`6db9baa`), `dialycare-o7woywfxt` (`d95b896`).

## 7. User impact to know about
- Since R1, every user had to sign in once (Arabic notice); first sign-in on a device needs internet. After that the app
  works offline with the cached session; entries sync when the connection returns.
- Installed PWAs moved to the new service worker (network-first, old caches deleted). A tab left open on the old code
  gets 401 on sync until reloaded; its entries stay local and sync after re-login.
- If patient B signs in on patient A's device before A's offline entries synced, A's local entries are lost (accepted).
- A patient record created without an account cannot be claimed by self-registration (409, "contact the clinic"); there
  is no admin "create login for this patient" flow yet (none needed at the time: every patient had an account).

## 8. How to work on it safely
- **Never run the dev server or a build with the production token.** `.env.local` (created by `vercel env pull`) holds
  the real blob token. Start in safe mode so the in-memory store is used:
  `BLOB_READ_WRITE_TOKEN= VERCEL_OIDC_TOKEN= BLOB_STORE_ID= npx next dev` (Next does not override variables that are
  already set, even to empty). Or work in a git worktree, which has no `.env.local`.
- A local `next start` needs `SESSION_SECRET` set (any random string), otherwise login returns 503.
- Do not run `verify-live-production.mjs` — it registers accounts on production.
- Test commands: `npm test`, `npx tsc --noEmit`, `npm run lint`, then a safe-mode `npm run build`.
- Deploy: back up both blob files, push, `git worktree add --detach <dir> <sha>`, copy `.vercel/project.json` into it,
  `vercel --prod --yes` there, `vercel inspect`, then check `/api/auth/session` → 401 and `/api/sync` → 401.
- `PROGRESS.md` (repo root) has the minute-by-minute log of the run.
