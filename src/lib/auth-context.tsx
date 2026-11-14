'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { User, Patient, AccountStatus } from './types';
import {
  addPatient,
  getAuthAccounts,
  saveAuthAccounts,
  registerStaffAccount,
  registerDoctorAccount,
  registerPatientAccount,
  normalizePhone,
  DEFAULT_ADMIN_USER,
} from './data-store';
import {
  CURRENT_USER_KEY,
  REAUTH_NOTICE_KEY,
  checkServerSession,
  loginWithServer,
  logoutOnServer,
  registerOnServer,
  stripLocalPasswords,
} from './session-client';
import { v4 as uuidv4 } from 'uuid';

export interface LoginResult {
  success: boolean;
  status?: AccountStatus;
  error?: string;
  user?: User;
  rejectionReason?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<LoginResult>;
  logout: () => void;
  isAdmin: boolean;
  isDoctor: boolean;
  isNurse: boolean;
  isStaff: boolean;
  registerDoctor: (data: Parameters<typeof registerDoctorAccount>[0]) => Promise<User>;
  registerStaff: (data: Parameters<typeof registerStaffAccount>[0]) => Promise<User>;
  registerPatient: (data: Parameters<typeof registerPatientAccount>[0]) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Remove ONLY the cached current-user keys. Clinical collections and read-notification ids stay. */
function clearCachedUser(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CURRENT_USER_KEY);
    window.sessionStorage.removeItem(CURRENT_USER_KEY);
  } catch {
    // storage unavailable
  }
}

/**
 * Pre-B1 builds kept every account's plaintext password in localStorage.
 * Passwords are verified on the server now, so drop the local copies by
 * DELETING the key (never ''), so a legacy account merge can't blank the
 * server's password. See stripLocalPasswords().
 */
function purgeLocalPasswords(): void {
  try {
    const stripped = stripLocalPasswords(getAuthAccounts());
    if (stripped) saveAuthAccounts(stripped);
  } catch {
    // non-fatal
  }
}

/**
 * Admin helper to register new patient user accounts in clinic
 */
export function addPatientAccount(
  username: string,
  password: string,
  patientData: Partial<Patient> & { language?: 'ar' | 'en' }
): { user: User; credentials?: { username: string; password: string } } {
  const patientId = patientData.id || uuidv4();
  const trimmedUsername = username.trim();
  const phone = normalizePhone(patientData.phone) || patientData.phone?.replace(/[\s\-\(\)\+]/g, '').trim() || trimmedUsername;

  const newUser: User = {
    uid: patientId,
    role: 'patient',
    status: 'active', // Clinical in-clinic registration is pre-approved
    username: trimmedUsername,
    phone,
    displayName: patientData.fullName || trimmedUsername,
    language: patientData.language || 'ar',
    createdAt: new Date().toISOString(),
    registeredAt: new Date().toISOString(),
  };

  const newPatient: Patient = {
    id: patientId,
    fullName: patientData.fullName || trimmedUsername,
    fullNameAr: patientData.fullNameAr || patientData.fullName || trimmedUsername,
    phone,
    username: trimmedUsername,
    dialysisSchedule: (patientData.dialysisSchedule === 'TTS' || patientData.dialysisSchedule === 'STT') ? 'STT' : 'SMW',
    reminderSchedule: patientData.reminderSchedule || 'standard',
    dryWeightKg: patientData.dryWeightKg,
    accessType: patientData.accessType,
    isActive: patientData.isActive ?? true,
    createdAt: patientData.createdAt || new Date().toISOString(),
  };

  // Add patient record to data store
  addPatient(newPatient);

  // Store credentials
  const accounts = getAuthAccounts();
  const filtered = accounts.filter(
    (acc) =>
      acc.username.toLowerCase() !== trimmedUsername.toLowerCase() &&
      (!acc.phone || acc.phone !== phone)
  );
  filtered.push({
    username: trimmedUsername,
    phone,
    password,
    user: newUser,
  });
  saveAuthAccounts(filtered);

  // Background cloud push so in-clinic registrations sync immediately to cloud and other doctors
  if (typeof window !== 'undefined') {
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'patient',
        data: {
          uid: patientId,
          fullName: newPatient.fullName,
          phone,
          password,
          profile: {
            dialysisSchedule: newPatient.dialysisSchedule,
            dryWeightKg: newPatient.dryWeightKg,
            accessType: newPatient.accessType,
            dialysisCenter: newPatient.dialysisCenter || newPatient.centerName,
            age: newPatient.age,
            gender: newPatient.gender,
          },
        },
      }),
    }).catch((err) => console.warn('[AuthContext] In-clinic cloud registration push failed:', err));
  }

  return { user: newUser, credentials: { username: trimmedUsername, password } };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load existing session on client mount
  const syncSession = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedUser =
        window.localStorage.getItem(CURRENT_USER_KEY) ||
        window.sessionStorage.getItem(CURRENT_USER_KEY);
      if (storedUser) {
        const parsed = JSON.parse(storedUser) as User;

        // 1. Super Admin is PERMANENTLY active and immune to eviction on refresh
        if (parsed.role === 'admin' || parsed.username?.toLowerCase() === 'admin' || parsed.uid === 'admin-1') {
          const activeAdmin: User = {
            ...DEFAULT_ADMIN_USER,
            ...parsed,
            role: 'admin',
            status: 'active',
          };
          setUser(activeAdmin);
          return;
        }

        // 2. Verify active status from accounts
        const accounts = getAuthAccounts();
        const found = accounts.find((a) => a.user.uid === parsed.uid);
        if (found) {
          // If explicitly rejected or pending, evict
          if (found.user.status === 'rejected' || found.user.status === 'pending') {
            window.localStorage.removeItem(CURRENT_USER_KEY);
            window.sessionStorage.removeItem(CURRENT_USER_KEY);
            setUser(null);
            return;
          }
          // Default undefined status to active
          const activeFound: User = {
            ...found.user,
            status: found.user.status || 'active',
          };
          setUser(activeFound);
          return;
        }

        // 3. Fallback for accounts not in local list
        if (parsed.status === 'rejected' || parsed.status === 'pending') {
          window.localStorage.removeItem(CURRENT_USER_KEY);
          window.sessionStorage.removeItem(CURRENT_USER_KEY);
          setUser(null);
          return;
        }
        setUser({ ...parsed, status: parsed.status || 'active' });
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to load user from session storage:', error);
    }
  }, []);

  // Confirm the cached session with the server once on mount. Only a confirmed
  // 401 signs the user out (e.g. a session cached before the B1 security update,
  // which has no session cookie). Offline / 5xx / 503 keep the cached session.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const hasCached = () =>
      Boolean(window.localStorage.getItem(CURRENT_USER_KEY) || window.sessionStorage.getItem(CURRENT_USER_KEY));
    if (!hasCached()) return;
    void checkServerSession().then((result) => {
      if (cancelled || !hasCached()) return;
      if (result.action === 'clear') {
        clearCachedUser();
        try {
          window.sessionStorage.setItem(REAUTH_NOTICE_KEY, '1');
        } catch {
          // ignore
        }
        setUser(null);
      } else if (result.action === 'update') {
        const fresh: User = { ...result.user, status: result.user.status || 'active' };
        try {
          if (window.localStorage.getItem(CURRENT_USER_KEY)) {
            window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(fresh));
          } else {
            window.sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(fresh));
          }
        } catch {
          // ignore
        }
        setUser(fresh);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      syncSession();
      setLoading(false);
    }, 0);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === null || e.key === CURRENT_USER_KEY || e.key === 'DIALYCARE_AUTH_ACCOUNTS') {
        syncSession();
      }
    };
    const handleCustomUpdate = () => {
      syncSession();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('dialycare_users_updated', handleCustomUpdate);
    window.addEventListener('dialycare_approvals_updated', handleCustomUpdate);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dialycare_users_updated', handleCustomUpdate);
      window.removeEventListener('dialycare_approvals_updated', handleCustomUpdate);
    };
  }, [syncSession]);

  const login = async (
    identifier: string,
    password: string,
    rememberMe = true
  ): Promise<LoginResult> => {
    setLoading(true);
    try {
      const persistSession = (targetUser: User) => {
        setUser(targetUser);
        if (typeof window !== 'undefined') {
          if (rememberMe) {
            window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(targetUser));
            window.sessionStorage.removeItem(CURRENT_USER_KEY);
          } else {
            window.sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(targetUser));
            window.localStorage.removeItem(CURRENT_USER_KEY);
          }
          window.sessionStorage.removeItem(REAUTH_NOTICE_KEY);
        }
      };

      // Credentials are verified ONLY on the server (B1). The server sets an
      // HttpOnly session cookie; the client never sees passwords or the token.
      const result = await loginWithServer(identifier.trim(), password, rememberMe);
      if (result.success && result.user) {
        persistSession(result.user);
        purgeLocalPasswords();
        return { success: true, status: 'active', user: result.user };
      }
      if (result.status === 'pending' || result.status === 'rejected') {
        return {
          success: false,
          status: result.status,
          user: result.user,
          rejectionReason: result.rejectionReason,
        };
      }
      return { success: false, error: result.error || 'invalidCredentials' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    clearCachedUser();
    void logoutOnServer();
  };

  // Registration goes to the server FIRST (throws a localized RegistrationError
  // on 409/400/network), then is cached locally under the SERVER's uid.
  const registerDoctor = async (data: Parameters<typeof registerDoctorAccount>[0]): Promise<User> => {
    setLoading(true);
    try {
      const role = data.role || 'doctor';
      const serverUser = await registerOnServer(role, { ...data, role });
      return registerDoctorAccount({ ...data, role, uid: serverUser.uid }, { skipCloudPush: true });
    } finally {
      setLoading(false);
    }
  };

  const registerStaff = async (data: Parameters<typeof registerStaffAccount>[0]): Promise<User> => {
    setLoading(true);
    try {
      const role = data.role || 'doctor';
      const serverUser = await registerOnServer(role, { ...data, role });
      return registerStaffAccount({ ...data, role, uid: serverUser.uid }, { skipCloudPush: true });
    } finally {
      setLoading(false);
    }
  };

  const registerPatient = async (data: Parameters<typeof registerPatientAccount>[0]): Promise<User> => {
    setLoading(true);
    try {
      const serverUser = await registerOnServer('patient', { ...data });
      return registerPatientAccount({ ...data, uid: serverUser.uid }, { skipCloudPush: true });
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = useMemo(() => user?.role === 'admin', [user]);
  const isDoctor = useMemo(() => user?.role === 'doctor', [user]);
  const isNurse = useMemo(() => user?.role === 'nurse', [user]);
  const isStaff = useMemo(
    () => user?.role === 'admin' || user?.role === 'doctor' || user?.role === 'nurse' || user?.role === 'staff',
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      isAdmin,
      isDoctor,
      isNurse,
      isStaff,
      registerDoctor,
      registerStaff,
      registerPatient,
    }),
    [user, loading, isAdmin, isDoctor, isNurse, isStaff]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
