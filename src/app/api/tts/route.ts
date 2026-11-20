import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSession, isCrossOriginRequest, NO_STORE_HEADERS, sessionErrorResponse } from '@/lib/server-auth';
import { put, getObjectBuffer, isCloudStorageConfigured } from '@/lib/r2-client';
import { buildSsml, ttsProviders, type TtsProvider } from '@/lib/tts-ssml';

/**
 * POST /api/tts  { text }  ->  audio/mpeg. ElevenLabs Egyptian voice first
 * (ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID), Azure as backup.
 * Signed-in users only. Every clip is saved, so the same sentence is only
 * paid for once. With neither set it answers
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
  const providers = ttsProviders();
  if (!providers.length) {
    return NextResponse.json({ success: false, error: 'not-configured' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  for (const provider of providers) {
    const key = `tts/${createHash('sha256').update(`${provider.voiceTag}|${text}`).digest('hex')}.mp3`;
    if (isCloudStorageConfigured()) {
      const cached = await getObjectBuffer(key).catch(() => null);
      if (cached?.data?.length) return audio(cached.data);
    }
    const buf = await synthesize(provider, text);
    if (!buf) continue; // e.g. monthly ElevenLabs allowance used up -> try Azure
    if (isCloudStorageConfigured()) {
      await put(key, Buffer.from(buf), { contentType: 'audio/mpeg', addRandomSuffix: false, allowOverwrite: true }).catch(() => {});
    }
    return audio(buf);
  }
  return NextResponse.json({ success: false, error: 'tts-failed' }, { status: 502, headers: NO_STORE_HEADERS });
}

async function synthesize(provider: TtsProvider, text: string): Promise<Uint8Array | null> {
  try {
    const res =
      provider.name === 'elevenlabs'
        ? await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID as string)}?output_format=mp3_44100_64`,
            {
              method: 'POST',
              headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY as string, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
              body: JSON.stringify({
                text,
                model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
                voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 0.92 },
              }),
            }
          )
        : await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY as string,
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
              'User-Agent': 'waslity',
            },
            body: buildSsml(text, provider.voiceTag),
          });
    if (!res.ok) {
      console.warn(`[tts] ${provider.name} error`, res.status);
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length ? buf : null;
  } catch (error) {
    console.warn(`[tts] ${provider.name} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
}
