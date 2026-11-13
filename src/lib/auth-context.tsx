'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { User, Patient, AccountStatus } from './types';
import {
  addPatient,
  getAuthAccounts,
  saveAuthAccounts,
  syncCloudAccounts,
  getAdminPassword,
  registerStaffAccount,
  registerDoctorAccount,
  registerPatientAccount,
  normalizePhone,
  isPhoneMatch,
  DEFAULT_ADMIN_USER,
  DEFAULT_PATIENT_USER,
  DEFAULT_PATIENT2_USER,
} from './data-store';
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

const CURRENT_USER_KEY = 'DIALYCARE_CURRENT_USER';

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
      }
    } catch (error) {
      console.error('Failed to load user from session storage:', error);
    }
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
      const cleanId = identifier.trim();
      const cleanPhone = cleanId.replace(/[\s\-\(\)\+]/g, '');
      const cleanPass = password;

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
        }
      };

      // 1. Check Super Admin Credentials (Dynamic password support)
      const currentAdminPassword = getAdminPassword();
      if (cleanId.toLowerCase() === 'admin' && cleanPass === currentAdminPassword) {
        persistSession(DEFAULT_ADMIN_USER);
        return { success: true, status: 'active', user: DEFAULT_ADMIN_USER };
      }

      // 2. Check Stored Accounts (by username, phone, or email)
      const accounts = getAuthAccounts();
      const findMatchingAccount = (accList: typeof accounts) =>
        accList.find((acc) => {
          const u = acc.user;
          const matchesUsername = acc.username.toLowerCase() === cleanId.toLowerCase();
          const matchesPhone = Boolean(
            (acc.phone && isPhoneMatch(acc.phone, cleanId)) ||
            (u.phone && isPhoneMatch(u.phone, cleanId)) ||
            (acc.username && isPhoneMatch(acc.username, cleanId)) ||
            (cleanPhone &&
              ((acc.phone && acc.phone.replace(/[\s\-\(\)\+]/g, '') === cleanPhone) ||
                (u.phone && u.phone.replace(/[\s\-\(\)\+]/g, '') === cleanPhone)))
          );
          const matchesEmail = Boolean(u.email && u.email.toLowerCase() === cleanId.toLowerCase());
          const passwordMatches = acc.password === cleanPass;

          return (matchesUsername || matchesPhone || matchesEmail) && passwordMatches;
        });

      let match = findMatchingAccount(accounts);

      // If not found in local accounts cache, attempt cloud sync (for cross-device credentials)
      if (!match && typeof window !== 'undefined') {
        try {
          const syncedAccounts = await syncCloudAccounts();
          match = findMatchingAccount(syncedAccounts);
        } catch {
          // continue with fallback
        }
      }

      if (match) {
        const userStatus = match.user.status || 'active';
        if (userStatus === 'pending') {
          return { success: false, status: 'pending', user: match.user };
        }
        if (userStatus === 'rejected') {
          return {
            success: false,
            status: 'rejected',
            rejectionReason: match.user.rejectionReason,
            user: match.user,
          };
        }
        persistSession(match.user);
        return { success: true, status: 'active', user: match.user };
      }

      // Check default fallback demo patients
      if (cleanId.toLowerCase() === 'patient1' && cleanPass === 'patient123') {
        persistSession(DEFAULT_PATIENT_USER);
        return { success: true, status: 'active', user: DEFAULT_PATIENT_USER };
      }
      if (cleanId.toLowerCase() === 'patient2' && cleanPass === 'patient123') {
        persistSession(DEFAULT_PATIENT2_USER);
        return { success: true, status: 'active', user: DEFAULT_PATIENT2_USER };
      }

      return { success: false, error: 'invalidCredentials' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CURRENT_USER_KEY);
      window.sessionStorage.removeItem(CURRENT_USER_KEY);
    }
  };

  const registerDoctor = async (data: Parameters<typeof registerDoctorAccount>[0]): Promise<User> => {
    setLoading(true);
    try {
      return registerDoctorAccount(data);
    } finally {
      setLoading(false);
    }
  };

  const registerStaff = async (data: Parameters<typeof registerStaffAccount>[0]): Promise<User> => {
    setLoading(true);
    try {
      return registerStaffAccount(data);
    } finally {
      setLoading(false);
    }
  };

  const registerPatient = async (data: Parameters<typeof registerPatientAccount>[0]): Promise<User> => {
    setLoading(true);
    try {
      return registerPatientAccount(data);
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
