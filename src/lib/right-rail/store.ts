'use client';

/**
 * Right-rail occupant store — the single owner of "who is in the right-edge
 * slot right now". A tiny module-level store (subscribe/emit + a cached
 * snapshot for `useSyncExternalStore`), the same shape as
 * `src/lib/detail-stacks/history-store.ts` and `src/lib/assistant/context-store.ts`.
 *
 * WHY THIS EXISTS
 * The assistant dock and every `open<Kind>Id` detail slide-over were each an
 * independent `fixed right-0 top-* w-[420px] z-panel` panel. Same geometry, same
 * z-band → at equal z-index paint order decided the winner, so the globally
 * mounted assistant dock (rendered AFTER the page in the tree) always painted
 * ON TOP of the detail panel a page had just opened. There was no single owner
 * of the slot to coordinate a crossfade — the exact "one crossfading region per
 * archetype" rule in `.claude/rules/display/motion-crossfade.md` being violated.
 *
 * This store makes the right rail ONE region. Panels REGISTER as occupants with
 * a priority; `RightRailHost` renders exactly the top occupant and crossfades
 * between occupants (keyed on `id`) in a single `AnimatePresence`. A `node` of
 * `null` is a YIELD claim: it wins the slot to suppress everything below it
 * while rendering nothing — used to hand the slot to a not-yet-migrated detail
 * panel that still renders its own fixed element (see the migration note below).
 *
 * MIGRATION PATH (strangler)
 * Today two occupant kinds use this: the assistant (a real node) and a single
 * URL-driven `external-detail` YIELD claim (`node: null`) that suppresses the
 * assistant whenever any `open<Kind>Id` param is present. As each detail panel
 * is converted to render INSIDE the host, it registers its own real node at
 * `RIGHT_RAIL_PRIORITY.detail` and drops its private `fixed` geometry; the
 * `external-detail` yield claim then becomes redundant for that kind. Until a
 * panel migrates, the yield claim is what stops the assistant covering it.
 */

import type { ReactNode } from 'react';

/**
 * Precedence tiers for the right slot. A detail panel (a specific record the
 * operator just chose) outranks the ambient assistant chat, so opening one
 * crossfades the assistant out and the detail in.
 */
export const RIGHT_RAIL_PRIORITY = {
  /** Ambient assistant chat / context rail. */
  assistant: 10,
  /** A picked record's detail panel — outranks the assistant. */
  detail: 100,
} as const;

export interface RightRailPanel {
  /** Stable identity of this occupant, e.g. `assistant`, `detail:shipment:123`.
   *  Doubles as the `AnimatePresence` key, so it must change only when the slot
   *  content genuinely swaps to a different entity. */
  id: string;
  /** Higher wins the slot; ties break to the most recently registered. */
  priority: number;
  /** What to render. `null` = a YIELD claim (win the slot, render nothing). */
  node: ReactNode;
  /** Backdrop / Escape dismiss — omitted for occupants that manage close internally. */
  onClose?: () => void;
  /** When true, this occupant renders in the elevated `detailStack` z-band (above
   *  a workbench workspace overlay + its popovers) with a deeper darkening + blur
   *  backdrop. Opt-in per occupant — only surfaces that open OVER a `panel`-band
   *  workspace (receiving Unbox/Triage) need it. */
  elevated?: boolean;
  /**
   * Modality. **Defaults to `true`** so every occupant keeps the historical
   * blocking behavior (scrim + `aria-modal` + body scroll lock) unless it opts
   * out.
   *
   * `false` = a NON-MODAL inspector: no backdrop, no scroll lock, `role="region"`
   * instead of `role="dialog"`, and the page underneath stays scrollable and
   * clickable. That is the right contract for a pick-a-row-and-edit-it surface
   * (the dashboard order inspector): the operator's context — sibling rows, KPI
   * strip, lifecycle tabs — is exactly what a scrim would hide. Reserve `true`
   * for occupants that genuinely block until dismissed.
   *
   * Note this ALSO fixes an a11y defect for opting-out occupants: the host has
   * never installed a focus trap, so `aria-modal="true"` was a claim the DOM did
   * not honor. Non-modal markup is the honest form; do not "fix" it by adding a
   * trap (see `docs/todo/dashboard-inline-detail-editing-EXECUTION-PLAN.md` §3).
   */
  modal?: boolean;
  /**
   * When true (non-modal only), mount an invisible dismiss layer behind the
   * card so click-off closes — same dismiss affordance as the modal scrim,
   * without darkening. Opt-in: the dashboard order inspector leaves this off
   * so the grid stays live; receiving details turns it on.
   */
  closeOnOutsideClick?: boolean;
  /**
   * Whether this occupant may PUSH the work surface (reflow beside it) rather
   * than float over it. **Defaults to `true`** — the house ruling is that every
   * resident edge pushes (`source-of-truth.md` → Right-rail modality), so an
   * occupant that floats has to say why.
   *
   * `false` is a greppable per-occupant freeze, and today it means one of three
   * things, each recorded at its call site:
   *  - the occupant is ambient chat with its own flush-right dock (`assistant`);
   *  - the occupant opens on a STATION page whose right edge is already pushed
   *    by `UnboxPushColumn`, and two push mechanisms on one edge is exactly what
   *    this store exists to prevent;
   *  - the occupant configures the surface it would be squeezing, so a push
   *    would make its own effect indistinguishable from the reflow
   *    (`detail:grid-column-details`).
   *
   * The actual push/overlay decision is `resolveRightRailFrame`
   * (`src/lib/right-rail/frame.ts`) — this flag only says whether to ask.
   */
  push?: boolean;
  /** Accessible name for the aside. Required in spirit for non-modal occupants
   *  (`role="region"` needs a name); the host falls back to a generic label. */
  ariaLabel?: string;
  /** Insertion order, for deterministic tie-breaking. */
  seq: number;
}

const panels = new Map<string, RightRailPanel>();
const listeners = new Set<() => void>();
let seq = 0;
let topSnapshot: RightRailPanel | null = null;

function recomputeTop(): void {
  let top: RightRailPanel | null = null;
  for (const p of panels.values()) {
    if (
      !top ||
      p.priority > top.priority ||
      (p.priority === top.priority && p.seq > top.seq)
    ) {
      top = p;
    }
  }
  topSnapshot = top;
}

function emit(): void {
  for (const l of listeners) l();
}

/**
 * Claim the right slot with an occupant. Returns an unregister fn that removes
 * exactly this claim. Node freshness is handled separately by
 * `updateRightRailPanelNode` so a content re-render never unmounts/remounts the
 * occupant (which would drop its state + retrigger the crossfade).
 *
 * Records are IMMUTABLE snapshots (a node update replaces the record with a new
 * object) so `useSyncExternalStore`'s Object.is check detects the change. The
 * per-registration `seq` doubles as an ownership token: a stale unregister only
 * fires if its `seq` still owns the id, so a re-register under the same id can't
 * be clobbered by the previous registration's cleanup.
 */
export function registerRightRailPanel(input: {
  id: string;
  priority: number;
  node: ReactNode;
  onClose?: () => void;
  elevated?: boolean;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  push?: boolean;
  ariaLabel?: string;
}): () => void {
  seq += 1;
  const mySeq = seq;
  panels.set(input.id, {
    id: input.id,
    priority: input.priority,
    node: input.node,
    onClose: input.onClose,
    elevated: input.elevated,
    modal: input.modal,
    closeOnOutsideClick: input.closeOnOutsideClick,
    push: input.push,
    ariaLabel: input.ariaLabel,
    seq: mySeq,
  });
  recomputeTop();
  emit();
  return () => {
    const current = panels.get(input.id);
    if (current && current.seq === mySeq) {
      panels.delete(input.id);
      recomputeTop();
      emit();
    }
  };
}

/**
 * Refresh a live occupant's presentation (new record ref, close handler, band,
 * modality, label) while keeping its slot + `seq` — so a content re-render never
 * unmounts the occupant or retriggers the crossfade. No-ops when nothing changed
 * and when the id holds no claim.
 */
export function updateRightRailPanelNode(input: {
  id: string;
  node: ReactNode;
  onClose?: () => void;
  elevated?: boolean;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  push?: boolean;
  ariaLabel?: string;
}): void {
  const { id, node, onClose, elevated, modal, closeOnOutsideClick, push, ariaLabel } = input;
  const current = panels.get(id);
  if (
    !current ||
    (current.node === node &&
      current.onClose === onClose &&
      current.elevated === elevated &&
      current.modal === modal &&
      current.closeOnOutsideClick === closeOnOutsideClick &&
      // `push` participates in change detection: an occupant that flipped its
      // policy must re-emit, or the host would keep rendering the old geometry.
      current.push === push &&
      current.ariaLabel === ariaLabel)
  )
    return;
  panels.set(id, {
    ...current,
    node,
    onClose,
    elevated,
    modal,
    closeOnOutsideClick,
    push,
    ariaLabel,
  });
  recomputeTop();
  emit();
}

export function subscribeRightRail(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRightRailTop(): RightRailPanel | null {
  return topSnapshot;
}

/** Server snapshot: the rail is client-only chrome, so nothing renders on SSR. */
export function getServerRightRailTop(): RightRailPanel | null {
  return null;
}
