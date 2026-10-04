/**
 * New-rack step model — pure, client-safe. One job tree for the phone
 * (`/m/racks/new`) and the desk frame (Inventory › Locations › Racks): the
 * same four steps, the same gating, the same request body. Surfaces only lay
 * it out (SURFACE_LAW §4 — no second step machine).
 *
 * Place → Shelves → Review → Print. Review asks the server for a `dryRun`
 * plan; Print commits the create and prints the returned rows.
 */

import type { ArrivalTier } from '@/lib/receiving/arrival-tier';
import {
  RACK_MAX_SHELVES,
  type CreateRackBody,
  type RackPlacementKind,
} from '@/lib/locations/rack-types';

export const RACK_CREATE_STEPS = ['place', 'shelves', 'review', 'print'] as const;
export type RackCreateStep = (typeof RACK_CREATE_STEPS)[number];

export const RACK_CREATE_STEP_LABELS: Readonly<Record<RackCreateStep, string>> = {
  place: 'Place',
  shelves: 'Shelves',
  review: 'Review',
  print: 'Print',
};

/** Where the new rack stands — a scanned or picked ROOM / STAGING spot. */
export interface RackCreatePlacement {
  /** Row id once known (manual pick, or resolved from a scan). */
  id: number | null;
  /** Scanned/typed label; used only when `id` is unknown. */
  code: string | null;
  name: string;
  kind: RackPlacementKind;
}

export interface RackCreateState {
  placement: RackCreatePlacement | null;
  shelves: number;
  /** Shelf number → urgency tier (null / absent = no tier). */
  tiers: Readonly<Record<number, ArrivalTier | null>>;
  /** One per create attempt — the server's idempotency key. */
  clientEventId: string;
}

/** Shelves a new rack starts with before the operator changes the count. */
export const RACK_CREATE_DEFAULT_SHELVES = 5;

export function initialRackCreateState(clientEventId: string): RackCreateState {
  return { placement: null, shelves: RACK_CREATE_DEFAULT_SHELVES, tiers: {}, clientEventId };
}

/** Clamp a shelf count into 1..{@link RACK_MAX_SHELVES}; tiers above the count are dropped. */
export function withShelfCount(state: RackCreateState, shelves: number): RackCreateState {
  const n = Math.min(RACK_MAX_SHELVES, Math.max(1, Math.trunc(Number.isFinite(shelves) ? shelves : 1)));
  const tiers: Record<number, ArrivalTier | null> = {};
  for (const [k, v] of Object.entries(state.tiers)) {
    const shelf = Number(k);
    if (shelf <= n && v != null) tiers[shelf] = v;
  }
  return { ...state, shelves: n, tiers };
}

export function withShelfTier(state: RackCreateState, shelf: number, tier: ArrivalTier | null): RackCreateState {
  if (!Number.isInteger(shelf) || shelf < 1 || shelf > state.shelves) return state;
  const tiers: Record<number, ArrivalTier | null> = { ...state.tiers };
  if (tier == null) delete tiers[shelf];
  else tiers[shelf] = tier;
  return { ...state, tiers };
}

/**
 * Why `step`'s primary verb cannot run yet — the disabled label (SURFACE_LAW
 * R9), or null when it can. Every step requires the steps before it.
 */
export function blockedReason(state: RackCreateState, step: RackCreateStep): string | null {
  if (!state.placement || (state.placement.id == null && !state.placement.code?.trim())) {
    return 'Choose where the rack stands';
  }
  if (step === 'place') return null;
  if (!Number.isInteger(state.shelves) || state.shelves < 1) return 'Add at least one shelf';
  if (state.shelves > RACK_MAX_SHELVES) return `At most ${RACK_MAX_SHELVES} shelves`;
  return null;
}

/** The step after `step`, or null on the last one. */
export function nextRackCreateStep(step: RackCreateStep): RackCreateStep | null {
  return RACK_CREATE_STEPS[RACK_CREATE_STEPS.indexOf(step) + 1] ?? null;
}

/** The step before `step`, or null on the first one. */
export function previousRackCreateStep(step: RackCreateStep): RackCreateStep | null {
  const i = RACK_CREATE_STEPS.indexOf(step);
  return i > 0 ? RACK_CREATE_STEPS[i - 1] : null;
}

/**
 * `POST /api/racks` body. The placement id wins when known; the scanned code
 * goes only when no id resolved. Throws when the state is not ready — callers
 * gate on {@link blockedReason} first.
 */
export function toCreateRackBody(state: RackCreateState, dryRun: boolean): CreateRackBody {
  const blocked = blockedReason(state, 'review');
  if (blocked || !state.placement) throw new Error(blocked ?? 'Choose where the rack stands');
  const shelfTiers = Object.entries(state.tiers)
    .map(([k, tier]) => ({ shelf: Number(k), tier }))
    .filter((t): t is { shelf: number; tier: ArrivalTier } => t.tier != null && t.shelf >= 1 && t.shelf <= state.shelves)
    .sort((a, b) => a.shelf - b.shelf);
  return {
    ...(state.placement.id != null
      ? { placementId: state.placement.id }
      : { placementCode: state.placement.code!.trim() }),
    shelves: state.shelves,
    ...(shelfTiers.length > 0 ? { shelfTiers } : {}),
    dryRun,
    clientEventId: state.clientEventId,
  };
}
