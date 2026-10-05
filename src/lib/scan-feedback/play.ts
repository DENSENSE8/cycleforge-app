/** Scan-feedback playback primitives — the one WebAudio context and Vibration API caller. Stations fire these through `useScanFeedback` so the org master switch and per-staff toggles apply. */

/** success = landed · warn = landed, but look (e.g. a serial already on another unit) · reject = refused. */
export type ScanFeedbackKind = 'success' | 'warn' | 'reject';

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

/** Play the scan confirmation tone (no-op if WebAudio is unavailable). */
export function playScanTone(kind: ScanFeedbackKind): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (kind === 'success') {
    // Rising two-note chirp.
    beep(ctx, 880, 0, 70);
    beep(ctx, 1320, 0.08, 90);
  } else if (kind === 'warn') {
    // Level double mid note — landed, but look.
    beep(ctx, 660, 0, 80);
    beep(ctx, 660, 0.12, 80);
  } else {
    // Low double buzz.
    beep(ctx, 220, 0, 120);
    beep(ctx, 180, 0.14, 160);
  }
}

/** Vibration pattern per kind (ms on/off). Exported for the native app's generated tokens (scripts/ios/generate-ios-tokens.mts). */
export const SCAN_BUZZ: Record<ScanFeedbackKind, number | number[]> = {
  success: 16,
  warn: [16, 80, 16],
  reject: [24, 40, 24],
};

/** Fire a best-effort haptic pulse (no-op where the Vibration API is unsupported). */
export function vibrateScan(kind: ScanFeedbackKind): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(SCAN_BUZZ[kind]);
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
