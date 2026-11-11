/**
 * Native Web Audio API Alarm Utility for DialyCare
 *
 * Implements a synthesized 3-beep clinical emergency alarm burst using
 * the standard HTML5 Web Audio API (AudioContext + GainNode).
 *
 * Key guarantees:
 * 1. 100% offline-capable — no external audio files or network requests.
 * 2. SSR-safe — early returns safely when `typeof window === 'undefined'`.
 * 3. Graceful degradation — safely handles autoplay restrictions and unsupported browsers.
 * 4. Tone cadence: 3-beep alarm burst alternating 880Hz / 440Hz with smooth gain envelopes
 *    to prevent audible clicks or speaker pops.
 */

export function isAudioContextSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/**
 * Synthesizes a 3-beep medical alarm burst for critical fluid limits.
 * Tone cadence:
 * - Beep 1: 880 Hz (A5), duration ~120ms
 * - Beep 2: 880 Hz (A5), duration ~120ms
 * - Beep 3: 440 Hz (A4), duration ~200ms
 *
 * Safe to call repeatedly; each invocation manages its own oscillator nodes.
 */
export async function playFluidAlarm(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      console.warn('[DialyCare Audio] Web Audio API not supported in this browser environment.');
      return;
    }

    const audioCtx = new AudioContextClass();

    // Browser autoplay policy might suspend the audio context until user interaction
    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (err) {
        console.warn('[DialyCare Audio] AudioContext resume failed:', err);
      }
    }

    const startTime = audioCtx.currentTime;

    // 3-beep cadence (880Hz, 880Hz, 440Hz)
    const beepSequence = [
      { frequency: 880, start: startTime + 0.00, duration: 0.12 },
      { frequency: 880, start: startTime + 0.18, duration: 0.12 },
      { frequency: 440, start: startTime + 0.36, duration: 0.20 },
    ];

    for (const beep of beepSequence) {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(beep.frequency, beep.start);

      // Acoustic envelope: quick attack and exponential decay to prevent clicking
      gainNode.gain.setValueAtTime(0.0001, beep.start);
      gainNode.gain.exponentialRampToValueAtTime(0.35, beep.start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, beep.start + beep.duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(beep.start);
      oscillator.stop(beep.start + beep.duration + 0.02);
    }

    // Clean up audio context resources after completion
    setTimeout(() => {
      try {
        if (audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {});
        }
      } catch {
        // Safe ignore
      }
    }, 850);
  } catch (error) {
    console.warn('[DialyCare Audio] Unable to play fluid alarm:', error);
  }
}
