import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { upsertCloudAccount, mergeCloudDatabase } from '@/lib/cloud-store';
import type { User, StoredAccount, UserRole, Patient } from '@/lib/types';



export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({ success: false, error: 'Missing type or data' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const uid = data.uid || uuidv4();

    if (type === 'doctor' || type === 'nurse' || type === 'staff') {
      const cleanPhone = String(data.phone || '').trim();
      const cleanUsername = String(data.username || cleanPhone).replace(/[\s\-\(\)\+]/g, '').trim();
      const role: UserRole = (data.role as UserRole) || (type as UserRole) || 'doctor';

      const defaultSpecialty =
        role === 'nurse'
          ? (data.language === 'en' ? 'Hemodialysis Registered Nurse' : 'تمريض غسيل كلوي متخصص')
          : role === 'staff'
          ? (data.language === 'en' ? 'Hemodialysis Unit Administrator' : 'إدارة وحدة الغسيل الكلوي')
          : (data.language === 'en' ? 'Nephrologist / Dialysis Physician' : 'طبيب أمراض كلى وغسيل كلوي');

      const newUser: User = {
        uid,
        role,
        status: 'pending',
        username: cleanUsername,
        phone: cleanPhone,
        email: data.email?.trim(),
        displayName: String(data.fullName || cleanUsername).trim(),
        specialty: data.specialty?.trim() || defaultSpecialty,
        hospital: data.hospital?.trim() || 'وحدة الغسيل الكلوي',
        idCardDataUrl: data.idCardDataUrl,
        language: data.language || 'ar',
        registeredAt: now,
        createdAt: now,
      };

      const account: StoredAccount = {
        username: cleanUsername,
        phone: cleanPhone,
        password: data.password,
        user: newUser,
      };

      await upsertCloudAccount(account);
      await mergeCloudDatabase({
        accounts: [account],
      });
      return NextResponse.json({ success: true, user: newUser });
    }

    if (type === 'patient') {
      const cleanPhone = String(data.phone || '').replace(/[\s\-\(\)\+]/g, '').trim();
      const cleanName = String(data.fullName || cleanPhone).trim();
      const newUser: User = {
        uid,
        role: 'patient',
        status: 'active', // Patients are pre-approved and active immediately!
        username: cleanPhone,
        phone: cleanPhone,
        displayName: cleanName,
        language: data.language || 'ar',
        patientProfile: data.profile,
        registeredAt: now,
        createdAt: now,
      };

      const account: StoredAccount = {
        username: cleanPhone,
        phone: cleanPhone,
        password: data.password,
        user: newUser,
      };

      const newPatient: Patient = {
        id: uid,
        fullName: cleanName,
        fullNameAr: String(data.fullNameAr || cleanName).trim(),
        phone: cleanPhone,
        username: cleanPhone,
        dialysisSchedule: data.profile?.dialysisSchedule || 'SMW',
        dryWeightKg: data.profile?.dryWeightKg || 70,
        accessType: data.profile?.accessType || 'AVF',
        dialysisCenter: data.profile?.dialysisCenter || 'وحدة الغسيل الكلوي',
        centerName: data.profile?.dialysisCenter || 'وحدة الغسيل الكلوي',
        age: data.profile?.age ? Number(data.profile.age) : undefined,
        reminderSchedule: 'standard',
        isActive: true,
        gender: data.profile?.gender || 'male',
        avatarId: data.profile?.gender === 'female' ? 'female_mature_1' : 'male_mature_1',
        viralMarkers: data.profile?.viralMarkers,
        emergencyContact: data.profile?.emergencyContact,
        createdAt: now,
      };

      await upsertCloudAccount(account);
      await mergeCloudDatabase({
        accounts: [account],
        patients: [newPatient],
      });
      return NextResponse.json({ success: true, user: newUser, patient: newPatient });
    }

    return NextResponse.json({ success: false, error: 'Unknown registration type' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown registration error';
    console.error('[API /api/auth/register] Error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
