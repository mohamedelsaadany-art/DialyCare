/**
 * Client-side calls to the server auth routes (B1b). No React here so the
 * decision logic is unit-testable in Node with a fake fetch.
 *
 * Rule: ONLY a confirmed 401 from /api/auth/session means "signed out".
 * 503 (auth not configured), other 5xx, network errors and timeouts keep the
 * cached session so the PWA keeps working offline.
 */
import type { AccountStatus, User } from './types';

export const CURRENT_USER_KEY = 'DIALYCARE_CURRENT_USER';
/** sessionStorage flag: show the "please sign in again" notice once on the login page. */
export const REAUTH_NOTICE_KEY = 'WASLITY_REAUTH_NOTICE';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 10_000;

function defaultFetch(): FetchLike {
  return (input, init) => fetch(input, init);
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetchImpl(url, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = (await res.json()) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isUser(u: unknown): u is User {
  return Boolean(u && typeof u === 'object' && typeof (u as User).uid === 'string' && typeof (u as User).role === 'string');
}

// ---------------------------------------------------------------------------
// Session check
// ---------------------------------------------------------------------------

export type SessionCheck =
  | { action: 'update'; user: User } // valid session: use the server's copy of the user
  | { action: 'clear' } // confirmed 401: signed out (e.g. pre-B1 cached session without a cookie)
  | { action: 'keep' }; // offline / server trouble: keep the cached session

export async function checkServerSession(
  fetchImpl: FetchLike = defaultFetch(),
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<SessionCheck> {
  let res: Response;
  try {
    res = await fetchWithTimeout(fetchImpl, '/api/auth/session', { method: 'GET' }, timeoutMs);
  } catch {
    return { action: 'keep' };
  }
  if (res.status === 401) return { action: 'clear' };
  if (!res.ok) return { action: 'keep' };
  const body = await readJson(res);
  if (body && body.success === true && isUser(body.user)) {
    return { action: 'update', user: body.user };
  }
  return { action: 'keep' };
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

export interface ServerLoginResult {
  success: boolean;
  status?: AccountStatus | 'pending_reactivation';
  error?: 'invalidCredentials' | 'loginError' | 'accountArchivedOnHold' | string;
  user?: User;
  rejectionReason?: string;
  adminWhatsApp?: string;
  patientName?: string;
  phone?: string;
}

export async function loginWithServer(
  identifier: string,
  password: string,
  rememberMe: boolean,
  fetchImpl: FetchLike = defaultFetch(),
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ServerLoginResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, rememberMe }),
      },
      timeoutMs
    );
  } catch {
    return { success: false, error: 'loginError' };
  }
  const body = await readJson(res);
  if (body && (body.error === 'accountArchivedOnHold' || body.status === 'pending_reactivation')) {
    return {
      success: false,
      error: 'accountArchivedOnHold',
      status: 'pending_reactivation',
      adminWhatsApp: typeof body.adminWhatsApp === 'string' ? body.adminWhatsApp : undefined,
      patientName: typeof body.patientName === 'string' ? body.patientName : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
    };
  }
  if (res.ok && body && body.success === true && isUser(body.user)) {
    const user = body.user;
    return { success: true, status: 'active', user: { ...user, status: user.status || 'active' } };
  }
  if (res.status === 403 && body && (body.status === 'pending' || body.status === 'rejected') && isUser(body.user)) {
    return {
      success: false,
      status: body.status,
      user: body.user,
      rejectionReason: typeof body.rejectionReason === 'string' ? body.rejectionReason : undefined,
    };
  }
  if (res.status === 401) return { success: false, error: 'invalidCredentials' };
  return { success: false, error: 'loginError' };
}

export async function logoutOnServer(fetchImpl: FetchLike = defaultFetch()): Promise<void> {
  try {
    await fetchWithTimeout(fetchImpl, '/api/auth/logout', { method: 'POST', keepalive: true }, 5_000);
  } catch {
    // offline: the local session is cleared anyway; the cookie expires on its own
  }
}

// ---------------------------------------------------------------------------
// Registration + pending status
// ---------------------------------------------------------------------------

export class RegistrationError extends Error {
  code: 'alreadyRegistered' | 'invalid' | 'network' | 'server';
  constructor(code: RegistrationError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'RegistrationError';
  }
}

function registrationMessage(code: RegistrationError['code'], language?: string): string {
  const ar = language !== 'en';
  switch (code) {
    case 'alreadyRegistered':
      return ar
        ? 'رقم الهاتف أو اسم المستخدم مسجّل بالفعل. يرجى تسجيل الدخول أو التواصل مع الإدارة.'
        : 'This phone number or username is already registered. Please sign in or contact the clinic admin.';
    case 'invalid':
      return ar ? 'بيانات التسجيل غير صالحة. يرجى المراجعة والمحاولة مرة أخرى.' : 'Invalid registration details. Please check and try again.';
    case 'network':
      return ar
        ? 'تعذّر الاتصال بالخادم. التسجيل يتطلب اتصالاً بالإنترنت، يرجى المحاولة مرة أخرى.'
        : 'Could not reach the server. Registration needs an internet connection; please try again.';
    default:
      return ar ? 'حدث خطأ في الخادم أثناء التسجيل. يرجى المحاولة لاحقاً.' : 'A server error occurred during registration. Please try again later.';
  }
}

/**
 * Register on the server FIRST. Returns the server's user (its uid is the one
 * to use locally). Throws RegistrationError with a localized message.
 */
export async function registerOnServer(
  type: 'doctor' | 'nurse' | 'staff' | 'patient',
  data: Record<string, unknown>,
  fetchImpl: FetchLike = defaultFetch(),
  timeoutMs: number = 20_000
): Promise<User> {
  const language = typeof data.language === 'string' ? data.language : undefined;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      '/api/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      },
      timeoutMs
    );
  } catch {
    throw new RegistrationError('network', registrationMessage('network', language));
  }
  const body = await readJson(res);
  if (res.ok && body && body.success === true) {
    if (body.status === 'pending_reactivation') {
      return {
        uid: 'archived',
        role: 'patient',
        status: 'pending' as AccountStatus,
        username: String(data.phone || ''),
        displayName: String(data.fullName || data.phone || ''),
        language: language === 'en' ? 'en' : 'ar',
        createdAt: new Date().toISOString(),
        phone: String(data.phone || ''),
        reactivationStatus: 'pending',
        adminWhatsApp: typeof body.adminWhatsApp === 'string' ? body.adminWhatsApp : undefined,
      } as User & { adminWhatsApp?: string };
    }
    if (isUser(body.user)) return body.user;
  }
  if (res.status === 409) throw new RegistrationError('alreadyRegistered', registrationMessage('alreadyRegistered', language));
  if (res.status === 400) throw new RegistrationError('invalid', registrationMessage('invalid', language));
  throw new RegistrationError('server', registrationMessage('server', language));
}

/** Poll the review status of a freshly registered account (no session needed). */
export async function fetchRegistrationStatus(
  uid: string,
  fetchImpl: FetchLike = defaultFetch()
): Promise<{ status: AccountStatus; rejectionReason?: string } | null> {
  try {
    const res = await fetchWithTimeout(
      fetchImpl,
      '/api/auth/status',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) },
      DEFAULT_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const body = await readJson(res);
    if (!body || body.success !== true) return null;
    const status = body.status;
    if (status !== 'active' && status !== 'pending' && status !== 'rejected') return null;
    return {
      status,
      rejectionReason: typeof body.rejectionReason === 'string' ? body.rejectionReason : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Remove the `password` PROPERTY (not set it to '') from locally cached non-admin
 * accounts. Deleting the key matters: legacy sync merges accounts with
 * `{...existing, ...incoming}`, so a missing key keeps the server's password,
 * whereas '' would overwrite it. The admin entry is left alone because
 * data-store getAuthAccounts() rewrites it from DIALYCARE_ADMIN_CREDENTIALS on
 * every call (removed for good when B2 moves the admin password server-side).
 * Returns null when nothing needs to change.
 */
export function stripLocalPasswords<T extends { password?: string; user: { role: string } }>(accounts: T[]): T[] | null {
  if (!accounts.some((a) => a.user.role !== 'admin' && 'password' in a)) return null;
  return accounts.map((a) => {
    if (a.user.role === 'admin' || !('password' in a)) return a;
    const copy = { ...a } as T & { password?: string };
    delete copy.password;
    return copy;
  });
}

/** Localized one-time notice shown on the login page after a forced re-login. */
export function reauthNoticeText(locale: string): string {
  return locale === 'en'
    ? 'The security system has been updated. Please sign in again.'
    : 'تم تحديث نظام الأمان، يرجى تسجيل الدخول مرة أخرى';
}
