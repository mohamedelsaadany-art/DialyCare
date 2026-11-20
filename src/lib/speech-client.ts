'use client';

/**
 * Speaking for the talking avatar.
 *  1. The phone's own Arabic voice (chosen: it sounds better than Azure's).
 *  2. Server voice (/api/tts) only if USE_SERVER_VOICE is turned back on.
 *  3. If the phone has no Arabic voice: nothing is said, the text stays on screen.
 * One <audio> element is reused, so after the first tap phones keep playing.
 */

const SILENCE =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let audioEl: HTMLAudioElement | null = null;
let runId = 0;
let azureUnavailable = false;
/** Off: the phone's own voice sounded better than Azure's for our patients. */
const USE_SERVER_VOICE = false;

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

export function stopSpeaking(): void {
  runId++;
  try {
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
    }
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
}

function pickArabicVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((v) => v.lang?.toLowerCase() === 'ar-eg') ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('ar')) ||
    null
  );
}

function speakWithPhone(text: string, id: number): Promise<void> {
  return new Promise((resolve) => {
    if (id !== runId || typeof window === 'undefined' || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickArabicVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || 'ar-EG';
    u.rate = 0.9;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
    // safety: never hang if the phone gives no end event
    setTimeout(resolve, Math.max(4000, text.length * 120));
  });
}

async function speakWithAzure(text: string, id: number): Promise<boolean> {
  if (!USE_SERVER_VOICE || azureUnavailable) return false;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ text }),
    });
    if (res.status === 503) azureUnavailable = true;
    if (!res.ok || id !== runId) return false;
    const url = URL.createObjectURL(await res.blob());
    const a = getAudio();
    await new Promise<void>((resolve, reject) => {
      a.onended = () => resolve();
      a.onerror = () => reject(new Error('audio'));
      a.src = url;
      a.play().catch(reject);
    });
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Say the parts one after another. `onPart(i)` fires as each part starts (to
 * show it on screen); resolves when done or when stopSpeaking() is called.
 */
export async function speakParts(parts: string[], onPart?: (index: number) => void): Promise<void> {
  stopSpeaking();
  const id = runId;
  // Unlock the phone voice inside the tap too (must happen before any await).
  try {
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(' '));
  } catch {
    // ignore
  }
  // Unlock audio inside the tap (iPhone): play a split second of silence.
  try {
    const a = getAudio();
    a.src = SILENCE;
    await a.play().catch(() => {});
  } catch {
    // ignore
  }
  for (let i = 0; i < parts.length; i++) {
    if (id !== runId) return;
    onPart?.(i);
    const ok = await speakWithAzure(parts[i], id);
    if (!ok && id === runId) await speakWithPhone(parts[i], id);
  }
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && (typeof Audio !== 'undefined' || !!window.speechSynthesis);
}
