import { NextResponse } from 'next/server';
import { getObjectBuffer, isR2Configured } from '@/lib/r2-client';
import { getSession, sessionErrorResponse } from '@/lib/server-auth';

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  try {
    const session = await getSession(request, { roles: ['admin'] });
    if (!session.ok) return sessionErrorResponse(session);

    const { key } = await context.params;
    if (!key || key.length === 0) {
      return new NextResponse('Bad Request: Missing key', { status: 400 });
    }

    const objectKey = key.join('/');

    // Basic path traversal prevention
    if (objectKey.includes('..') || objectKey.startsWith('/')) {
      return new NextResponse('Bad Request: Invalid key format', { status: 400 });
    }

    // Allowlist: only staff ID card images in id-cards/<name>.(png|jpg|jpeg|webp)
    if (!/^id-cards\/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$/i.test(objectKey)) {
      return new NextResponse('File Not Found', { status: 404 });
    }

    if (!isR2Configured()) {
      return new NextResponse('Storage service not configured', { status: 503 });
    }

    const obj = await getObjectBuffer(objectKey);
    if (!obj) {
      return new NextResponse('File Not Found', { status: 404 });
    }

    const isAllowedInlineImage =
      obj.contentType === 'image/png' ||
      obj.contentType === 'image/jpeg' ||
      obj.contentType === 'image/webp';

    const contentType: string =
      isAllowedInlineImage && obj.contentType ? obj.contentType : 'application/octet-stream';
    const contentDisposition = isAllowedInlineImage
      ? 'inline'
      : `attachment; filename="${key[key.length - 1]}"`;

    return new NextResponse(new Uint8Array(obj.data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': contentDisposition,
      },
    });
  } catch (error) {
    console.error('[Storage Proxy] Error fetching file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
