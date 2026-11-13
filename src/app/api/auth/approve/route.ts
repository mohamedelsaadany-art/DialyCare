import { NextResponse } from 'next/server';
import { approveCloudAccount } from '@/lib/cloud-store';



export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uid, reviewerName } = body;

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Missing uid' }, { status: 400 });
    }

    const result = await approveCloudAccount(uid, reviewerName || 'Super Admin');
    if (!result.account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: result.account.user,
      newPatient: result.newPatient,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to approve registration';
    console.error('[API /api/auth/approve] Error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
