/** Azure text-to-speech helpers (Egyptian Arabic voice). SERVER ONLY. */
export function isAzureSpeechConfigured(): boolean {
  return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string);
}

export function buildSsml(text: string, voice: string): string {
  return `<speak version="1.0" xml:lang="ar-EG"><voice name="${escapeXml(voice)}"><prosody rate="-8%">${escapeXml(text)}</prosody></voice></speak>`;
}

/** ElevenLabs (natural Egyptian voice from their voice library). Preferred when set. */
export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

export interface TtsProvider {
  name: 'elevenlabs' | 'azure';
  /** part of the cache key, so changing the voice never replays old clips */
  voiceTag: string;
}

/** Voices to try, best first. Empty -> the app uses the phone's voice. */
export function ttsProviders(): TtsProvider[] {
  const list: TtsProvider[] = [];
  if (isElevenLabsConfigured()) {
    list.push({ name: 'elevenlabs', voiceTag: `el:${process.env.ELEVENLABS_VOICE_ID}:${process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2'}` });
  }
  if (isAzureSpeechConfigured()) {
    list.push({ name: 'azure', voiceTag: process.env.AZURE_SPEECH_VOICE || 'ar-EG-SalmaNeural' });
  }
  return list;
}
