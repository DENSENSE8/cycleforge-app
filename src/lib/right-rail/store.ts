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
 * ## The occupancy read API is FOUR functions, and that is the seam
 *
 * `RightRailHost` reads this store through exactly `subscribeRightRail`,
 * `getRightRailTop`, `getRightRailTopSkipping` and `getServerRightRailTop`.
 * Nothing else in that 547-line component touches occupancy. That is what lets
 * the whole host be replaced — by the N-tile
 * `@/components/workspace/tools/RightRailTileHost` — without any of the 43
 * registrants changing a line: the replacement reads the same seam, in its
 * N-ary form (`getRightRailOccupants` / `…Skipping` / `getServerRightRailOccupants`,
 * plus the same `subscribeRightRail`).
 *
 * The single-occupant functions are now SHIMS over the head of an ordered list.
 * They are not deprecated: "the top occupant" is still the right answer for a
 * one-slot host, and keeping them means the swap is a flag, not a migration.
 *
 * MIGRATION PATH (strangler)
 * The URL-driven `external-detail` YIELD claim (`node: null`) is **retired** —
 * desk record peeks register real nodes at `RIGHT_RAIL_PRIORITY.detail` via
 * `DetailStackRailRegistrar` / `useRegisterRightPanel`. Do not reintroduce a
 * null-node yield id named `external-detail`. Remaining Dialog /
 * `RightPaneOverlay` create/edit twins stay on Session 2 of
 * `docs/todo/right-rail-inspector-FINISH-HANDOFF.md` (dirty strategy before
 * converting). A `node: null` YIELD claim remains a valid API for rare
 * suppress-the-slot cases — never as a standing twin of an unmigrated panel.
 */

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
  /**
   * VETO. Returns false while this occupant must not be dismissed — a transfer
   * in flight, an irreversible step mid-run.
   *
   * `onClose` cannot express refusal: a handler that no-ops still lets the host
   * run the lifecycle half, so the panel is parked and toasted "Draft saved."
   * while the occupant believes it is still open. Both sync dialogs shipped
   * exactly that (`if (!isRunning) onClose()`), and their own buttons carried
   * `disabled={isRunning}` the host never consulted.
   *
   * Consulted BEFORE the lifecycle half, so a refusal costs nothing.
   */
  canClose?: () => boolean;
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
   * `false` is a greppable per-occupant freeze, and today it means one of two
   * things, each recorded at its call site:
   *  - the occupant is ambient chat with its own flush-right dock (`assistant`);
   *  - the occupant opens on a STATION page whose right edge is already pushed
   *    by `StationDisplaysPushColumn`, and two push mechanisms on one edge is exactly what
   *    this store exists to prevent.
   *
   * The actual push/overlay decision is `resolveRightRailFrame`
   * (`src/lib/right-rail/frame.ts`) — this flag only says whether to ask.
   */
  push?: boolean;
  /**
   * Whether the host may park this occupant via `DETAIL_STACK_COLLAPSE`
   * (Band 3 Show/Hide inspector · Cmd+\ · parked expand strip).
   * **Defaults to `true`.**
   *
   * Pass `false` for Unbox-parity occupants whose header `→|` dismisses the
   * claim entirely (e.g. Incoming details) — they must not also park into a
   * collapsed strip. Hairline is always drag-to-resize only on
   * `RightRailHost` (no sash-top chevron; Unbox Displays is the golden twin).
   */
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
   * Which TOOL this occupant is, when it is one.
   *
   * `DetailStackRailRegistrar` requires a `toolKey` with no default, so every
   * one of its 37 mount sites has answered "which tool am I" and the compiler
   * named the ones that had not. The palette reads it to highlight the active
   * tool's icon, and the N-tile host reads it for a tile identity that survives
   * a record swap inside one tile.
   *
   * Optional on the record itself: `useRegisterRightPanel` has four callers
   * that are not tools at all (the assistant dock, three task inspectors), and
   * an ambient chat surface has no tool key to invent.
   */
  toolKey?: string;
  /** Insertion order, for deterministic tie-breaking. */
  seq: number;
}

const panels = new Map<string, RightRailPanel>();
const listeners = new Set<() => void>();
let seq = 0;

const EMPTY_OCCUPANTS: readonly RightRailPanel[] = Object.freeze([]);

/**
 * Every occupant, highest precedence FIRST. Replaced the single `topSnapshot`
 * when the rail stopped being one slot: a tiling host needs the whole ordered
 * list, and a one-slot host needs its head, so one list serves both.
 *
 * Recomputed only on mutation and handed out by identity —
 * `useSyncExternalStore` compares with `Object.is`, so a freshly sorted array
 * per `getSnapshot()` call is an infinite render loop.
 */
let orderedSnapshot: readonly RightRailPanel[] = EMPTY_OCCUPANTS;

/**
 * Memo for {@link getRightRailOccupantsSkipping}. It has to FILTER, so it
 * cannot hand back `orderedSnapshot` itself — and an unmemoized filter is the
 * same infinite-loop hazard one level down. One slot is enough: the host asks
 * for exactly one skip id (the parked occupant) per render.
 */
let skipCache: { skipId: string; value: readonly RightRailPanel[] } | null = null;

function byPrecedence(a: RightRailPanel, b: RightRailPanel): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  // Ties break to the most recently registered — unchanged from the single-top
  // rule, so a re-registration still takes the slot from its predecessor.
  return b.seq - a.seq;
}

function recomputeOrder(): void {
  orderedSnapshot = Object.freeze([...panels.values()].sort(byPrecedence));
  skipCache = null;
  const top = orderedSnapshot[0] ?? null;
  syncPanelOccupant(top && top.node != null ? top.id : null);
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
  canClose?: () => boolean;
  elevated?: boolean;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  push?: boolean;
  edgeCollapse?: boolean;
  collapsedStrip?: boolean;
  ariaLabel?: string;
  toolKey?: string;
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
    toolKey: input.toolKey,
    seq: mySeq,
  });
  recomputeOrder();
  emit();
  return () => {
    const current = panels.get(input.id);
    if (current && current.seq === mySeq) {
      panels.delete(input.id);
      recomputeOrder();
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
  canClose?: () => boolean;
  elevated?: boolean;
  modal?: boolean;
  closeOnOutsideClick?: boolean;
  push?: boolean;
  edgeCollapse?: boolean;
  collapsedStrip?: boolean;
  ariaLabel?: string;
  toolKey?: string;
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
    toolKey,
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
      current.toolKey === toolKey)
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
    toolKey,
  });
  recomputeOrder();
  emit();
}

export function subscribeRightRail(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The winning occupant — the head of the ordered list. A shim since the rail
 * gained tiling, kept because a one-slot host asking "who is on top" is still
 * asking the right question.
 */
export function getRightRailTop(): RightRailPanel | null {
  return orderedSnapshot[0] ?? null;
}

/** Every occupant, highest precedence first. The N-tile host's read. */
export function getRightRailOccupants(): readonly RightRailPanel[] {
  return orderedSnapshot;
}

/** One occupant by id — what `closeRightPanel(instanceId)` targets. */
export function getRightRailPanel(id: string): RightRailPanel | null {
  return panels.get(id) ?? null;
}

/**
 * Occupancy top excluding `skipId` — used when the operator dismissed a detail
 * via closeAndCachePanel so a lower-priority occupant (assistant) can paint
 * without unregistering the cached view.
 */
export function getRightRailTopSkipping(skipId: string | null): RightRailPanel | null {
  if (!skipId) return getRightRailTop();
  return orderedSnapshot.find((p) => p.id !== skipId) ?? null;
}

/**
 * The N-ary twin of {@link getRightRailTopSkipping} — every occupant except the
 * parked one. Memoized on `skipId` because it must build a new array, and a new
 * array identity per `getSnapshot()` call loops `useSyncExternalStore` forever.
 */
export function getRightRailOccupantsSkipping(
  skipId: string | null,
): readonly RightRailPanel[] {
  if (!skipId) return orderedSnapshot;
  if (skipCache && skipCache.skipId === skipId) return skipCache.value;
  const value = Object.freeze(orderedSnapshot.filter((p) => p.id !== skipId));
  skipCache = { skipId, value };
  return value;
}

/** Server snapshot: the rail is client-only chrome, so nothing renders on SSR. */
export function getServerRightRailTop(): RightRailPanel | null {
  return null;
}

/**
 * Server snapshot for the N-tile host. A frozen constant, never a fresh array —
 * React re-invokes this on every server render.
 */
export function getServerRightRailOccupants(): readonly RightRailPanel[] {
  return EMPTY_OCCUPANTS;
}
