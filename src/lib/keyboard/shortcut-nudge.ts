/**
 * Preference-gated shortcut nudge toasts — teach the leader-armed grammar
 * after a mouse click, never a bare wedge-reachable key.
 *
 * Preference key in localStorage so it fades once learned without a schema
 * migration. Staff can silence via `cycleforge:shortcut-nudges=0`.
 */

import { toast } from '@/lib/toast';

const PREF_KEY = 'cycleforge:shortcut-nudges';
const SEEN_PREFIX = 'cycleforge:shortcut-nudge-seen:';

function nudgesEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function alreadySeen(id: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(`${SEEN_PREFIX}${id}`) === '1';
  } catch {
    return false;
  }
}

function markSeen(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${SEEN_PREFIX}${id}`, '1');
  } catch {
    /* ignore */
  }
}

/**
 * Show a one-shot tip after a pointer-driven action.
 * @param id Stable id so each tip fires at most once per browser.
 * @param tip Operator-facing tip (must describe ⌘; grammar on stations).
 */
function nudgeShortcutOnce(id: string, tip: string): void {
  if (!nudgesEnabled() || alreadySeen(id)) return;
  markSeen(id);
  toast.message(tip, { duration: 4500 });
}

/** Unbox Print / dock CTA mouse → teach Middle letters. Receive has no nudge. */
export function nudgeUnboxPrintReceive(kind: 'print' | 'cta'): void {
  if (kind === 'print') {
    nudgeShortcutOnce(
      'unbox-print',
      'Tip: next time press ⌘; then m then p to print.',
    );
    return;
  }
  nudgeShortcutOnce(
    'unbox-cta',
    'Tip: next time press ⌘; then m then a to act on the dock.',
  );
}
