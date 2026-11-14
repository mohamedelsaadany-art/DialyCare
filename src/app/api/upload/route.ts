import { NextResponse } from 'next/server';
import { put, list, del, isCloudStorageConfigured } from '@/lib/r2-client';
import { isCrossOriginRequest, NO_STORE_HEADERS } from '@/lib/server-auth';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE_HEADERS });
}

/**
 * File upload endpoint to Cloudflare R2.
 * Supports multipart/form-data with a "file" field, or JSON with base64 data.
 */
export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return json({ success: false, error: 'forbidden' }, 403);
  }

  if (!isCloudStorageConfigured()) {
    return json({ success: false, error: 'Storage service not configured' }, 503);
  }

  const contentTypeHeader = request.headers.get('content-type') || '';

  try {
    let fileBuffer: Buffer;
    let filename: string;
    let contentType = 'application/octet-stream';

    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return json({ success: false, error: 'missing_file' }, 400);
      }

      if (file.size > 10 * 1024 * 1024) {
        return json({ success: false, error: 'file_too_large' }, 413);
      }

      const bytes = await file.arrayBuffer();
      fileBuffer = Buffer.from(bytes);
      filename = file.name || `upload-${Date.now()}`;
      contentType = file.type || contentType;
    } else {
      const body = (await request.json()) as {
        data?: string;
        filename?: string;
        contentType?: string;
      };

      if (!body.data) {
        return json({ success: false, error: 'missing_data' }, 400);
      }

      let dataString = body.data;
      if (dataString.startsWith('data:')) {
        const matches = dataString.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          contentType = matches[1];
          dataString = matches[2];
        }
      }

      fileBuffer = Buffer.from(dataString, 'base64');
      if (fileBuffer.length > 10 * 1024 * 1024) {
        return json({ success: false, error: 'file_too_large' }, 413);
      }

      filename = body.filename || `upload-${Date.now()}`;
      if (body.contentType) contentType = body.contentType;
    }

    const key = `uploads/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const result = await put(key, fileBuffer, {
      access: 'public',
      contentType,
      allowOverwrite: true,
    });

    return json({
      success: true,
      url: result.url,
      pathname: result.pathname,
      size: fileBuffer.length,
      contentType,
    });
  } catch (error) {
    console.error('[Upload API] POST failed:', error);
    return json({ success: false, error: 'upload_failed' }, 500);
  }
}

/**
 * List files in storage with optional ?prefix=...
 */
export async function GET(request: Request) {
  if (isCrossOriginRequest(request)) {
    return json({ success: false, error: 'forbidden' }, 403);
  }

  if (!isCloudStorageConfigured()) {
    return json({ success: false, error: 'Storage service not configured' }, 503);
  }

  try {
    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get('prefix') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const cursor = searchParams.get('cursor') || undefined;

    const result = await list({ prefix, limit, cursor });
    return json({
      success: true,
      blobs: result.blobs,
      cursor: result.cursor,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[Upload API] GET failed:', error);
    return json({ success: false, error: 'list_failed' }, 500);
  }
}

/**
 * Delete a file by key
 */
export async function DELETE(request: Request) {
  if (isCrossOriginRequest(request)) {
    return json({ success: false, error: 'forbidden' }, 403);
  }

  if (!isCloudStorageConfigured()) {
    return json({ success: false, error: 'Storage service not configured' }, 503);
  }

  try {
    const { searchParams } = new URL(request.url);
    let key = searchParams.get('key');

    if (!key) {
      try {
        const body = (await request.json()) as { key?: string };
        key = body.key || null;
      } catch {
        // No body
      }
    }

    if (!key) {
      return json({ success: false, error: 'missing_key' }, 400);
    }

    await del(key);
    return json({ success: true, deleted: key });
  } catch (error) {
    console.error('[Upload API] DELETE failed:', error);
    return json({ success: false, error: 'delete_failed' }, 500);
  }
}
