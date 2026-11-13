import { NextResponse } from 'next/server';
import { getCloudAccounts } from '@/lib/cloud-store';



export async function GET(request?: Request) {
  try {
    // Access searchParams if request is provided to ensure dynamic evaluation
    if (request?.url) {
      new URL(request.url).searchParams.get('t');
    }
    const accounts = await getCloudAccounts();
    return NextResponse.json({
      success: true,
      accounts,
      users: accounts.map((a) => a.user),
    });
  } catch (error: unknown) {
    if ((error as { digest?: string })?.digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    const msg = error instanceof Error ? error.message : 'Failed to fetch accounts';
    console.error('[API /api/auth/accounts] Error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
