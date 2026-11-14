/**
 * Client helper for POST /api/auth/change-password (B2). No React, unit-testable
 * with a fake fetch. The server verifies the current password and stores a hash;
 * nothing is kept in localStorage.
 */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: 'wrongPassword' | 'invalid' | 'signedOut' | 'network' | 'server' };

export async function changePasswordOnServer(
  currentPassword: string,
  newPassword: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init)
): Promise<ChangePasswordResult> {
  let res: Response;
  try {
    res = await fetchImpl('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  } catch {
    return { ok: false, error: 'network' };
  }
  let body: { success?: boolean; error?: string } | null = null;
  try {
    body = (await res.json()) as { success?: boolean; error?: string };
  } catch {
    body = null;
  }
  if (res.ok && body?.success === true) return { ok: true };
  if (res.status === 401 && body?.error === 'wrongPassword') return { ok: false, error: 'wrongPassword' };
  if (res.status === 401) return { ok: false, error: 'signedOut' };
  if (res.status === 400) return { ok: false, error: 'invalid' };
  return { ok: false, error: 'server' };
}

/** AR/EN message for a failed change. */
export function changePasswordErrorText(error: Exclude<ChangePasswordResult, { ok: true }>['error'], isRtl: boolean): string {
  switch (error) {
    case 'wrongPassword':
      return isRtl ? 'كلمة المرور الحالية غير صحيحة' : 'Current password is incorrect';
    case 'invalid':
      return isRtl
        ? 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل ومختلفة عن الحالية'
        : 'The new password must be at least 6 characters and different from the current one';
    case 'signedOut':
      return isRtl ? 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى' : 'Your session has ended. Please sign in again.';
    case 'network':
      return isRtl ? 'تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى.' : 'Could not reach the server. Please try again.';
    default:
      return isRtl ? 'حدث خطأ في الخادم. يرجى المحاولة لاحقاً.' : 'A server error occurred. Please try again later.';
  }
}
