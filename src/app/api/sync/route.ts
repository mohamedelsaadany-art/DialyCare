import { NextResponse } from 'next/server';
import { getCloudDatabase, mergeCloudDatabase } from '@/lib/cloud-store';
import { filterIncomingForAccount, scopeDatabaseForAccount } from '@/lib/api-scope';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';

/**
 * RFC 7232 Section 3.2 If-None-Match conditional request matching.
 * Performs tokenized weak/strong equivalence comparison and supports wildcard '*' and comma lists.
 * Prevents substring false matches (e.g. W/"v1-patient1" vs W/"v1-patient10").
 */
export function isIfNoneMatch(clientHeader: string | null, serverEtag: string): boolean {
  if (!clientHeader) return false;
  const trimmed = clientHeader.trim();
  if (!trimmed) return false;
  if (trimmed === '*') return true;
  const normalizeTag = (tag: string) => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  const serverNormalized = normalizeTag(serverEtag);
  const clientTags = trimmed.split(',').map(normalizeTag);
  return clientTags.includes(serverNormalized);
}

/**
 * GET  /api/sync — the caller's view of the database (B1c):
 *      staff: everything (accounts without passwords); patient: only their own data.
 * POST /api/sync — merge the caller's local changes, filtered per role
 *      (see src/lib/api-scope.ts), then return the caller's scoped view.
 * No session -> 401. Accounts are never written through this route.
 */
export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);
  try {
    const data = await getCloudDatabase();
    const scoped = scopeDatabaseForAccount(data, session.account);
    const etag = `W/"${data.lastUpdated || 'v1'}-${session.account.user.uid}"`;
    const clientEtag = request.headers.get('if-none-match');
    if (isIfNoneMatch(clientEtag, etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ...NO_STORE_HEADERS,
          ETag: etag,
        },
      });
    }
    return NextResponse.json(
      { success: true, data: scoped },
      { headers: { ...NO_STORE_HEADERS, ETag: etag } }
    );
  } catch (error: unknown) {
    console.error('[API /api/sync GET] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'syncFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalidRequest' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    // Fresh read (never a possibly stale cache): ownership checks + the merge are a read-modify-write.
    const current = await getCloudDatabase({ forWrite: true });
    const { patch, dropped } = filterIncomingForAccount(body, session.account, current);
    if (dropped > 0) {
      console.warn(`[API /api/sync POST] dropped ${dropped} row(s) not writable by role ${session.user.role}`);
    }
    const hasWrites = Object.values(patch).some((v) => Array.isArray(v) && v.length > 0);
    const merged = hasWrites ? await mergeCloudDatabase(patch) : current;
    const postEtag = `W/"${merged.lastUpdated || 'v1'}-${session.account.user.uid}"`;
    return NextResponse.json(
      { success: true, data: scopeDatabaseForAccount(merged, session.account) },
      { headers: { ...NO_STORE_HEADERS, ETag: postEtag } }
    );
  } catch (error: unknown) {
    console.error('[API /api/sync POST] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'syncFailed' }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
