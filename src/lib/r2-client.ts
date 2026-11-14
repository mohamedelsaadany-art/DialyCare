/**
 * Cloudflare R2 Storage Client (S3-compatible)
 * Replaces @vercel/blob for persistent data storage and file uploads.
 * Cloudflare R2 provides zero egress fees and high S3 compatibility.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

let s3ClientInstance: S3Client | null = null;

/**
 * Check whether Cloudflare R2 credentials and bucket are configured in the environment.
 */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

/**
 * Returns true if either Cloudflare R2 or legacy Vercel Blob is configured.
 */
export function isCloudStorageConfigured(): boolean {
  return isR2Configured() || Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN);
}

/**
 * Lazily instantiate and return the S3 client configured for Cloudflare R2.
 */
export function getR2Client(): S3Client {
  if (!s3ClientInstance) {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) {
      throw new Error('[R2] Missing R2_ACCOUNT_ID environment variable');
    }
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return s3ClientInstance;
}

/**
 * Reset the S3Client instance (useful when testing or updating environment variables).
 */
export function resetR2Client(): void {
  s3ClientInstance = null;
}

/**
 * Resolve public or accessible URL for an object key.
 * If R2_PUBLIC_URL is configured (e.g. https://pub-xxx.r2.dev or custom CDN domain),
 * it returns that direct URL. Otherwise, it returns the Next.js API storage proxy URL (/api/storage/<key>),
 * ensuring image/file displays work even if public bucket access is disabled on Cloudflare.
 */
export function getPublicUrl(key: string): string {
  const cleanKey = key.replace(/^\/+/, '');
  const publicDomain = (process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (publicDomain) {
    return `${publicDomain}/${cleanKey}`;
  }
  return `/api/storage/${cleanKey}`;
}

export const getFileUrl = getPublicUrl;

export interface PutBlobResult {
  url: string;
  pathname: string;
  downloadUrl: string;
  contentType?: string;
}

/**
 * Upload / Put an object to Cloudflare R2.
 * Compatible with @vercel/blob `put` signature.
 */
export async function put(
  pathname: string,
  body: string | Buffer | Uint8Array | ReadableStream,
  options?: {
    access?: string;
    addRandomSuffix?: boolean;
    allowOverwrite?: boolean;
    contentType?: string;
  }
): Promise<PutBlobResult> {
  let key = pathname.replace(/^\/+/, '');
  if (options?.addRandomSuffix) {
    const extMatch = key.match(/(\.[^.]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    const base = ext ? key.slice(0, -ext.length) : key;
    key = `${base}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  }

  const bucket = process.env.R2_BUCKET_NAME || 'dialycare';
  const client = getR2Client();

  let bufferBody: Buffer | Uint8Array | string;
  if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
    bufferBody = body;
  } else {
    // Stream to Buffer
    const chunks: Uint8Array[] = [];
    // @ts-expect-error async iterator on web stream
    for await (const chunk of body) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    bufferBody = Buffer.concat(chunks);
  }

  let contentType = options?.contentType;
  if (!contentType) {
    if (key.endsWith('.json')) contentType = 'application/json; charset=utf-8';
    else if (key.endsWith('.png')) contentType = 'image/png';
    else if (key.endsWith('.jpg') || key.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (key.endsWith('.webp')) contentType = 'image/webp';
    else if (key.endsWith('.pdf')) contentType = 'application/pdf';
    else contentType = 'application/octet-stream';
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bufferBody,
      ContentType: contentType,
    })
  );

  const url = getPublicUrl(key);
  return {
    url,
    pathname: key,
    downloadUrl: url,
    contentType,
  };
}

export const uploadFile = put;

export interface ListBlobResultItem {
  pathname: string;
  url: string;
  downloadUrl: string;
  size: number;
  uploadedAt: Date;
}

export interface ListBlobResult {
  blobs: ListBlobResultItem[];
  cursor?: string;
  hasMore: boolean;
}

/**
 * List objects in Cloudflare R2 bucket.
 * Compatible with @vercel/blob `list` signature.
 */
export async function list(options?: {
  prefix?: string;
  limit?: number;
  cursor?: string;
}): Promise<ListBlobResult> {
  const bucket = process.env.R2_BUCKET_NAME || 'dialycare';
  const client = getR2Client();

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: options?.prefix,
    MaxKeys: options?.limit,
    ContinuationToken: options?.cursor,
  });

  const response = await client.send(command);

  const blobs: ListBlobResultItem[] = (response.Contents || []).map((item) => {
    const key = item.Key || '';
    const url = getPublicUrl(key);
    return {
      pathname: key,
      url,
      downloadUrl: url,
      size: item.Size || 0,
      uploadedAt: item.LastModified || new Date(),
    };
  });

  return {
    blobs,
    cursor: response.NextContinuationToken,
    hasMore: Boolean(response.IsTruncated),
  };
}

export const listFiles = list;

/**
 * Delete one or multiple objects from Cloudflare R2.
 * Compatible with @vercel/blob `del` signature.
 */
export async function del(keys: string | string[]): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME || 'dialycare';
  const client = getR2Client();
  const keyList = Array.isArray(keys) ? keys : [keys];
  const cleanKeys = keyList.map((k) => k.replace(/^\/+/, '')).filter(Boolean);

  if (cleanKeys.length === 0) return;

  if (cleanKeys.length === 1) {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: cleanKeys[0],
      })
    );
  } else {
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: cleanKeys.map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
  }
}

export const deleteFile = del;

/**
 * Check if an object exists in Cloudflare R2.
 */
export async function objectExists(key: string): Promise<boolean> {
  const bucket = process.env.R2_BUCKET_NAME || 'dialycare';
  const client = getR2Client();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key.replace(/^\/+/, ''),
      })
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (err as { name?: string })?.name;
    if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') {
      return false;
    }
    throw err;
  }
}

/**
 * Retrieve raw object buffer and content-type from Cloudflare R2.
 */
export async function getObjectBuffer(key: string): Promise<{ data: Buffer; contentType?: string } | null> {
  const bucket = process.env.R2_BUCKET_NAME || 'dialycare';
  const client = getR2Client();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key.replace(/^\/+/, ''),
      })
    );
    if (!res.Body) return null;
    const byteArray = await res.Body.transformToByteArray();
    return {
      data: Buffer.from(byteArray),
      contentType: res.ContentType,
    };
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (err as { name?: string })?.name;
    if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') {
      return null;
    }
    throw err;
  }
}

export const getFile = getObjectBuffer;

/**
 * Retrieve parsed JSON object directly from Cloudflare R2.
 */
export async function getObjectJson<T = unknown>(key: string): Promise<T | null> {
  const result = await getObjectBuffer(key);
  if (!result || !result.data) return null;
  return JSON.parse(result.data.toString('utf-8')) as T;
}
