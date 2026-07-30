import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { type SavedViewSurface } from '@/lib/saved-views/surfaces';

/**
 * Polymorphic saved views — one table (`saved_views`), discriminated by
 * `surface`. Personal presets owned by a staff member within an org
 * (optionally shared org-wide). Every query is org-scoped; mutations are
 * ownership-scoped (`staff_id = $me`). See `2026-07-29g_saved_views.sql`.
 */

export interface SavedViewRow {
  id: number;
  surface: SavedViewSurface;
  name: string;
  filters: Record<string, unknown>;
  is_shared: boolean;
  sort_order: number;
  staff_id: number;
  created_at: string;
  updated_at: string;
}

const COLS = `id, surface, name, filters, is_shared, sort_order, staff_id, created_at, updated_at`;

/** Views visible to a staffer on one surface: their own + any org-shared. */
export async function listSavedViews(
  orgId: OrgId,
  staffId: number,
  surface: SavedViewSurface,
): Promise<SavedViewRow[]> {
  const { rows } = await tenantQuery<SavedViewRow>(
    orgId,
    `SELECT ${COLS}
       FROM saved_views
      WHERE organization_id = $1
        AND surface = $2
        AND (staff_id = $3 OR is_shared = true)
      ORDER BY sort_order ASC, name ASC`,
    [orgId, surface, staffId],
  );
  return rows;
}

export async function getSavedView(
  id: number,
  orgId: OrgId,
  surface?: SavedViewSurface,
): Promise<SavedViewRow | null> {
  if (surface) {
    const { rows } = await tenantQuery<SavedViewRow>(
      orgId,
      `SELECT ${COLS} FROM saved_views
        WHERE id = $1 AND organization_id = $2 AND surface = $3`,
      [id, orgId, surface],
    );
    return rows[0] ?? null;
  }
  const { rows } = await tenantQuery<SavedViewRow>(
    orgId,
    `SELECT ${COLS} FROM saved_views WHERE id = $1 AND organization_id = $2`,
    [id, orgId],
  );
  return rows[0] ?? null;
}

export async function createSavedView(
  input: {
    surface: SavedViewSurface;
    name: string;
    filters: Record<string, unknown>;
    isShared?: boolean;
    sortOrder?: number;
  },
  orgId: OrgId,
  staffId: number,
): Promise<SavedViewRow> {
  const { rows } = await tenantQuery<SavedViewRow>(
    orgId,
    `INSERT INTO saved_views (organization_id, staff_id, surface, name, filters, is_shared, sort_order)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING ${COLS}`,
    [
      orgId,
      staffId,
      input.surface,
      input.name,
      JSON.stringify(input.filters ?? {}),
      input.isShared ?? false,
      input.sortOrder ?? 0,
    ],
  );
  return rows[0];
}

/** Ownership-scoped update — only the creating staffer can edit. */
export async function updateSavedView(
  id: number,
  orgId: OrgId,
  staffId: number,
  patch: {
    name?: string;
    filters?: Record<string, unknown>;
    isShared?: boolean;
    sortOrder?: number;
  },
  surface?: SavedViewSurface,
): Promise<SavedViewRow | null> {
  const { rows } = await tenantQuery<SavedViewRow>(
    orgId,
    `UPDATE saved_views
        SET name       = COALESCE($4, name),
            filters    = COALESCE($5::jsonb, filters),
            is_shared  = COALESCE($6, is_shared),
            sort_order = COALESCE($7, sort_order),
            updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND staff_id = $3
        ${surface ? 'AND surface = $8' : ''}
      RETURNING ${COLS}`,
    surface
      ? [
          id,
          orgId,
          staffId,
          patch.name ?? null,
          patch.filters ? JSON.stringify(patch.filters) : null,
          patch.isShared ?? null,
          patch.sortOrder ?? null,
          surface,
        ]
      : [
          id,
          orgId,
          staffId,
          patch.name ?? null,
          patch.filters ? JSON.stringify(patch.filters) : null,
          patch.isShared ?? null,
          patch.sortOrder ?? null,
        ],
  );
  return rows[0] ?? null;
}

/** Ownership-scoped hard delete (disposable presets, no audit trail to keep). */
export async function deleteSavedView(
  id: number,
  orgId: OrgId,
  staffId: number,
  surface?: SavedViewSurface,
): Promise<boolean> {
  const { rowCount } = await tenantQuery(
    orgId,
    surface
      ? `DELETE FROM saved_views
          WHERE id = $1 AND organization_id = $2 AND staff_id = $3 AND surface = $4`
      : `DELETE FROM saved_views
          WHERE id = $1 AND organization_id = $2 AND staff_id = $3`,
    surface ? [id, orgId, staffId, surface] : [id, orgId, staffId],
  );
  return (rowCount ?? 0) > 0;
}
