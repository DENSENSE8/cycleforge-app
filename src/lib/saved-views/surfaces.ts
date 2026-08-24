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
} from '@/lib/outbound/unshipped-sidebar-shared';
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
] as const;

type GenericSavedViewSurface = (typeof GENERIC_SAVED_VIEW_SURFACES)[number];

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
