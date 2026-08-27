'use client';

/**
 * `closeRightPanel` — the ONE way the right panel closes.
 *
 * ## Why a third module and not just `closeAndCachePanel`
 *
 * Two stores answer two different halves of "close", and neither can import
 * the other: `store.ts` (occupancy — who is registered) already imports
 * `panel-store.ts` (lifecycle — dismiss / draft cache / Resume), so the
 * composition of the two lives above both.
 *
 * The halves are:
 *
 *  - **host lifecycle** — `closeAndCachePanel()`: snapshot the dirty draft,
 *    park the occupant id, toast "Draft saved." with Resume.
 *  - **occupant teardown** — the panel's own `onClose`: clear a multi-select
 *    scope, drop a URL param, flip a parent's `open` flag.
 *
 * ## The defect this closes
 *
 * The host's singleton dismiss fired ONLY the lifecycle half, and every
 * occupant that also needed the teardown half therefore mounted a SECOND close
 * of its own to reach it — a footer `→|` beside a submit CTA, a band `→|`
 * under the host's own control. Two dismiss affordances with two different
 * behaviours on one non-modal column: the visible one at the bottom cleared
 * the selection, the one in the corner left the rows checked with nothing on
 * screen saying so (`OrderRailShell`'s own comment says exactly that).
 *
 * Firing both halves from one entry point makes the corner control correct
 * everywhere, which is what lets every panel-owned close be deleted.
 *
 * ## Order is deliberate
 *
 * Lifecycle FIRST, teardown second. `captureDraft()` reads the live view's
 * registered getter, so it must run before a teardown that could unregister
 * it. The assistant is the one occupant with no lifecycle half at all
 * (`closeAndCachePanel` early-returns on its id), so it routes straight to its
 * own `onClose` — the host already treated it that way.
 *
 * ## Refusal is a THIRD answer, and it comes first
 *
 * `onClose` can only say "I am done"; it cannot say "not now". An occupant that
 * guarded its own handler (`if (!isRunning) onClose()`) still had the lifecycle
 * half run against it — parked and toasted "Draft saved." over a live progress
 * readout, with its parent's `open` flag still true and an 8s Resume toast the
 * only route back. That is the same two-halves-disagreeing defect this module
 * was written to close, pointed the other way: the host overriding an
 * occupant's deliberate refusal. `canClose` is consulted BEFORE either half.
 */

import { closeAndCachePanel } from '@/lib/right-rail/panel-store';
import { getRightRailTop } from '@/lib/right-rail/store';

export function closeRightPanel(): void {
  const top = getRightRailTop();
  if (!top) return;

  // Refusal outranks both halves. Checked first so a veto costs no draft
  // capture, no park, and no toast.
  if (top.canClose && !top.canClose()) return;

  if (top.id === 'assistant') {
    top.onClose?.();
    return;
  }

  // Ephemeral desk tools unmount on close — no draft park / Resume toast.
  if (top.resumeOnDismiss === false) {
    top.onClose?.();
    return;
  }

  closeAndCachePanel();
  top.onClose?.();
}
