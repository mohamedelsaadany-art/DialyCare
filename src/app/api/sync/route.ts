import { NextResponse } from 'next/server';
import { getCloudDatabase, mergeCloudDatabase, type UnifiedCloudDatabase } from '@/lib/cloud-store';

export async function GET() {
  try {
    const data = await getCloudDatabase();
    return NextResponse.json(
      { success: true, data },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to retrieve cloud database';
    console.error('[API /api/sync GET] Error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<UnifiedCloudDatabase>;
    const merged = await mergeCloudDatabase(body);
    return NextResponse.json(
      { success: true, data: merged },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to merge cloud database';
    console.error('[API /api/sync POST] Error:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
