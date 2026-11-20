import { NextResponse } from 'next/server';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse, STAFF_ROLES } from '@/lib/server-auth';
import { put, getObjectJson, isCloudStorageConfigured } from '@/lib/r2-client';
import { approvedLabAdvice, isLabAdviceKey, mergeLabAdvice, type LabAdviceMap } from '@/lib/lab-advice';

const BLOB = 'dialycare_lab_advice.json';
let memory: LabAdviceMap = {};

async function readStored(): Promise<LabAdviceMap> {
  if (!isCloudStorageConfigured()) return memory;
  try {
    return ((await getObjectJson<LabAdviceMap>(BLOB)) || {}) as LabAdviceMap;
  } catch (error) {
    // Not saved yet -> drafts. Any other read error must not let a save
    // overwrite earlier approvals, so it is thrown.
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404 || String(error).includes('NoSuchKey')) return {};
    throw error;
  }
}

/**
 * GET /api/lab-advice
 *  - patients: { advice: { "phosphorus:high": "..." } }  every line except refused ones
 *  - staff:    { items: { key: { text, status, ... } } } every line with its review status
 */
export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);
  const all = mergeLabAdvice(await readStored());
  if (STAFF_ROLES.includes(session.user.role)) {
    return NextResponse.json({ success: true, items: all, canReview: session.user.role === 'admin' }, { headers: NO_STORE_HEADERS });
  }
  return NextResponse.json({ success: true, advice: approvedLabAdvice(all) }, { headers: NO_STORE_HEADERS });
}

/**
 * PUT /api/lab-advice  { key, text, status: 'approved' | 'rejected' | 'pending' }
 * Super admin only: approve, edit or refuse a line.
 */
export async function PUT(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request, { roles: ['admin'] });
  if (!session.ok) return sessionErrorResponse(session);

  const body = (await request.json().catch(() => null)) as { key?: unknown; text?: unknown; status?: unknown } | null;
  const status = body?.status;
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 400) : '';
  if (!isLabAdviceKey(body?.key) || !(status === 'approved' || status === 'rejected' || status === 'pending') || !text) {
    return NextResponse.json({ success: false, error: 'invalid' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const stored = await readStored();
  const next: LabAdviceMap = {
    ...stored,
    [body!.key as string]: { text, status, updatedAt: new Date().toISOString(), updatedBy: session.user.uid },
  };
  if (isCloudStorageConfigured()) {
    await put(BLOB, JSON.stringify(next), { contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
  } else {
    memory = next;
  }
  return NextResponse.json({ success: true, items: mergeLabAdvice(next) }, { headers: NO_STORE_HEADERS });
}
