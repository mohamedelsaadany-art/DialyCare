import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { upsertCloudAccount } from '@/lib/cloud-store';
import type { User, StoredAccount, UserRole } from '@/lib/types';



export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({ success: false, error: 'Missing type or data' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const uid = uuidv4();

    if (type === 'doctor' || type === 'nurse' || type === 'staff') {
      const cleanUsername = String(data.username || '').trim();
      const cleanPhone = String(data.phone || '').trim();
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
      return NextResponse.json({ success: true, user: newUser });
    }

    if (type === 'patient') {
      const cleanPhone = String(data.phone || '').replace(/[\s\-\(\)\+]/g, '').trim();
      const newUser: User = {
        uid,
        role: 'patient',
        status: 'active', // Patients are pre-approved and active immediately!
        username: cleanPhone,
        phone: cleanPhone,
        displayName: String(data.fullName || cleanPhone).trim(),
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

      await upsertCloudAccount(account);
      return NextResponse.json({ success: true, user: newUser });
    }

    return NextResponse.json({ success: false, error: 'Unknown registration type' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown registration error';
    console.error('[API /api/auth/register] Error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
