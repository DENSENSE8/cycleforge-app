'use client';

/** Right-rail occupant store — the single owner of "who is in the right-edge slot right now". */

import type { ReactNode } from 'react';
import { syncPanelOccupant } from '@/lib/right-rail/panel-store';

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
  /** VETO. Returns false while this occupant must not be dismissed — a transfer in flight, an irreversible step mid-run. */
  canClose?: () => boolean;
  /** When true, this occupant renders in the elevated `detailStack` z-band (above a workbench workspace overlay + its popovers) with a deeper… */
  elevated?: boolean;
  /** Modality. **Defaults to `true`** so every occupant keeps the historical blocking behavior (scrim + `aria-modal` + body scroll lock)… */
  modal?: boolean;
  /** When true (non-modal only), mount an invisible dismiss layer behind the card so click-off closes — same dismiss affordance as the modal… */
  closeOnOutsideClick?: boolean;
  /** Whether this occupant may PUSH the work surface (reflow beside it) rather than float over it. */
  push?: boolean;
  /** Whether the host may park this occupant via `DETAIL_STACK_COLLAPSE` (Band 3 Show/Hide inspector · Cmd+\ · parked expand strip). */
  edgeCollapse?: boolean;
  /**
   * Whether a parked occupant paints the host's 32px expand strip.
   * Defaults to `true`. Pass `false` when the owning workbench already keeps
   * a resident reopen icon in its chrome (Unbox History Band 3).
   */
  collapsedStrip?: boolean;
  /** Accessible name for the aside. Required in spirit for non-modal occupants
   *  (`role="region"` needs a name); the host falls back to a generic label. */
  ariaLabel?: string;
  /**
   * When false, host dismiss runs teardown only — no draft cache, no Resume
   * toast, no dismissed latch. Desk tools (Add inbound, paste panels) that
   * unmount on close and reopen fresh.
   */
  resumeOnDismiss?: boolean;
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
  syncPanelOccupant(top && top.node != null ? top.id : null);
}

function emit(): void {
  for (const l of listeners) l();
}

/** Claim the right slot with an occupant. */
export function registerRightRailPanel(input: {
  id: string;
  priority: number;
  node: ReactNode;
  onClose?: () => void;
  canClose?: () => boolean;
  elevated?: boolean;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  push?: boolean;
  edgeCollapse?: boolean;
  collapsedStrip?: boolean;
  ariaLabel?: string;
  resumeOnDismiss?: boolean;
}): () => void {
  seq += 1;
  const mySeq = seq;
  panels.set(input.id, {
    id: input.id,
    priority: input.priority,
    node: input.node,
    onClose: input.onClose,
    canClose: input.canClose,
    elevated: input.elevated,
    modal: input.modal,
    closeOnOutsideClick: input.closeOnOutsideClick,
    push: input.push,
    edgeCollapse: input.edgeCollapse,
    collapsedStrip: input.collapsedStrip,
    ariaLabel: input.ariaLabel,
    resumeOnDismiss: input.resumeOnDismiss,
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

/** Refresh a live occupant's presentation (new record ref, close handler, band, modality, label) while keeping its slot + `seq` — so a… */
export function updateRightRailPanelNode(input: {
  id: string;
  node: ReactNode;
  onClose?: () => void;
  canClose?: () => boolean;
  elevated?: boolean;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  push?: boolean;
  edgeCollapse?: boolean;
  collapsedStrip?: boolean;
  ariaLabel?: string;
  resumeOnDismiss?: boolean;
}): void {
  const {
    id,
    node,
    onClose,
    canClose,
    elevated,
    modal,
    closeOnOutsideClick,
    push,
    edgeCollapse,
    collapsedStrip,
    ariaLabel,
    resumeOnDismiss,
  } = input;
  const current = panels.get(id);
  if (
    !current ||
    (current.node === node &&
      current.onClose === onClose &&
      // A stale veto outlives the run it was guarding and traps the operator.
      current.canClose === canClose &&
      current.elevated === elevated &&
      current.modal === modal &&
      current.closeOnOutsideClick === closeOnOutsideClick &&
      // `push` participates in change detection: an occupant that flipped its
      // policy must re-emit, or the host would keep rendering the old geometry.
      current.push === push &&
      current.edgeCollapse === edgeCollapse &&
      current.collapsedStrip === collapsedStrip &&
      current.ariaLabel === ariaLabel &&
      current.resumeOnDismiss === resumeOnDismiss)
  )
    return;
  panels.set(id, {
    ...current,
    node,
    onClose,
    canClose,
    elevated,
    modal,
    closeOnOutsideClick,
    push,
    edgeCollapse,
    collapsedStrip,
    ariaLabel,
    resumeOnDismiss,
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

/**
 * Occupancy top excluding `skipId` — used when the operator dismissed a detail
 * via closeAndCachePanel so a lower-priority occupant (assistant) can paint
 * without unregistering the cached view.
 */
export function getRightRailTopSkipping(skipId: string | null): RightRailPanel | null {
  if (!skipId) return topSnapshot;
  let top: RightRailPanel | null = null;
  for (const p of panels.values()) {
    if (p.id === skipId) continue;
    if (
      !top ||
      p.priority > top.priority ||
      (p.priority === top.priority && p.seq > top.seq)
    ) {
      top = p;
    }
  }
  return top;
}

/** Server snapshot: the rail is client-only chrome, so nothing renders on SSR. */
export function getServerRightRailTop(): RightRailPanel | null {
  return null;
}
