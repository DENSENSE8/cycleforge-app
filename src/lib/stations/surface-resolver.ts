/**
 * Surface → the org's active `station_definitions` row.
 *
 * Loads the tenant's published row for a surface so event writers can stamp the
 * customizable "where" axis (`ops_events.workflow_node_id`). Deps-injectable so
 * unit tests run DB-free.
 *
 * The legacy-vs-composed render decision this module used to own was deleted
 * on 2026-08-22 with the composition renderer — every surface renders its own
 * component tree now, and a tile layout is not expressible as slots.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import type { StationConfig, StationDefinitionRow } from './contract';
import type { ArchetypeId } from './archetype';
import { getSurface, type SurfaceDefinition, type SurfaceKey } from './surface-keys';

/** How a surface should be rendered for this org, right now. */
export interface ResolvedSurface {
  key: SurfaceKey;
  surface: SurfaceDefinition;
  archetype: ArchetypeId;
  /** The org's active `station_definitions` row, when one exists (else null). */
  definition: StationDefinitionRow | null;
}

/** Injectable collaborators (real impls by default; fakes in tests). */
export interface ResolveSurfaceDeps {
  /**
   * Load the active `station_definitions` row for (orgId, pageKey, modeKey), or
   * null when none is published. Defaults to a tenant-scoped SELECT.
   */
  loadActiveDefinition: (
    orgId: OrgId,
    pageKey: string,
    modeKey: string,
  ) => Promise<StationDefinitionRow | null>;
}

interface DefinitionDbRow {
  id: number;
  page_key: string;
  mode_key: string;
  label: string;
  workflow_node_id: string | null;
  config: StationConfig;
  version: number;
  is_active: boolean;
  updated_by: number | null;
  updated_at: string;
}

function toDefinitionRow(row: DefinitionDbRow): StationDefinitionRow {
  return {
    id: row.id,
    pageKey: row.page_key,
    modeKey: row.mode_key,
    label: row.label,
    workflowNodeId: row.workflow_node_id,
    config: row.config,
    version: row.version,
    isActive: row.is_active,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

const defaultDeps: ResolveSurfaceDeps = {
  loadActiveDefinition: async (orgId, pageKey, modeKey) => {
    // Deferred import so the DB-free unit path (fakes) never pulls a live
    // handle at module load — same guard as studio/definitions.ts.
    const { tenantQuery } = await import('@/lib/tenancy/db');
    const { rows } = await tenantQuery<DefinitionDbRow>(
      orgId,
      `SELECT id, page_key, mode_key, label, workflow_node_id, config,
              version, is_active, updated_by, updated_at::text
         FROM station_definitions
        WHERE organization_id = $1 AND page_key = $2 AND mode_key = $3 AND is_active = TRUE
        ORDER BY version DESC
        LIMIT 1`,
      [orgId, pageKey, modeKey],
    );
    return rows[0] ? toDefinitionRow(rows[0]) : null;
  },
};

/**
 * Resolve `key` for `orgId`, carrying the org's active `station_definitions`
 * row when one is published (else `null`). The only field live code reads off
 * it is `workflowNodeId` — see `surface-workflow-node.ts`.
 */
export async function resolveSurface(
  key: SurfaceKey,
  orgId: OrgId,
  deps: ResolveSurfaceDeps = defaultDeps,
): Promise<ResolvedSurface> {
  const surface = getSurface(key);
  const activeRow = await deps.loadActiveDefinition(orgId, surface.pageKey, surface.modeKey);
  return { key: surface.key, surface, archetype: surface.archetype, definition: activeRow };
}
