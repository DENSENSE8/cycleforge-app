/**
 * Station draft store — the ONE upsert every writer of `station_definitions`
 * drafts goes through: the page-bound `/api/stations` route, restore,
 * cherry-pick, and the assistant's `station_definition.save_draft` mutation.
 *
 * Semantics (unchanged from the route that used to inline this SQL): update
 * the existing newer-than-active draft in place, or insert a new version row
 * (`is_active = FALSE`). Retries land on the same draft row — the upsert IS
 * the idempotency story. Publishing is a separate, explicit step; the active
 * version is never mutated here.
 */

import type { StationConfig, StationDefinitionRow } from './contract';

/**
 * The minimal client every writer shares — a `pg` PoolClient satisfies it, and
 * so does the assistant chokepoint's transaction client (`FeedWriteClient` /
 * `DraftGraphClient` declare the identical shape), so no caller casts.
 */
export interface DraftStoreClient {
  query(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

export interface StationDefinitionDbRow {
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

export interface StationDraftInput {
  pageKey: string;
  modeKey: string;
  label: string;
  workflowNodeId: string | null;
  config: StationConfig;
  staffId: number | null;
}

/** The column list every station_definitions read shares (updated_at as text). */
export const STATION_DEFINITION_COLUMNS =
  'id, page_key, mode_key, label, workflow_node_id, config, version, is_active, updated_by, updated_at::text';

/** Narrow a raw row to the definition shape, field by field — no cast. */
function rowToDefinition(row: Record<string, unknown> | undefined): StationDefinitionDbRow | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    page_key: String(row.page_key),
    mode_key: String(row.mode_key),
    label: String(row.label),
    workflow_node_id: row.workflow_node_id == null ? null : String(row.workflow_node_id),
    config: (row.config ?? { slots: 'legacy' }) as StationConfig,
    version: Number(row.version),
    is_active: row.is_active === true,
    updated_by: row.updated_by == null ? null : Number(row.updated_by),
    updated_at: String(row.updated_at),
  };
}

export function toStationApi(row: StationDefinitionDbRow): StationDefinitionRow {
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

/**
 * The current draft for (page, mode): the newest non-active row strictly newer
 * than the active version (or any non-active row when nothing is published).
 * Null when there is none. This is the row the upsert would update in place.
 */
export async function findCurrentDraft(
  client: DraftStoreClient,
  orgId: string,
  pageKey: string,
  modeKey: string,
): Promise<StationDefinitionDbRow | null> {
  const { rows } = await client.query(
    `SELECT ${STATION_DEFINITION_COLUMNS}
       FROM station_definitions sd
      WHERE sd.organization_id = $1 AND sd.page_key = $2 AND sd.mode_key = $3
        AND NOT sd.is_active
        AND sd.version > (
          SELECT COALESCE(MAX(version), 0) FROM station_definitions
           WHERE organization_id = $1 AND page_key = $2 AND mode_key = $3 AND is_active
        )
      ORDER BY sd.version DESC
      LIMIT 1`,
    [orgId, pageKey, modeKey],
  );
  return rowToDefinition(rows[0]);
}

/**
 * Upsert a draft. One statement, atomic. Returns the draft row, or null when
 * the statement produced nothing (a race the caller reports as 500).
 */
export async function upsertStationDraft(
  client: DraftStoreClient,
  orgId: string,
  input: StationDraftInput,
): Promise<StationDefinitionDbRow | null> {
  const { rows } = await client.query(
    `WITH active AS (
       SELECT COALESCE(MAX(version), 0) AS v
         FROM station_definitions
        WHERE organization_id = $1 AND page_key = $2 AND mode_key = $3 AND is_active
     ),
     existing_draft AS (
       SELECT sd.id
         FROM station_definitions sd, active
        WHERE sd.organization_id = $1 AND sd.page_key = $2 AND sd.mode_key = $3
          AND NOT sd.is_active AND sd.version > active.v
        ORDER BY sd.version DESC
        LIMIT 1
     ),
     updated AS (
       UPDATE station_definitions sd
          SET label = $4, workflow_node_id = $5, config = $6::jsonb,
              updated_by = $7, updated_at = NOW()
         FROM existing_draft d
        WHERE sd.id = d.id
        RETURNING sd.*
     ),
     inserted AS (
       INSERT INTO station_definitions
              (organization_id, page_key, mode_key, label, workflow_node_id,
               config, version, is_active, updated_by)
       SELECT $1, $2, $3, $4, $5, $6::jsonb,
              (SELECT COALESCE(MAX(version), 0) + 1 FROM station_definitions
                WHERE organization_id = $1 AND page_key = $2 AND mode_key = $3),
              FALSE, $7
        WHERE NOT EXISTS (SELECT 1 FROM existing_draft)
       RETURNING *
     )
     SELECT ${STATION_DEFINITION_COLUMNS}
       FROM updated
     UNION ALL
     SELECT ${STATION_DEFINITION_COLUMNS}
       FROM inserted`,
    [
      orgId,
      input.pageKey,
      input.modeKey,
      input.label,
      input.workflowNodeId,
      JSON.stringify(input.config),
      input.staffId,
    ],
  );
  return rowToDefinition(rows[0]);
}

/** One station_definitions row by id, org-scoped. */
export async function findStationDefinition(
  client: DraftStoreClient,
  orgId: string,
  id: number,
): Promise<StationDefinitionDbRow | null> {
  const { rows } = await client.query(
    `SELECT ${STATION_DEFINITION_COLUMNS}
       FROM station_definitions
      WHERE id = $1 AND organization_id = $2`,
    [id, orgId],
  );
  return rowToDefinition(rows[0]);
}
