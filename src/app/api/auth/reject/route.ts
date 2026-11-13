import { NextResponse } from 'next/server';
import { rejectCloudAccount } from '@/lib/cloud-store';



export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uid, reason, reviewerName } = body;

    if (!uid) {
      return NextResponse.json({ success: false, error: 'Missing uid' }, { status: 400 });
    }

    const account = await rejectCloudAccount(
      uid,
      reason || 'لم يستوفِ متطلبات الاعتماد',
      reviewerName || 'Super Admin'
    );

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: account.user,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to reject registration';
    console.error('[API /api/auth/reject] Error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
