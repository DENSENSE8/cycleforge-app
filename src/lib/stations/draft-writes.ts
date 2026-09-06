/**
 * Station draft writes for the assistant chokepoint — the two mutation kinds
 * that let the AI compose a station WITHOUT bypassing the trust model:
 *
 *   station_definition.save_draft    — upsert a draft for (pageKey, modeKey)
 *   station_definition.discard_draft — delete a non-active row by id
 *
 * Both are `draft_scoped` (`src/lib/surfaces/registry.ts`): the draft is the
 * safety layer, publish stays the human gate, exactly as `workflow_draft.*`.
 * Each write states its inverse so the edits tray can revert it:
 *   save over a prior draft  → save the prior draft back
 *   save with no prior draft → discard the row it created
 *   discard                  → save the discarded content back
 *
 * Same Deps shape as `draft-graph-writes.ts`: a client with `query`, no
 * transaction management (the chokepoint owns the tenant transaction).
 */

import { StationDraftSaveBody } from '@/lib/schemas/stations';
import type { StationConfig } from './contract';
import { validateStationConfig } from './validate';
import {
  findCurrentDraft,
  findStationDefinition,
  upsertStationDraft,
  type DraftStoreClient,
} from './draft-store';

export type StationDraftInverse = { kind: string; payload: Record<string, unknown> } | null;

export interface StationDraftWriteResult {
  ok: boolean;
  status?: 400 | 404 | 409;
  error?: string;
  inverse: StationDraftInverse;
  targetRef?: string;
}

const fail = (status: 400 | 404 | 409, error: string): StationDraftWriteResult => ({
  ok: false,
  status,
  error,
  inverse: null,
});

export async function draftSaveStation(
  client: DraftStoreClient,
  orgId: string,
  payload: Record<string, unknown>,
  actorStaffId: number | null,
): Promise<StationDraftWriteResult> {
  const parsed = StationDraftSaveBody.safeParse(payload);
  if (!parsed.success) {
    return fail(400, `invalid station draft: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  const config = parsed.data.config as StationConfig;
  const issues = validateStationConfig(config);
  if (issues.length > 0) {
    return fail(400, `station config rejected by the registry: ${issues.map((i) => i.message).join('; ')}`);
  }

  const { pageKey, modeKey, label } = parsed.data;
  const workflowNodeId = parsed.data.workflowNodeId ?? null;
  const prior = await findCurrentDraft(client, orgId, pageKey, modeKey);
  const row = await upsertStationDraft(client, orgId, {
    pageKey,
    modeKey,
    label,
    workflowNodeId,
    config,
    staffId: actorStaffId,
  });
  if (!row) return fail(409, 'draft upsert produced no row');

  const inverse: StationDraftInverse = prior
    ? {
        kind: 'station_definition.save_draft',
        payload: {
          pageKey,
          modeKey,
          label: prior.label,
          workflowNodeId: prior.workflow_node_id,
          config: prior.config,
        },
      }
    : { kind: 'station_definition.discard_draft', payload: { id: row.id } };

  return { ok: true, inverse, targetRef: String(row.id) };
}

export async function draftDiscardStation(
  client: DraftStoreClient,
  orgId: string,
  payload: Record<string, unknown>,
): Promise<StationDraftWriteResult> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return fail(400, 'id must be a positive integer');

  const row = await findStationDefinition(client, orgId, id);
  if (!row) return fail(404, `station definition ${id} not found`);
  if (row.is_active) return fail(409, 'the active version is read-only — publish a different version first');

  await client.query(
    `DELETE FROM station_definitions WHERE id = $1 AND organization_id = $2 AND NOT is_active`,
    [id, orgId],
  );

  return {
    ok: true,
    inverse: {
      kind: 'station_definition.save_draft',
      payload: {
        pageKey: row.page_key,
        modeKey: row.mode_key,
        label: row.label,
        workflowNodeId: row.workflow_node_id,
        config: row.config,
      },
    },
    targetRef: String(id),
  };
}
