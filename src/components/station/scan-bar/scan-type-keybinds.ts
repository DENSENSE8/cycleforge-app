/**
 * Pure helpers for station scan-type keybinds (1–4 / 0 / ` / P).
 * Yield to HID wedge bursts — fast digit+Enter is a scan, not "arm mode 1".
 */

import { WEDGE_MAX_INTER_KEY_MS } from '@/lib/keyboard/wedge-scan-machine';

export { WEDGE_MAX_INTER_KEY_MS };

export type TypeKeybindAction =
  | { kind: 'arm'; index: number }
  | { kind: 'auto' }
  | { kind: 'toggle-stance' }
  | { kind: 'none' };

export function isWedgeBurst(
  prevAt: number,
  now: number,
  maxInterKeyMs: number = WEDGE_MAX_INTER_KEY_MS,
): boolean {
  if (prevAt <= 0) return false;
  return now - prevAt <= maxInterKeyMs;
}

/**
 * Resolve a key on a focused station scan input.
 * Digits / P / ` only bind when the field is empty (and not a wedge burst).
 */
export function resolveTypeKeybind(opts: {
  key: string;
  fieldEmpty: boolean;
  scanInputFocused: boolean;
  overlayOpen: boolean;
  capturing: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  modeCount: number;
  wedgeBurst: boolean;
}): TypeKeybindAction {
  if (!opts.scanInputFocused) return { kind: 'none' };
  if (opts.overlayOpen || opts.capturing) return { kind: 'none' };
  if (opts.metaKey || opts.ctrlKey || opts.altKey) return { kind: 'none' };
  if (opts.wedgeBurst) return { kind: 'none' };
  if (!opts.fieldEmpty) return { kind: 'none' };

  if (opts.key === '0' || opts.key === '`') return { kind: 'auto' };
  if (opts.key === 'p' || opts.key === 'P') return { kind: 'toggle-stance' };

  if (opts.key >= '1' && opts.key <= '9') {
    const index = Number(opts.key) - 1;
    if (index >= 0 && index < opts.modeCount) return { kind: 'arm', index };
  }
  return { kind: 'none' };
}

export function railHint(modeCount: number): string {
  const last = Math.min(Math.max(modeCount, 1), 9);
  return `1–${last} type · Esc Auto · P preview`;
}
