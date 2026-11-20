import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';
import { put, getObjectBuffer, isCloudStorageConfigured } from '@/lib/r2-client';
import { buildSsml, isAzureSpeechConfigured } from '@/lib/tts-ssml';

/**
 * POST /api/tts  { text }  ->  audio/mpeg, spoken by Azure's Egyptian voice.
 * Signed-in users only. Every clip is saved, so the same sentence is only
 * paid for once. Without AZURE_SPEECH_KEY / AZURE_SPEECH_REGION it answers
 * 503 and the app uses the phone's own voice instead.
 */
const MAX_CHARS = 700;

const audio = (buf: Uint8Array) =>
  new NextResponse(Buffer.from(buf), {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' },
  });

export async function POST(request: Request) {
  if (isCrossOriginRequest(request)) {
    return NextResponse.json({ success: false, error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const session = await getSession(request);
  if (!session.ok) return sessionErrorResponse(session);

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (!text || text.length > MAX_CHARS) {
    return NextResponse.json({ success: false, error: 'invalid' }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!isAzureSpeechConfigured()) {
    return NextResponse.json({ success: false, error: 'not-configured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const voice = process.env.AZURE_SPEECH_VOICE || 'ar-EG-SalmaNeural';
  const key = `tts/${createHash('sha256').update(`${voice}|${text}`).digest('hex')}.mp3`;

  if (isCloudStorageConfigured()) {
    const cached = await getObjectBuffer(key).catch(() => null);
    if (cached?.data?.length) return audio(cached.data);
  }

  try {
    const res = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY as string,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'waslity',
      },
      body: buildSsml(text, voice),
    });
    if (!res.ok) {
      console.warn('[tts] azure error', res.status);
      return NextResponse.json({ success: false, error: 'tts-failed' }, { status: 502, headers: NO_STORE_HEADERS });
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (isCloudStorageConfigured()) {
      await put(key, Buffer.from(buf), { contentType: 'audio/mpeg', addRandomSuffix: false, allowOverwrite: true }).catch(() => {});
    }
    return audio(buf);
  } catch (error) {
    console.warn('[tts] failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'tts-failed' }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
