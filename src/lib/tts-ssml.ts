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
