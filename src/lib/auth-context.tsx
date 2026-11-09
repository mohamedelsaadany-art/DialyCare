'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Patient } from './types';
import { addPatient } from './data-store';
import { v4 as uuidv4 } from 'uuid';

interface StoredAccount {
  username: string;
  password: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_USER_KEY = 'DIALYCARE_CURRENT_USER';
const AUTH_ACCOUNTS_KEY = 'DIALYCARE_AUTH_ACCOUNTS';

const DEFAULT_ADMIN_USER: User = {
  uid: 'admin-1',
  role: 'admin',
  username: 'admin',
  displayName: 'Dr. System Administrator',
  language: 'en',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const DEFAULT_PATIENT_USER: User = {
  uid: 'patient-1',
  role: 'patient',
  username: 'patient1',
  displayName: 'Ahmed Mahmoud (أحمد محمود)',
  language: 'ar',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function getStoredAccounts(): StoredAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(AUTH_ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as StoredAccount[]) : [];
  } catch {
    return [];
  }
}

function saveStoredAccounts(accounts: StoredAccount[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (error) {
    console.error('Failed to save auth accounts to localStorage:', error);
  }
}

/**
 * Admin helper to register new patient user accounts
 */
export function addPatientAccount(
  username: string,
  password: string,
  patientData: Partial<Patient> & { language?: 'ar' | 'en' }
): User {
  const patientId = patientData.id || uuidv4();
  const trimmedUsername = username.trim();
  const newUser: User = {
    uid: patientId,
    role: 'patient',
    username: trimmedUsername,
    displayName: patientData.fullName || trimmedUsername,
    language: patientData.language || 'ar',
    createdAt: new Date().toISOString(),
  };

  const newPatient: Patient = {
    id: patientId,
    fullName: patientData.fullName || trimmedUsername,
    fullNameAr: patientData.fullNameAr || patientData.fullName || trimmedUsername,
    phone: patientData.phone || '',
    dialysisSchedule: patientData.dialysisSchedule || 'MWF',
    reminderSchedule: patientData.reminderSchedule || 'standard',
    isActive: patientData.isActive ?? true,
    createdAt: patientData.createdAt || new Date().toISOString(),
  };

  // Add patient record to data store
  addPatient(newPatient);

  // Store credentials
  const accounts = getStoredAccounts();
  const filtered = accounts.filter(
    (acc) => acc.username.toLowerCase() !== trimmedUsername.toLowerCase()
  );
  filtered.push({
    username: trimmedUsername,
    password,
    user: newUser,
  });
  saveStoredAccounts(filtered);

  return newUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load existing session on client mount
  useEffect(() => {
    try {
      const storedUser =
        window.localStorage.getItem(CURRENT_USER_KEY) ||
        window.sessionStorage.getItem(CURRENT_USER_KEY);
      if (storedUser) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(JSON.parse(storedUser) as User);
      }
    } catch (error) {
      console.error('Failed to load user from localStorage/sessionStorage:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (
    username: string,
    password: string,
    rememberMe = true
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const cleanUsername = username.trim();
      const cleanPassword = password;

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

      // Check Hardcoded Admin Account (case-insensitive username)
      if (cleanUsername.toLowerCase() === 'admin' && cleanPassword === 'admin123') {
        persistSession(DEFAULT_ADMIN_USER);
        return true;
      }

      // Check Hardcoded Demo Patient Account (case-insensitive username)
      if (cleanUsername.toLowerCase() === 'patient1' && cleanPassword === 'patient123') {
        persistSession(DEFAULT_PATIENT_USER);
        return true;
      }

      // Check dynamically stored accounts
      const accounts = getStoredAccounts();
      const match = accounts.find(
        (acc) =>
          acc.username.toLowerCase() === cleanUsername.toLowerCase() &&
          acc.password === cleanPassword
      );

      if (match) {
        persistSession(match.user);
        return true;
      }

      return false;
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

  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      isAdmin,
    }),
    [user, loading, isAdmin]
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
