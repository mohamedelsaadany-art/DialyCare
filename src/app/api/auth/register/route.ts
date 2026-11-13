import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { upsertCloudAccount } from '@/lib/cloud-store';
import type { User, StoredAccount } from '@/lib/types';



export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json({ success: false, error: 'Missing type or data' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const uid = uuidv4();

    if (type === 'doctor') {
      const cleanUsername = String(data.username || '').trim();
      const cleanPhone = String(data.phone || '').trim();

      const newUser: User = {
        uid,
        role: 'doctor',
        status: 'pending',
        username: cleanUsername,
        phone: cleanPhone,
        email: data.email?.trim(),
        displayName: String(data.fullName || cleanUsername).trim(),
        specialty: data.specialty?.trim() || 'طبيب أمراض كلى وغسيل كلوي',
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
        status: 'pending',
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
