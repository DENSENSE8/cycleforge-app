/**
 * Putaway targets — directed putaway by receipt type (D365 location
 * directives keyed by work-order type; SAP putaway strategies): one rule per
 * (org, receipt type) → one rack or shelf. The rule is an attribute ON the
 * location row (`locations.putaway_intake_kind`, partial UNIQUE per org), the
 * same shape as `locations.arrival_priority_tier` — no rules table.
 *
 * Fails soft before 2026-10-07_locations_putaway_intake_kind.sql applies:
 * reads return every kind unlinked; writes return `not_ready`.
 */

import 'server-only';

import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordOpsEvent, type RecordOpsEventInput } from '@/lib/ops-events';
import {
  pickScannedLocation,
  readLocationCandidates,
  type LocationCandidate,
} from '@/lib/receiving/arrival-package';
import {
  PUTAWAY_INTAKE_KINDS,
  emptyPutawayTargets,
  type PutawayIntakeKind,
  type PutawayTarget,
  type PutawayTargets,
} from '@/lib/receiving/putaway-targets-contract';

export const PUTAWAY_KIND_LINKED_EVENT = 'putaway_kind_linked';
export const PUTAWAY_KIND_UNLINKED_EVENT = 'putaway_kind_unlinked';

const NOT_READY_ERROR =
  'Rack linking is not set up yet — apply 2026-10-07_locations_putaway_intake_kind.sql';

/** Postgres undefined_column — the migration has not applied yet. */
function isUndefinedColumn(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '42703';
}

function isIntakeKind(v: unknown): v is PutawayIntakeKind {
  return typeof v === 'string' && (PUTAWAY_INTAKE_KINDS as readonly string[]).includes(v);
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

/** Operator-facing code + face of a `locations` row (aliased `l`). */
const TARGET_COLUMNS_SQL = `l.id,
       COALESCE(NULLIF(BTRIM(l.barcode), ''), l.name) AS code,
       COALESCE(NULLIF(BTRIM(l.display_name), ''), l.name) AS face`;

interface TargetRow {
  kind: string;
  id: number | string;
  code: string;
  face: string;
}

/** Which active location holds each kind. Inactive holders are not targets. */
async function queryTargetRows(orgId: OrgId): Promise<TargetRow[]> {
  const { rows } = await tenantQuery<TargetRow>(
    orgId,
    `SELECT l.putaway_intake_kind AS kind, ${TARGET_COLUMNS_SQL}
       FROM locations l
      WHERE l.organization_id = $1
        AND l.is_active = true
        AND l.putaway_intake_kind IS NOT NULL
      ORDER BY l.id`,
    [orgId],
  );
  return rows;
}

interface HolderRow {
  id: number | string;
  code: string;
  face: string;
  putaway_intake_kind: string | null;
}

/** Lock the current holder of `kind` and (when given) the location about to take it. */
async function lockHolders(
  client: TxClient,
  orgId: OrgId,
  kind: PutawayIntakeKind,
  locationId: number | null,
): Promise<HolderRow[]> {
  const { rows } = await client.query<HolderRow>(
    `SELECT ${TARGET_COLUMNS_SQL}, l.putaway_intake_kind
       FROM locations l
      WHERE l.organization_id = $1
        AND (l.putaway_intake_kind = $2 OR l.id = $3::int)
      ORDER BY l.id
      FOR UPDATE`,
    [orgId, kind, locationId],
  );
  return rows;
}

const CLEAR_KIND_SQL = `UPDATE locations
    SET putaway_intake_kind = NULL, updated_at = NOW()
  WHERE organization_id = $1 AND putaway_intake_kind = $2`;

const SET_KIND_SQL = `UPDATE locations
    SET putaway_intake_kind = $2, updated_at = NOW()
  WHERE organization_id = $1 AND id = $3`;

function toTarget(row: Pick<HolderRow, 'id' | 'code' | 'face'>): PutawayTarget {
  return { locationId: Number(row.id), code: row.code, face: row.face };
}

// ─── Deps ────────────────────────────────────────────────────────────────────

type TxClient = Pick<PoolClient, 'query'>;

/** Injectable collaborators (house Deps pattern) — tests run with zero DB. */
export interface PutawayTargetsDeps {
  queryTargetRows: (orgId: OrgId) => Promise<TargetRow[]>;
  readLocationCandidates: (orgId: OrgId, scanned: string) => Promise<LocationCandidate[]>;
  transact: <T>(orgId: OrgId, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  /** Writes on the transaction's client so the event commits with the link. */
  recordEvent: (client: TxClient, input: RecordOpsEventInput) => Promise<number | null>;
}

const defaultDeps: PutawayTargetsDeps = {
  queryTargetRows,
  readLocationCandidates,
  transact: (orgId, fn) => withTenantTransaction(orgId, fn),
  recordEvent: (client, input) =>
    recordOpsEvent(input, { query: (text, params) => client.query(text, params) }),
};

// ─── Read ────────────────────────────────────────────────────────────────────

/** Every kind's target; all null until the migration applies. */
export async function readPutawayTargets(
  orgId: OrgId,
  deps: PutawayTargetsDeps = defaultDeps,
): Promise<PutawayTargets> {
  const targets = emptyPutawayTargets();
  let rows: TargetRow[];
  try {
    rows = await deps.queryTargetRows(orgId);
  } catch (err) {
    if (isUndefinedColumn(err)) return targets;
    throw err;
  }
  for (const row of rows) {
    if (isIntakeKind(row.kind) && targets[row.kind] === null) targets[row.kind] = toTarget(row);
  }
  return targets;
}

// ─── Link ────────────────────────────────────────────────────────────────────

export interface LinkPutawayTargetInput {
  kind: PutawayIntakeKind;
  /** The raw scan (or typed code) of the rack / shelf label. */
  scanned: string;
  staffId: number | null;
  clientEventId: string;
}

export type LinkPutawayTargetResult =
  | {
      kind: 'linked';
      targets: PutawayTargets;
      changed: boolean;
      previous: PutawayTarget | null;
      /** The kind the picked location held before (one location carries one kind). */
      displacedKind: PutawayIntakeKind | null;
    }
  | { kind: 'unknown_location'; error: string }
  | { kind: 'inactive_location'; error: string }
  | { kind: 'not_ready'; error: string };

/** Make the scanned active location the one target for `kind` (moves it off its current holder). */
export async function linkPutawayTarget(
  orgId: OrgId,
  input: LinkPutawayTargetInput,
  deps: PutawayTargetsDeps = defaultDeps,
): Promise<LinkPutawayTargetResult> {
  const label = input.scanned.trim();
  const picked = pickScannedLocation(label, await deps.readLocationCandidates(orgId, label));
  if (picked.kind === 'unknown') {
    return { kind: 'unknown_location', error: `No location has the label ${label}` };
  }
  if (picked.kind === 'inactive') {
    return { kind: 'inactive_location', error: `${picked.location.face} is not an active location` };
  }
  const loc = picked.location;

  let outcome: { changed: boolean; previous: PutawayTarget | null; displacedKind: PutawayIntakeKind | null };
  try {
    outcome = await deps.transact(orgId, async (client) => {
      const rows = await lockHolders(client, orgId, input.kind, loc.id);
      const holder = rows.find((r) => r.putaway_intake_kind === input.kind) ?? null;
      const previous = holder ? toTarget(holder) : null;
      if (previous?.locationId === loc.id) return { changed: false, previous, displacedKind: null };

      const own = rows.find((r) => Number(r.id) === loc.id);
      const displacedKind = isIntakeKind(own?.putaway_intake_kind) ? own.putaway_intake_kind : null;

      if (holder) await client.query(CLEAR_KIND_SQL, [orgId, input.kind]);
      await client.query(SET_KIND_SQL, [orgId, input.kind, loc.id]);
      await deps.recordEvent(client, {
        organizationId: orgId,
        entityType: 'location',
        entityId: loc.id,
        eventType: PUTAWAY_KIND_LINKED_EVENT,
        actorStaffId: input.staffId,
        clientEventId: `putaway-kind:${input.clientEventId.trim()}`,
        payload: {
          kind: input.kind,
          locationId: loc.id,
          code: loc.barcode,
          previousLocationId: previous?.locationId ?? null,
          displacedKind,
        },
      });
      return { changed: true, previous, displacedKind };
    });
  } catch (err) {
    if (isUndefinedColumn(err)) return { kind: 'not_ready', error: NOT_READY_ERROR };
    throw err;
  }

  return { kind: 'linked', targets: await readPutawayTargets(orgId, deps), ...outcome };
}

// ─── Unlink ──────────────────────────────────────────────────────────────────

export interface UnlinkPutawayTargetInput {
  kind: PutawayIntakeKind;
  staffId: number | null;
  clientEventId: string;
}

export type UnlinkPutawayTargetResult =
  | { kind: 'unlinked'; targets: PutawayTargets; previous: PutawayTarget | null }
  | { kind: 'not_ready'; error: string };

/** Clear `kind` from whichever location holds it (no-op when none does). */
export async function unlinkPutawayTarget(
  orgId: OrgId,
  input: UnlinkPutawayTargetInput,
  deps: PutawayTargetsDeps = defaultDeps,
): Promise<UnlinkPutawayTargetResult> {
  let previous: PutawayTarget | null;
  try {
    previous = await deps.transact(orgId, async (client) => {
      const rows = await lockHolders(client, orgId, input.kind, null);
      const holder = rows.find((r) => r.putaway_intake_kind === input.kind);
      if (!holder) return null;
      const target = toTarget(holder);
      await client.query(CLEAR_KIND_SQL, [orgId, input.kind]);
      await deps.recordEvent(client, {
        organizationId: orgId,
        entityType: 'location',
        entityId: target.locationId,
        eventType: PUTAWAY_KIND_UNLINKED_EVENT,
        actorStaffId: input.staffId,
        clientEventId: `putaway-kind:${input.clientEventId.trim()}`,
        payload: { kind: input.kind, locationId: target.locationId, code: target.code },
      });
      return target;
    });
  } catch (err) {
    if (isUndefinedColumn(err)) return { kind: 'not_ready', error: NOT_READY_ERROR };
    throw err;
  }

  return { kind: 'unlinked', targets: await readPutawayTargets(orgId, deps), previous };
}
