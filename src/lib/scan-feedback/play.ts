/** Scan-feedback playback primitives — a short WebAudio confirmation tone and an optional haptic pulse for the receiving station's… */

export type ScanFeedbackKind = 'success' | 'reject';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    // A gesture-suspended context must be resumed before it will sound.
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function beep(ctx: AudioContext, freq: number, startAt: number, durationMs: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // Short attack/release envelope so the tone doesn't click.
  const t0 = ctx.currentTime + startAt;
  const dur = durationMs / 1000;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.12, t0 + 0.005);
  gain.gain.setValueAtTime(0.12, Math.max(t0 + 0.005, t0 + dur - 0.02));
  gain.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

/** Play the success/reject confirmation tone (no-op if WebAudio is unavailable). */
export function playScanTone(kind: ScanFeedbackKind): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (kind === 'success') {
    // Rising two-note chirp.
    beep(ctx, 880, 0, 70);
    beep(ctx, 1320, 0.08, 90);
  } else {
    // Low double buzz.
    beep(ctx, 220, 0, 120);
    beep(ctx, 180, 0.14, 160);
  }
}

/**
 * One-note pass / fail cue for an eyes-down verdict (the wipe bench,
 * station.md §6 — "pair the visual pass/fail with an audio confirmation").
 * Best-effort: an autoplay-blocked browser silently no-ops.
 */
export function playVerdictCue(kind: 'pass' | 'fail'): void {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain).connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = kind === 'pass' ? 880 : 220;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.start(now);
  osc.stop(now + 0.24);
}

/** Fire a best-effort haptic pulse (no-op where the Vibration API is unsupported). */
export function vibrateScan(kind: ScanFeedbackKind): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(kind === 'success' ? 16 : [24, 40, 24]);
  } catch {
    /* vibrate is best-effort; ignore unsupported hardware */
  }
}

/**
 * The press pulse of a flush execution cell (dock verb, tap-to-copy): one
 * heavy 40ms buzz so a glove on the floor feels the verb land. Best-effort —
 * iOS Safari has no Vibration API, so an iPhone gets the press inversion only.
 */
export function vibratePress(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(40);
  } catch {
    /* vibrate is best-effort; ignore unsupported hardware */
  }
}

/** Read-outcome buzz for a phone serial read (repair scan companion): saved · duplicate · refused. */
const READ_BUZZ: Record<'saved' | 'duplicate' | 'refused', number | number[]> = {
  saved: 40,
  duplicate: [60, 80, 60],
  refused: [180],
};

export function vibrateRead(kind: keyof typeof READ_BUZZ): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(READ_BUZZ[kind]);
  } catch {
    /* vibrate is best-effort; ignore unsupported hardware */
  }
}
