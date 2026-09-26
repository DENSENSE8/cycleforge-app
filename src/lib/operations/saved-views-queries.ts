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

/** Operations ▸ History saved views — thin wrappers over the polymorphic `saved_views` table with `surface = 'operations'`. */

type OperationsSavedView = SavedViewRow;

const SURFACE = 'operations' as const;

/** Views visible to a staffer: their own + any org-shared views. */
export async function listOperationsSavedViews(
  orgId: OrgId,
  staffId: number,
): Promise<OperationsSavedView[]> {
  return listSavedViews(orgId, staffId, SURFACE);
}

export async function getOperationsSavedView(
  id: number,
  orgId: OrgId,
): Promise<OperationsSavedView | null> {
  return getSavedView(id, orgId, SURFACE);
}

export async function createOperationsSavedView(
  input: { name: string; filters: Record<string, unknown>; isShared?: boolean; sortOrder?: number },
  orgId: OrgId,
  staffId: number,
): Promise<OperationsSavedView> {
  return createSavedView({ ...input, surface: SURFACE }, orgId, staffId);
}

/** Ownership-scoped update — only the creating staffer can edit. */
export async function updateOperationsSavedView(
  id: number,
  orgId: OrgId,
  staffId: number,
  patch: {
    name?: string;
    filters?: Record<string, unknown>;
    isShared?: boolean;
    sortOrder?: number;
  },
): Promise<OperationsSavedView | null> {
  return updateSavedView(id, orgId, staffId, patch, SURFACE);
}

/** Ownership-scoped hard delete (these are disposable presets, no audit trail to keep). */
export async function deleteOperationsSavedView(
  id: number,
  orgId: OrgId,
  staffId: number,
): Promise<boolean> {
  return deleteSavedView(id, orgId, staffId, SURFACE);
}
