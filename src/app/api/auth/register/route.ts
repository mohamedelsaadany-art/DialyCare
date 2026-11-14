import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  addCloudAccountIfAbsent,
  getCloudAccounts,
  getCloudDatabase,
  mergeCloudDatabase,
  findUnexpiredArchivedPatientByPhone,
  updateArchivedPatient,
  saveCloudAccounts,
} from '@/lib/cloud-store';
import { normalizePhone, toAsciiDigits, isPhoneMatch } from '@/lib/phone';
import { hashPassword, isCrossOriginRequest, NO_STORE_HEADERS, passwordMatches } from '@/lib/server-auth';
import type { User, StoredAccount, UserRole, Patient } from '@/lib/types';

/**
 * PUBLIC self-registration (B3/B4 hardened).
 * - type must be doctor | nurse | staff | patient; for staff types data.role (if sent) must equal type.
 *   Nobody can register as admin.
 * - The username 'admin' (and similar) is reserved.
 * - An existing uid / username / phone -> 409 and the existing account is left untouched.
 *   Exception: an exact replay (same uid + same username + correct password) returns 200
 *   with the existing user and writes nothing (old clients POST the same registration twice).
 * - The password is stored as a scrypt hash (B2); the replay check verifies against it.
 * - Arabic-Indic digits in phone/username are converted to ASCII (B5).
 * - A client-supplied uid is used only if it is a v4-shaped UUID not used by any account
 *   or patient record; otherwise the server generates one.
 */
const STAFF_TYPES = ['doctor', 'nurse', 'staff'] as const;
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'root', 'superadmin', 'super_admin', 'system']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}
const conflict = () => json({ success: false, error: 'alreadyRegistered' }, 409);
const invalid = (error = 'invalidRegistration') => json({ success: false, error }, 400);

function str(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return json({ success: false, error: 'forbidden' }, 403);
  }
  let body: Record<string, unknown>;
  try {
    const raw = (await request.json()) as unknown;
    if (!raw || typeof raw !== 'object') return invalid('missingTypeOrData');
    body = raw as Record<string, unknown>;
  } catch {
    return invalid('invalidRequest');
  }
  const type = body.type;
  const data = (body.data && typeof body.data === 'object' ? body.data : null) as Record<string, unknown> | null;
  if (typeof type !== 'string' || !data) {
    return invalid('missingTypeOrData');
  }
  const isStaffType = (STAFF_TYPES as readonly string[]).includes(type);
  if (!isStaffType && type !== 'patient') {
    return invalid('unknownRegistrationType');
  }
  if (isStaffType && data.role !== undefined && data.role !== type) {
    return invalid('roleMismatch');
  }

  const password = typeof data.password === 'string' ? data.password : '';
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return invalid('invalidPassword');
  }

  try {
    const now = new Date().toISOString();
    const language = data.language === 'en' ? 'en' : 'ar';
    let account: StoredAccount;
    let newPatient: Patient | undefined;

    const requestedUid = str(data.uid, 100);

    if (isStaffType) {
      const role = type as UserRole;
      const cleanPhone = toAsciiDigits(str(data.phone, 40));
      const cleanUsername = toAsciiDigits(String(str(data.username, 100) || cleanPhone)).replace(/[\s\-\(\)\+]/g, '').trim();
      if (!cleanUsername) return invalid('missingUsername');
      if (RESERVED_USERNAMES.has(cleanUsername.toLowerCase())) return conflict();

      const defaultSpecialty =
        role === 'nurse'
          ? (language === 'en' ? 'Hemodialysis Registered Nurse' : 'تمريض غسيل كلوي متخصص')
          : role === 'staff'
          ? (language === 'en' ? 'Hemodialysis Unit Administrator' : 'إدارة وحدة الغسيل الكلوي')
          : (language === 'en' ? 'Nephrologist / Dialysis Physician' : 'طبيب أمراض كلى وغسيل كلوي');

      const newUser: User = {
        uid: requestedUid,
        role,
        status: 'pending',
        username: cleanUsername,
        phone: cleanPhone,
        email: str(data.email, 200) || undefined,
        displayName: str(data.fullName, 200) || cleanUsername,
        specialty: str(data.specialty, 200) || defaultSpecialty,
        hospital: str(data.hospital, 200) || 'وحدة الغسيل الكلوي',
        idCardDataUrl: typeof data.idCardDataUrl === 'string' ? data.idCardDataUrl : undefined,
        language,
        registeredAt: now,
        createdAt: now,
      };
      account = { username: cleanUsername, phone: cleanPhone, password: hashPassword(password), user: newUser };
    } else {
      const cleanPhone = toAsciiDigits(str(data.phone, 40)).replace(/[\s\-\(\)\+]/g, '');
      if (!cleanPhone) return invalid('missingPhone');

      // Check if the phone number belongs to a record in archivedPatients (unexpired)
      const archived = await findUnexpiredArchivedPatientByPhone(cleanPhone);
      if (archived) {
        const nowIso = new Date().toISOString();
        archived.reactivationStatus = 'pending';
        archived.reactivationRequestedAt = nowIso;
        if (archived.patient) {
          archived.patient.reactivationStatus = 'pending';
          archived.patient.reactivationRequestedAt = nowIso;
        }
        if (!archived.account) {
          archived.account = {
            username: cleanPhone,
            phone: cleanPhone,
            password: hashPassword(password),
            passwordUpdatedAt: nowIso,
            user: {
              uid: archived.patient?.id || archived.id || requestedUid,
              role: 'patient',
              status: 'active',
              username: cleanPhone,
              phone: cleanPhone,
              displayName: archived.patient?.fullName || cleanPhone,
              language,
              reactivationStatus: 'pending',
              reactivationRequestedAt: nowIso,
              createdAt: nowIso,
            },
          };
        } else {
          archived.account.password = hashPassword(password);
          archived.account.passwordUpdatedAt = nowIso;
          if (archived.account.user) {
            archived.account.user.reactivationStatus = 'pending';
            archived.account.user.reactivationRequestedAt = nowIso;
          }
        }
        await updateArchivedPatient(archived);

        // Also check if account is in cloud accounts
        const allAccs = await getCloudAccounts({ forWrite: true });
        const matchingAcc = allAccs.find(
          (a) =>
            a.user?.uid === archived.patient?.id ||
            a.user?.uid === archived.id ||
            (a.phone && isPhoneMatch(a.phone, cleanPhone))
        );
        if (matchingAcc) {
          matchingAcc.password = hashPassword(password);
          matchingAcc.passwordUpdatedAt = nowIso;
          if (matchingAcc.user) {
            matchingAcc.user.reactivationStatus = 'pending';
            matchingAcc.user.reactivationRequestedAt = nowIso;
          }
          await saveCloudAccounts(allAccs);
        }

        return json(
          {
            success: true,
            status: 'pending_reactivation',
            adminWhatsApp: process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '+201012345678',
          },
          200
        );
      }

      if (RESERVED_USERNAMES.has(cleanPhone.toLowerCase())) return conflict();
      const cleanName = str(data.fullName, 200) || cleanPhone;
      const profile = (data.profile && typeof data.profile === 'object' ? data.profile : undefined) as
        | User['patientProfile']
        | undefined;
      const newUser: User = {
        uid: requestedUid,
        role: 'patient',
        status: 'active', // Patients are pre-approved and active immediately
        username: cleanPhone,
        phone: cleanPhone,
        displayName: cleanName,
        language,
        patientProfile: profile,
        registeredAt: now,
        createdAt: now,
      };
      account = { username: cleanPhone, phone: cleanPhone, password: hashPassword(password), user: newUser };
      newPatient = {
        id: requestedUid,
        fullName: cleanName,
        fullNameAr: str(data.fullNameAr, 200) || cleanName,
        phone: cleanPhone,
        username: cleanPhone,
        dialysisSchedule: profile?.dialysisSchedule || 'SMW',
        dryWeightKg: profile?.dryWeightKg || 70,
        accessType: profile?.accessType || 'AVF',
        dialysisCenter: profile?.dialysisCenter || 'وحدة الغسيل الكلوي',
        centerName: profile?.dialysisCenter || 'وحدة الغسيل الكلوي',
        age: profile?.age ? Number(profile.age) : undefined,
        reminderSchedule: 'standard',
        isActive: true,
        gender: profile?.gender || 'male',
        avatarId: profile?.gender === 'female' ? 'female_mature_1' : 'male_mature_1',
        viralMarkers: profile?.viralMarkers,
        emergencyContact: profile?.emergencyContact,
        createdAt: now,
      };
    }

    // Exact replay of an earlier successful registration: answer it, write nothing.
    const accounts = await getCloudAccounts();
    if (requestedUid) {
      const sameUid = accounts.find((a) => a.user && a.user.uid === requestedUid);
      if (sameUid) {
        const replay =
          (sameUid.username || '').trim().toLowerCase() === account.username.toLowerCase() &&
          sameUid.user.role === account.user.role &&
          passwordMatches(sameUid.password, password);
        if (!replay) return conflict();
        const db = await getCloudDatabase();
        const existingPatient = db.patients.find((p) => p.id === sameUid.user.uid);
        return json(
          { success: true, user: { ...sameUid.user }, ...(existingPatient ? { patient: existingPatient } : {}) },
          200
        );
      }
    }

    const db = await getCloudDatabase();
    // A new patient must not collide with an existing patient RECORD either:
    // the database merge matches patients by username/phone and would fold the
    // new registration into (and re-id) someone else's clinical record.
    // Exception (clinic flow): staff created the patient record with this exact
    // v4 uid (addPatientAccount) and its sync landed before the register POST.
    // If every clashing record IS that uid and no account owns it, link the new
    // account to the existing record instead of failing forever. (After B1c
    // only staff ever see patient uids, so a patient cannot claim another record.)
    let linkExistingRecord = false;
    if (newPatient) {
      const phone = normalizePhone(newPatient.phone);
      const uname = (newPatient.username || '').toLowerCase();
      const clashes = db.patients.filter(
        (p) =>
          (phone && normalizePhone(p.phone) === phone) ||
          (uname && (p.username || '').toLowerCase() === uname) ||
          (requestedUid && p.id === requestedUid)
      );
      if (clashes.length > 0) {
        const linkable =
          UUID_RE.test(requestedUid) &&
          clashes.every((p) => p.id === requestedUid) &&
          !accounts.some((a) => a.user?.uid === requestedUid);
        if (!linkable) return conflict();
        linkExistingRecord = true;
      }
    }

    // Choose the uid: the client's v4-shaped uuid if unused anywhere, else a fresh one.
    let uid = uuidv4();
    if (linkExistingRecord) {
      uid = requestedUid;
    } else if (UUID_RE.test(requestedUid)) {
      const taken =
        accounts.some((a) => a.user?.uid === requestedUid) || db.patients.some((p) => p.id === requestedUid);
      if (!taken) uid = requestedUid;
    }
    account.user.uid = uid;
    if (newPatient) newPatient.id = uid;

    const result = await addCloudAccountIfAbsent(account);
    if (result === 'conflict') return conflict();

    if (linkExistingRecord) {
      // Keep the clinic-entered record as it is (registration defaults must not overwrite it).
      await mergeCloudDatabase({ accounts: [account] });
      const linked = (await getCloudDatabase()).patients.find((p) => p.id === uid);
      return json({ success: true, user: { ...account.user }, ...(linked ? { patient: linked } : {}) }, 200);
    }
    await mergeCloudDatabase(newPatient ? { accounts: [account], patients: [newPatient] } : { accounts: [account] });
    return json({ success: true, user: { ...account.user }, ...(newPatient ? { patient: newPatient } : {}) }, 200);
  } catch (error: unknown) {
    console.error('[API /api/auth/register] Error:', error instanceof Error ? error.message : error);
    return json({ success: false, error: 'registrationFailed' }, 500);
  }
}
