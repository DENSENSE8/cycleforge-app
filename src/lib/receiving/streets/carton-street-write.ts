/**
 * Carton street writers — the single write path for the two carton-grain 1:1
 * street tables (receiving_triage / receiving_unbox).
 *
 * Wave-3 writer inversion (receiving spine refactor): the moved carton columns
 * (received_at/by → rt.door_received_at/by, staging/lane/pairing/triage_* → rt.*,
 * unbox_opened_* / unboxed_* / unbox_only_intake → ru.*) are written HERE,
 * directly, instead of on the receiving_carton spine. The old dual-write
 * triggers only fire on spine writes, so once callers route through this module
 * they are inert (dropped by the post-fleet migration).
 *
 * Semantics (mirroring the pre-inversion writer SQL):
 *   - COALESCE-once fields (first stamp wins, never re-stamped):
 *     doorReceivedAt/doorReceivedBy, openedAt/openedBy, unboxedAt/unboxedBy —
 *     `SET col = COALESCE(<table>.col, EXCLUDED.col)`.
 *   - Overwrite fields (picker-editable; a present key overwrites, incl. null):
 *     stagingLocationId, priorityLane, pairingState, triageComplete,
 *     triageCompletedAt, triageCompletedBy, triageClientEventId,
 *     contentsConfirmedAt, contentsConfirmedBy.
 *
 *     The split is "can this un-happen?", not "is it a timestamp". A door scan
 *     and an unboxing are events in the world and never un-happen, so they are
 *     COALESCE-once. A triage completion and a contents confirmation are
 *     ASSERTIONS the operator can retract by reopening the carton, so they must
 *     be clearable — a stamp that cannot be cleared makes the "open again to
 *     edit" affordance a lie.
 *   - `undefined` (key omitted) = leave the column untouched — the SET list is
 *     built from provided keys only, so an upsert never clobbers a sibling
 *     street's fields.
 *   - `'now'` = SQL NOW() (transaction time), not a JS wall-clock read.
 *   - deriveIntakePath: computes receiving_unbox.intake_path server-side in the
 *     same statement: keep the existing value when it is already resolved
 *     ('unbox_only' | 'triage_first'); otherwise 'unbox_only' when the carton
 *     has no receiving_triage.door_received_at, else 'triage_first'.
 *   - Every upsert bumps updated_at = now(); organization_id is passed
 *     explicitly (never left to the GUC default).
 *
 * One statement per upsert (INSERT … ON CONFLICT (receiving_id) DO UPDATE), so
 * callers outside a transaction (raw-pool scan writers) stay atomic. The PK is
 * receiving_id alone (1:1 with the carton; receiving.id is globally unique, so
 * the conflicting row is always this carton in this org) — RLS on the tenant
 * pool backstops the org scoping.
 *
 * Deps-light by design: the client (pool, PoolClient, or a tx-bound fake) is the
 * first argument, so unit tests run DB-free.
 */

import type { PoolClient } from 'pg';

export interface CartonTriagePatch {
  doorReceivedAt?: string | Date | null;
  doorReceivedBy?: number | null;
  stagingLocationId?: number | null;
  priorityLane?: string | null;
  pairingState?: string | null;
  /**
   * Never downgrade a real PO match.
   *
   * `pairingState` normally OVERWRITES (the pairing hub can change or clear an
   * operator's answer). A background writer that only knows "this scan found
   * nothing to pair to" must not use that door: on a carton already `MATCHED`
   * to a PO, an unmatched *return* serial logged onto one of its lines would
   * silently un-match the whole carton. With this flag the SET keeps `MATCHED`
   * and applies the new value to every other state.
   */
  preserveMatchedPairing?: boolean;
  triageComplete?: boolean;
  triageCompletedAt?: string | Date | 'now' | null;
  triageCompletedBy?: number | null;
  triageClientEventId?: string | null;
}

export interface CartonUnboxPatch {
  openedAt?: string | Date | 'now' | null;
  openedBy?: number | null;
  unboxedAt?: string | Date | 'now' | null;
  unboxedBy?: number | null;
  /**
   * Operator confirmed the carton contents against the line list — the gate for
   * the Contents procedure step. OVERWRITE, not set-once: pass `null` to
   * retract it when the operator reopens the carton to edit.
   */
  contentsConfirmedAt?: string | Date | 'now' | null;
  contentsConfirmedBy?: number | null;
  deriveIntakePath?: boolean;
}

type StreetClient = Pick<PoolClient, 'query'>;

/** One column of the dynamic upsert: how it lands in VALUES and in the SET list. */
interface ColSpec {
  col: string;
  insertExpr: string;
  updateExpr: string;
}

function buildUpsertSql(table: 'receiving_triage' | 'receiving_unbox', specs: ColSpec[]): string {
  const insertCols = ['receiving_id', 'organization_id', ...specs.map((s) => s.col), 'updated_at'];
  const insertExprs = ['$1', '$2::uuid', ...specs.map((s) => s.insertExpr), 'NOW()'];
  const setClauses = [...specs.map((s) => `${s.col} = ${s.updateExpr}`), 'updated_at = NOW()'];
  return (
    `INSERT INTO ${table} (${insertCols.join(', ')})\n` +
    `VALUES (${insertExprs.join(', ')})\n` +
    `ON CONFLICT (receiving_id) DO UPDATE SET ${setClauses.join(', ')}`
  );
}

/**
 * Upsert the carton's TRIAGE street row. Door stamps are COALESCE-once (a
 * re-scan never re-stamps the door); staging/lane/pairing/triage_* overwrite
 * when present (the picker can change or clear them).
 */
export async function upsertReceivingTriage(
  client: StreetClient,
  orgId: string,
  receivingId: number,
  patch: CartonTriagePatch,
): Promise<void> {
  const params: unknown[] = [receivingId, orgId];
  const push = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };
  const ts = (v: string | Date | 'now' | null): string =>
    v === 'now' ? 'NOW()' : `${push(v)}::timestamptz`;
  const once = (col: string) => `COALESCE(receiving_triage.${col}, EXCLUDED.${col})`;

  const specs: ColSpec[] = [];
  if (patch.doorReceivedAt !== undefined) {
    specs.push({ col: 'door_received_at', insertExpr: ts(patch.doorReceivedAt), updateExpr: once('door_received_at') });
  }
  if (patch.doorReceivedBy !== undefined) {
    specs.push({ col: 'door_received_by', insertExpr: push(patch.doorReceivedBy), updateExpr: once('door_received_by') });
  }
  if (patch.stagingLocationId !== undefined) {
    specs.push({ col: 'staging_location_id', insertExpr: push(patch.stagingLocationId), updateExpr: 'EXCLUDED.staging_location_id' });
  }
  if (patch.priorityLane !== undefined) {
    specs.push({ col: 'priority_lane', insertExpr: push(patch.priorityLane), updateExpr: 'EXCLUDED.priority_lane' });
  }
  if (patch.pairingState !== undefined) {
    specs.push({
      col: 'pairing_state',
      insertExpr: push(patch.pairingState),
      updateExpr: patch.preserveMatchedPairing
        ? "CASE WHEN receiving_triage.pairing_state = 'MATCHED'" +
          ' THEN receiving_triage.pairing_state ELSE EXCLUDED.pairing_state END'
        : 'EXCLUDED.pairing_state',
    });
  }
  if (patch.triageComplete !== undefined) {
    specs.push({ col: 'triage_complete', insertExpr: push(patch.triageComplete), updateExpr: 'EXCLUDED.triage_complete' });
  }
  if (patch.triageCompletedAt !== undefined) {
    specs.push({ col: 'triage_completed_at', insertExpr: ts(patch.triageCompletedAt), updateExpr: 'EXCLUDED.triage_completed_at' });
  }
  if (patch.triageCompletedBy !== undefined) {
    specs.push({ col: 'triage_completed_by', insertExpr: push(patch.triageCompletedBy), updateExpr: 'EXCLUDED.triage_completed_by' });
  }
  if (patch.triageClientEventId !== undefined) {
    specs.push({ col: 'triage_client_event_id', insertExpr: push(patch.triageClientEventId), updateExpr: 'EXCLUDED.triage_client_event_id' });
  }

  await client.query(buildUpsertSql('receiving_triage', specs), params);
}

/**
 * Upsert the carton's UNBOX street row. Bench stamps (opened/unboxed) are
 * COALESCE-once. `deriveIntakePath: true` resolves intake_path in the same
 * statement: an already-resolved path is kept; an unresolved ('unknown' /
 * fresh) row derives from whether the triage street has a door stamp.
 */
export async function upsertReceivingUnbox(
  client: StreetClient,
  orgId: string,
  receivingId: number,
  patch: CartonUnboxPatch,
): Promise<void> {
  const params: unknown[] = [receivingId, orgId];
  const push = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };
  const ts = (v: string | Date | 'now' | null): string =>
    v === 'now' ? 'NOW()' : `${push(v)}::timestamptz`;
  const once = (col: string) => `COALESCE(receiving_unbox.${col}, EXCLUDED.${col})`;

  const specs: ColSpec[] = [];
  if (patch.openedAt !== undefined) {
    specs.push({ col: 'opened_at', insertExpr: ts(patch.openedAt), updateExpr: once('opened_at') });
  }
  if (patch.openedBy !== undefined) {
    specs.push({ col: 'opened_by', insertExpr: push(patch.openedBy), updateExpr: once('opened_by') });
  }
  if (patch.unboxedAt !== undefined) {
    specs.push({ col: 'unboxed_at', insertExpr: ts(patch.unboxedAt), updateExpr: once('unboxed_at') });
  }
  if (patch.unboxedBy !== undefined) {
    specs.push({ col: 'unboxed_by', insertExpr: push(patch.unboxedBy), updateExpr: once('unboxed_by') });
  }
  // OVERWRITE, not COALESCE-once — the same shape as `triage_completed_at`,
  // and for the same reason. `contents_confirmed_at` is the gate for a
  // procedure step the operator can REOPEN to edit, and a reopen writes NULL.
  // A COALESCE-once column can never be cleared, so it could report "contents
  // confirmed" for a carton the operator had explicitly re-opened — the
  // receipt's "open again to edit" bar would be a lie. The set-once milestones
  // above (opened / unboxed) genuinely never un-happen; this one does.
  if (patch.contentsConfirmedAt !== undefined) {
    specs.push({
      col: 'contents_confirmed_at',
      insertExpr: ts(patch.contentsConfirmedAt),
      updateExpr: 'EXCLUDED.contents_confirmed_at',
    });
  }
  if (patch.contentsConfirmedBy !== undefined) {
    specs.push({
      col: 'contents_confirmed_by',
      insertExpr: push(patch.contentsConfirmedBy),
      updateExpr: 'EXCLUDED.contents_confirmed_by',
    });
  }
  if (patch.deriveIntakePath) {
    // Scalar subquery in VALUES (allowed) computes the derived path once; the
    // conflict arm reuses it via EXCLUDED so the derivation stays single-source.
    const derive =
      `(CASE WHEN EXISTS (` +
      `SELECT 1 FROM receiving_triage rt ` +
      `WHERE rt.receiving_id = $1 AND rt.organization_id = $2::uuid ` +
      `AND rt.door_received_at IS NOT NULL` +
      `) THEN 'triage_first' ELSE 'unbox_only' END)`;
    specs.push({
      col: 'intake_path',
      insertExpr: derive,
      updateExpr:
        `CASE WHEN receiving_unbox.intake_path IN ('unbox_only', 'triage_first') ` +
        `THEN receiving_unbox.intake_path ELSE EXCLUDED.intake_path END`,
    });
  }

  await client.query(buildUpsertSql('receiving_unbox', specs), params);
}
