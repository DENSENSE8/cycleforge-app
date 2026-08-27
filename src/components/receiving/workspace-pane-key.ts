/**
 * Presence identity for a receiving carton overlay (`AnimatePresence` key).
 *
 * ONE key per physical carton, stable across:
 *
 *   (a) **the scan-resolution upgrade.** The pre-resolve optimistic stub
 *       (`buildOptimisticUnmatchedPaneStub`) has no `receiving_id` yet, so the
 *       scan slot ADOPTS the carton it resolves into. `buildMatchedStubRow`
 *       already documents this contract — "the workspace is keyed on
 *       receiving_id, so the real row reconciles IN PLACE (no remount)" — but
 *       the key derivation had drifted to `client_event_id`, which changes
 *       (`scan:<TRK>` → absent) at exactly that moment. Under `mode="wait"`
 *       that is a full exit-then-enter with an empty canvas, mid-scan.
 *
 *   (b) **the entry route.** Scanning a carton and then clicking that same
 *       carton's rail row is the same physical box; it must not exit-then-enter
 *       against itself.
 *
 * A genuinely DIFFERENT carton always yields a different key, so a scan that
 * lands on a new box still remounts the shell — the empty-pane-first policy
 * `ReceivingRightPane.pending.guard.test.ts` protects. The granularity moves
 * from "any scan-driven open" to "a scan-driven open of a different carton";
 * the intent (never reuse the prior carton's shell) is unchanged.
 *
 * `resolveWorkspacePaneSlot` is **idempotent under repeated application** —
 * `resolve(resolve(s, r), r) === resolve(s, r)` — which is what makes it safe to
 * advance the slot from a ref during render (React StrictMode double-invokes
 * render, and the key is needed at render time).
 *
 * Pure + dependency-light on purpose: `Triage` mounts the identical expression
 * today and is the intended second consumer (see the port note in
 * `docs/todo/station-workbench-port-FOLLOWUPS.md`).
 */

import { normalizeScanKey } from '@/lib/receiving/scan/normalize';

/** The only row fields the identity depends on. */
export interface WorkspacePaneRow {
  id: number;
  receiving_id?: number | null;
  tracking_number?: string | null;
}

export interface WorkspacePaneSlot {
  /** The `AnimatePresence` key currently occupying the overlay slot. */
  key: string;
  /** Carton this slot resolved to, once known. `null` while a scan is pending. */
  cartonId: number | null;
}

/**
 * Pre-resolve identity for a scanned value — the same normal form the rail's
 * pending stub reconciles on, so the pane and the rail agree on what "this
 * scan" means.
 */
export function scanSlotKey(trackingNumber: string | null | undefined): string | null {
  const trimmed = (trackingNumber ?? '').trim();
  if (!trimmed) return null;
  const normalized = normalizeScanKey(trimmed);
  return normalized ? `scan:${normalized}` : null;
}

/** True for a real, openable carton id (stubs carry `null`). */
function cartonIdOf(row: WorkspacePaneRow): number | null {
  if (row.receiving_id == null) return null;
  const id = Number(row.receiving_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Advance the overlay slot for `row`, given the slot it currently holds.
 * Pass `null` for `prev` when the overlay is closed (a fresh open starts clean).
 */
export function resolveWorkspacePaneSlot(
  prev: WorkspacePaneSlot | null,
  row: WorkspacePaneRow,
): WorkspacePaneSlot {
  const scanKey = scanSlotKey(row.tracking_number);
  const cartonId = cartonIdOf(row);

  // Still resolving — identity is the scanned value itself.
  if (cartonId == null) {
    return { key: scanKey ?? `line:${row.id}`, cartonId: null };
  }

  // The pending scan slot adopts the carton it just resolved into: same
  // physical box, so the pane upgrades in place. Guarded on `cartonId` so two
  // cartons that happen to share a tracking number still crossfade against
  // each other (nothing enforces one carton per tracking at the DB level).
  if (
    prev != null &&
    scanKey != null &&
    prev.key === scanKey &&
    (prev.cartonId == null || prev.cartonId === cartonId)
  ) {
    return { key: prev.key, cartonId };
  }

  return { key: `carton:${cartonId}`, cartonId };
}
