import 'server-only';

import type { OrgId } from '@/lib/tenancy/constants';
import {
  createSavedView,
  deleteSavedView,
  getSavedView,
  listSavedViews,
  updateSavedView,
  type SavedViewRow,
} from '@/lib/saved-views/saved-views-queries';

/**
 * Media Library saved views — thin wrappers over the polymorphic
 * `saved_views` table with `surface = 'media_library'`. Preserves the
 * historical function names so `/api/photos/saved-views` and
 * `useMediaLibrarySavedViews` stay unchanged.
 */

export type MediaSavedView = SavedViewRow;

const SURFACE = 'media_library' as const;

/** Views visible to a staffer: their own + any org-shared views. */
export async function listMediaSavedViews(
  orgId: OrgId,
  staffId: number,
): Promise<MediaSavedView[]> {
  return listSavedViews(orgId, staffId, SURFACE);
}

export async function getMediaSavedView(
  id: number,
  orgId: OrgId,
): Promise<MediaSavedView | null> {
  return getSavedView(id, orgId, SURFACE);
}

export async function createMediaSavedView(
  input: { name: string; filters: Record<string, unknown>; isShared?: boolean; sortOrder?: number },
  orgId: OrgId,
  staffId: number,
): Promise<MediaSavedView> {
  return createSavedView({ ...input, surface: SURFACE }, orgId, staffId);
}

/** Ownership-scoped update — only the creating staffer can edit. */
export async function updateMediaSavedView(
  id: number,
  orgId: OrgId,
  staffId: number,
  patch: {
    name?: string;
    filters?: Record<string, unknown>;
    isShared?: boolean;
    sortOrder?: number;
  },
): Promise<MediaSavedView | null> {
  return updateSavedView(id, orgId, staffId, patch, SURFACE);
}

/** Ownership-scoped hard delete (disposable presets, no audit trail to keep). */
export async function deleteMediaSavedView(
  id: number,
  orgId: OrgId,
  staffId: number,
): Promise<boolean> {
  return deleteSavedView(id, orgId, staffId, SURFACE);
}
