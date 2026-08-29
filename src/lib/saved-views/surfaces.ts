/**
 * Saved-view surface SoT — discriminator values for the polymorphic
 * `saved_views` table and the storage-key → surface map used by `useSavedViews`.
 *
 * Keep `SAVED_VIEW_SURFACES` in lockstep with the **effective**
 * `saved_views_surface_chk` — the CHECK as redefined by the LAST-SORTING
 * migration that touches it (`2026-07-29g` birth, then any follow-up). A value
 * present in only one half is invisible until its first insert is rejected in
 * production; `surfaces.test.ts` resolves the effective CHECK off disk and
 * compares the sets.
 *
 * A follow-up migration must DROP and re-ADD the constraint with the FULL union,
 * never just the new value — that is the `reason_codes_flow_context_chk`
 * regression `.claude/rules/polymorphic-tables.md` records.
 */

import {
  PACKED_SAVED_VIEWS_KEY,
  SHIPPED_SAVED_VIEWS_KEY,
  UNSHIPPED_SAVED_VIEWS_KEY,
} from '@/components/unshipped/outbound-sidebar-shared';
import { SAVED_VIEW_STORAGE_KEY } from '@/lib/station/table-url-params';
import { MY_DAY_SAVED_VIEWS_KEY } from '@/lib/my-day/my-day-saved-views';

/** Full CHECK set — every row in `saved_views.surface`. */
export const SAVED_VIEW_SURFACES = [
  'operations',
  'media_library',
  'dashboard_unshipped',
  'dashboard_packed',
  'dashboard_shipped',
  'tech_history',
  'packer_history',
  'receiving_history',
  'receiving_incoming',
  'testing_history',
  // Home → Today (`/`). Added 2026-08-01 with the CHECK follow-up
  // `2026-08-01a_saved_views_home_today.sql`.
  'home_today',
  // ── Phase 4 rebuilds (2026-08-29) ─────────────────────────────────────────
  // The twelve surfaces `one-sheet-table-sot-PLAN` brought back onto the
  // binding waist. CHECK follow-up: `2026-08-29b_saved_views_rebuilt_surfaces.sql`.
  'products_catalog',
  'inventory_units',
  'warehouse_bins',
  'repair_queue',
  'warranty_claims',
  'tracking_exceptions',
  'outbound_ready',
  'outbound_labels',
  'outbound_staged',
  'pickup_queue',
  'unfound_queue',
  'tech_all',
] as const;

export type SavedViewSurface = (typeof SAVED_VIEW_SURFACES)[number];

/**
 * Surfaces served by the generic `/api/saved-views` routes.
 * Ops + media keep their dedicated routes (`/api/operations/saved-views`,
 * `/api/photos/saved-views`).
 */
export const GENERIC_SAVED_VIEW_SURFACES = [
  'dashboard_unshipped',
  'dashboard_packed',
  'dashboard_shipped',
  'tech_history',
  'packer_history',
  'receiving_history',
  'receiving_incoming',
  'testing_history',
  'home_today',
  // Every Phase-4 rebuild is served by the generic routes — none of them has a
  // reason to grow a dedicated one, and the two that exist (ops, media) are
  // being folded onto these.
  'products_catalog',
  'inventory_units',
  'warehouse_bins',
  'repair_queue',
  'warranty_claims',
  'tracking_exceptions',
  'outbound_ready',
  'outbound_labels',
  'outbound_staged',
  'pickup_queue',
  'unfound_queue',
  'tech_all',
] as const;

type GenericSavedViewSurface = (typeof GENERIC_SAVED_VIEW_SURFACES)[number];

/**
 * Storage keys for the surfaces rebuilt in Phase 4.
 *
 * Declared here rather than beside each surface: `useSavedViews` takes a storage
 * key and resolves it to a discriminator through the map below, so a key that
 * exists only at its call site is a key nothing can resolve — the symptom is a
 * Save button that silently does nothing, which is the same failure the CHECK
 * follow-up exists to prevent, one layer up.
 */
export const SHEET_SAVED_VIEW_KEY = {
  products_catalog: 'products_catalog_saved_views',
  inventory_units: 'inventory_units_saved_views',
  warehouse_bins: 'warehouse_bins_saved_views',
  repair_queue: 'repair_queue_saved_views',
  warranty_claims: 'warranty_claims_saved_views',
  tracking_exceptions: 'tracking_exceptions_saved_views',
  outbound_ready: 'outbound_ready_saved_views',
  outbound_labels: 'outbound_labels_saved_views',
  outbound_staged: 'outbound_staged_saved_views',
  pickup_queue: 'pickup_queue_saved_views',
  unfound_queue: 'unfound_queue_saved_views',
  tech_all: 'tech_all_saved_views',
} as const satisfies Record<string, string>;

/** Storage key → DB surface (the `useSavedViews` consumers). */
const STORAGE_KEY_TO_SURFACE: Readonly<Record<string, GenericSavedViewSurface>> = {
  [MY_DAY_SAVED_VIEWS_KEY]: 'home_today',
  [UNSHIPPED_SAVED_VIEWS_KEY]: 'dashboard_unshipped',
  [PACKED_SAVED_VIEWS_KEY]: 'dashboard_packed',
  [SHIPPED_SAVED_VIEWS_KEY]: 'dashboard_shipped',
  [SAVED_VIEW_STORAGE_KEY.tech_history]: 'tech_history',
  [SAVED_VIEW_STORAGE_KEY.packer_history]: 'packer_history',
  [SAVED_VIEW_STORAGE_KEY.receiving_history]: 'receiving_history',
  [SAVED_VIEW_STORAGE_KEY.receiving_incoming]: 'receiving_incoming',
  [SAVED_VIEW_STORAGE_KEY.testing_history]: 'testing_history',
  // Phase 4 rebuilds — one entry per key above, or the surface saves nothing.
  [SHEET_SAVED_VIEW_KEY.products_catalog]: 'products_catalog',
  [SHEET_SAVED_VIEW_KEY.inventory_units]: 'inventory_units',
  [SHEET_SAVED_VIEW_KEY.warehouse_bins]: 'warehouse_bins',
  [SHEET_SAVED_VIEW_KEY.repair_queue]: 'repair_queue',
  [SHEET_SAVED_VIEW_KEY.warranty_claims]: 'warranty_claims',
  [SHEET_SAVED_VIEW_KEY.tracking_exceptions]: 'tracking_exceptions',
  [SHEET_SAVED_VIEW_KEY.outbound_ready]: 'outbound_ready',
  [SHEET_SAVED_VIEW_KEY.outbound_labels]: 'outbound_labels',
  [SHEET_SAVED_VIEW_KEY.outbound_staged]: 'outbound_staged',
  [SHEET_SAVED_VIEW_KEY.pickup_queue]: 'pickup_queue',
  [SHEET_SAVED_VIEW_KEY.unfound_queue]: 'unfound_queue',
  [SHEET_SAVED_VIEW_KEY.tech_all]: 'tech_all',
};

const SURFACE_SET = new Set<string>(SAVED_VIEW_SURFACES);
const GENERIC_SET = new Set<string>(GENERIC_SAVED_VIEW_SURFACES);

export function isSavedViewSurface(value: string): value is SavedViewSurface {
  return SURFACE_SET.has(value);
}

export function isGenericSavedViewSurface(value: string): value is GenericSavedViewSurface {
  return GENERIC_SET.has(value);
}

/** Resolve a former localStorage key to a generic API surface, or null. */
export function surfaceFromStorageKey(storageKey: string): GenericSavedViewSurface | null {
  return STORAGE_KEY_TO_SURFACE[storageKey] ?? null;
}
