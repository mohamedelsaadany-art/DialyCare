import { NextResponse } from 'next/server';
import { getObjectBuffer, isR2Configured } from '@/lib/r2-client';

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await context.params;
    if (!key || key.length === 0) {
      return new NextResponse('Bad Request: Missing key', { status: 400 });
    }

    const objectKey = key.join('/');

    // Basic path traversal prevention
    if (objectKey.includes('..') || objectKey.startsWith('/')) {
      return new NextResponse('Bad Request: Invalid key format', { status: 400 });
    }

    if (!isR2Configured()) {
      return new NextResponse('Storage service not configured', { status: 503 });
    }

    const obj = await getObjectBuffer(objectKey);
    if (!obj) {
      return new NextResponse('File Not Found', { status: 404 });
    }

    const contentType = obj.contentType || 'application/octet-stream';
    const isImage = contentType.startsWith('image/');
    const isPdf = contentType === 'application/pdf';

    // Cache control: long cache for immutable assets
    const cacheControl = isImage || isPdf
      ? 'public, max-age=31536000, immutable'
      : 'no-cache, no-store, must-revalidate';

    return new NextResponse(new Uint8Array(obj.data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Content-Disposition': isImage ? 'inline' : `inline; filename="${key[key.length - 1]}"`,
      },
    });
  } catch (error) {
    console.error('[Storage Proxy] Error fetching file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
