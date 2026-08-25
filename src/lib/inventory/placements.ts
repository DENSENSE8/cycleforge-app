/**
 * placements — the domain writer for the unit↔location spine.
 *
 * Table + rationale: src/lib/migrations/2026-08-24_unit_location_spine.sql.
 * Plan of record: docs/warehouse-os/00-endgame.md §2/§6 (D1) — "scan any QR and
 * the location is never wrong" is created here, one placement at a time.
 *
 * THE LAW (D10, operator ruling 2026-08-24): a location is a fact created by a
 * scan, and only a scan. Enforced twice on purpose — the DB CHECK
 * (`*_location_scan_source_chk`, scanner/camera only) is the backstop; this
 * module refuses BEFORE the transaction so the caller gets a domain error, not
 * a constraint violation. The AI has no path into this module: no
 * `mutation_kind` maps here, and reconciliation doubts are raised as queued
 * work orders elsewhere, never as writes.
 *
 * `serial_units.location_id` (the "where is it NOW" pointer) is maintained in
 * the SAME transaction as the placement fact — the pointer can never disagree
 * with the newest fact. The legacy `current_location` TEXT is not written:
 * it is the unverified pre-spine claim and retires at the contract step.
 *
 * Every function is org-scoped through `withTenantTransaction` (GUC + RLS) and
 * takes `orgId` as a required argument — from `ctx.organizationId` at the
 * route, never from a request body. Collaborators are injected (real impls by
 * default, lazily resolved) so the module is unit-testable with zero DB —
 * same shape as work-sessions.ts. See placements.test.ts.
 */

import { safeRandomUUID } from '@/lib/safe-uuid';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SessionAttribution } from '@/lib/sessions/attribution';
import { isAttributed } from '@/lib/sessions/attribution';
// Type-only: erased at compile time, so the DB-free test never loads the pool.
import type { RecordOpsEventInput } from '@/lib/ops-events';

/** Input-truth vocabulary: find-field-scan's sources + 'camera' (mobile put-away). */
export type UnitScanSource = 'scanner' | 'camera' | 'paste' | 'human';
/** The lawful subset for LOCATION evidence (D10). */
export type LocationScanSource = 'scanner' | 'camera';

const LOCATION_SCAN_SOURCES: readonly string[] = ['scanner', 'camera'];

/** A stamped read from the input truth layer: what arrived, and how. */
export interface ScanStamp {
  readonly value: string;
  readonly source: UnitScanSource;
}

/** Thrown when a location arrives typed or pasted — the D10 refusal, by name. */
export class LocationScanLawError extends Error {
  readonly source: string;
  constructor(source: string) {
    super(
      `A location is a fact created by a scan, and only a scan (00-endgame D10) — ` +
        `refusing location evidence with source '${source}'.`,
    );
    this.name = 'LocationScanLawError';
    this.source = source;
  }
}

/** Thrown when a scan resolves to nothing in this org. Callers map → 404. */
export class SpineResolutionError extends Error {
  readonly kind: 'unit' | 'location';
  readonly scanned: string;
  constructor(kind: 'unit' | 'location', scanned: string) {
    super(`No ${kind} in this organization matches the scanned value '${scanned}'.`);
    this.name = 'SpineResolutionError';
    this.kind = kind;
    this.scanned = scanned;
  }
}

/** The narrow slice of a pg client this module uses (fakes implement 3 lines). */
export interface PlacementQueryable {
  query: (
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

/** Injectable collaborators — real impls by default, fakes in tests. */
export interface PlacementDeps {
  withTenantTransaction: <T>(
    orgId: OrgId,
    fn: (db: PlacementQueryable) => Promise<T>,
  ) => Promise<T>;
  /** The chronology spine write (ops_events) — injected so tests capture it. */
  recordOpsEvent: (input: RecordOpsEventInput) => Promise<void>;
  /** Minted when the caller does not supply one (idempotency anchor). */
  newClientEventId: () => string;
}

export const defaultPlacementDeps: PlacementDeps = {
  // Resolved LAZILY — `@/lib/tenancy/db` and `@/lib/ops-events` both reach
  // `@/lib/db` (`import 'server-only'`); a static import would detonate in the
  // DB-free test before a fake is installed. Same pattern as work-sessions.ts.
  withTenantTransaction: async (orgId, fn) => {
    const { withTenantTransaction } = await import('@/lib/tenancy/db');
    return withTenantTransaction(orgId, fn);
  },
  recordOpsEvent: async (input) => {
    const { recordOpsEvent } = await import('@/lib/ops-events');
    return recordOpsEvent(input);
  },
  newClientEventId: () => safeRandomUUID(),
};

export interface RecordUnitPlacementInput {
  /** What identified the UNIT — any truth-layer source; serials get typed when labels die. */
  unitScan: ScanStamp;
  /** What identified the LOCATION — scanner/camera only, refused otherwise. */
  locationScan: ScanStamp;
  /** Staff who physically placed it. Null only for device principals (kiosk). */
  placedBy: number | null;
  /** Which work session this happened inside (NO_SESSION is a statement, not a default). */
  session: SessionAttribution;
  /** Mobile idempotency key; minted when absent. */
  clientEventId?: string;
}

export interface UnitPlacementResult {
  placementId: number | null;
  serialUnitId: number;
  locationId: number;
  previousLocationId: number | null;
  /** True when this clientEventId was already recorded — replay, nothing written. */
  alreadyRecorded: boolean;
}

interface UnitRow {
  id: number;
  location_id: number | null;
}

/**
 * Resolve the unit inside the transaction: unit_uid exact, else normalized
 * serial. The SQL twin of journey-helpers' normalizeSerial (upper, strip
 * non-alphanumerics) — in SQL so this module stays import-light.
 */
async function resolveUnit(db: PlacementQueryable, scanned: string): Promise<UnitRow> {
  const res = await db.query(
    `SELECT id, location_id FROM serial_units
      WHERE unit_uid = $1
         OR normalized_serial = upper(regexp_replace($1, '[^A-Za-z0-9]', '', 'g'))
      LIMIT 1`,
    [scanned],
  );
  const row = res.rows[0] as UnitRow | undefined;
  if (!row) throw new SpineResolutionError('unit', scanned);
  return row;
}

async function resolveLocation(db: PlacementQueryable, scanned: string): Promise<number> {
  const res = await db.query(
    `SELECT id FROM locations WHERE barcode = $1 AND is_active LIMIT 1`,
    [scanned],
  );
  const row = res.rows[0] as { id: number } | undefined;
  if (!row) throw new SpineResolutionError('location', scanned);
  return row.id;
}

/**
 * Record one physical put-away: the placement fact, the pointer update, and
 * the chronology event — the first two in one transaction, the event after it
 * commits (the spine is the truth; ops_events is reporting, and a failed
 * report must not roll back a landed placement).
 */
export async function recordUnitPlacement(
  orgId: OrgId,
  input: RecordUnitPlacementInput,
  deps: PlacementDeps = defaultPlacementDeps,
): Promise<UnitPlacementResult> {
  if (!LOCATION_SCAN_SOURCES.includes(input.locationScan.source)) {
    throw new LocationScanLawError(input.locationScan.source);
  }
  const clientEventId = input.clientEventId ?? deps.newClientEventId();

  const result = await deps.withTenantTransaction(orgId, async (db) => {
    const unit = await resolveUnit(db, input.unitScan.value);
    const locationId = await resolveLocation(db, input.locationScan.value);

    const inserted = await db.query(
      `INSERT INTO unit_placements (
         organization_id, serial_unit_id, location_id, previous_location_id,
         placed_by, unit_scan_source, location_scan_source,
         session_id, session_type, client_event_id
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (organization_id, client_event_id) WHERE client_event_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        orgId,
        unit.id,
        locationId,
        unit.location_id,
        input.placedBy,
        input.unitScan.source,
        input.locationScan.source,
        isAttributed(input.session) ? input.session.sessionId : null,
        isAttributed(input.session) ? input.session.sessionType : null,
        clientEventId,
      ],
    );
    const placementRow = inserted.rows[0] as { id: number } | undefined;
    if (!placementRow) {
      // Idempotent replay: the fact (and its pointer update) already landed.
      return {
        placementId: null,
        serialUnitId: unit.id,
        locationId,
        previousLocationId: unit.location_id,
        alreadyRecorded: true,
      } satisfies UnitPlacementResult;
    }

    await db.query(
      `UPDATE serial_units SET location_id = $2, updated_at = now() WHERE id = $1`,
      [unit.id, locationId],
    );

    return {
      placementId: placementRow.id,
      serialUnitId: unit.id,
      locationId,
      previousLocationId: unit.location_id,
      alreadyRecorded: false,
    } satisfies UnitPlacementResult;
  });

  if (!result.alreadyRecorded) {
    await deps.recordOpsEvent({
      organizationId: orgId,
      entityType: 'serial_unit',
      entityId: result.serialUnitId,
      eventType: 'unit.placed',
      actorStaffId: input.placedBy,
      clientEventId: `${clientEventId}:ops`,
      session: input.session,
      payload: {
        locationId: result.locationId,
        previousLocationId: result.previousLocationId,
        unitScanSource: input.unitScan.source,
        locationScanSource: input.locationScan.source,
      },
    });
  }
  return result;
}

export interface RecordPartPullInput {
  /** What identified the DONOR unit — any truth-layer source. */
  donorScan: ScanStamp;
  /** What identified the destination (parts) bin — scanner/camera only. */
  locationScan: ScanStamp;
  /** The org's own words for the part ("battery", "grille") — data, not code. */
  partLabel: string;
  partSku?: string | null;
  /** When the pulled part is re-registered as its own serial unit. */
  partSerialUnitId?: number | null;
  quantity?: number;
  pulledBy: number | null;
  session: SessionAttribution;
  clientEventId?: string;
}

export interface PartPullResult {
  partPullId: number | null;
  donorSerialUnitId: number;
  toLocationId: number;
  alreadyRecorded: boolean;
}

/** Record one disassembly fact: parts out of a donor unit, into a scanned bin. */
export async function recordPartPull(
  orgId: OrgId,
  input: RecordPartPullInput,
  deps: PlacementDeps = defaultPlacementDeps,
): Promise<PartPullResult> {
  if (!LOCATION_SCAN_SOURCES.includes(input.locationScan.source)) {
    throw new LocationScanLawError(input.locationScan.source);
  }
  const partLabel = input.partLabel.trim();
  if (!partLabel) throw new Error('partLabel is required — the pull must say what came out.');
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`quantity must be a positive integer, got ${quantity}.`);
  }
  const clientEventId = input.clientEventId ?? deps.newClientEventId();

  const result = await deps.withTenantTransaction(orgId, async (db) => {
    const donor = await resolveUnit(db, input.donorScan.value);
    const toLocationId = await resolveLocation(db, input.locationScan.value);

    const inserted = await db.query(
      `INSERT INTO part_pulls (
         organization_id, donor_serial_unit_id, part_label, part_sku,
         part_serial_unit_id, quantity, to_location_id, pulled_by,
         donor_scan_source, location_scan_source,
         session_id, session_type, client_event_id
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (organization_id, client_event_id) WHERE client_event_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        orgId,
        donor.id,
        partLabel,
        input.partSku ?? null,
        input.partSerialUnitId ?? null,
        quantity,
        toLocationId,
        input.pulledBy,
        input.donorScan.source,
        input.locationScan.source,
        isAttributed(input.session) ? input.session.sessionId : null,
        isAttributed(input.session) ? input.session.sessionType : null,
        clientEventId,
      ],
    );
    const row = inserted.rows[0] as { id: number } | undefined;
    return {
      partPullId: row?.id ?? null,
      donorSerialUnitId: donor.id,
      toLocationId,
      alreadyRecorded: !row,
    } satisfies PartPullResult;
  });

  if (!result.alreadyRecorded) {
    await deps.recordOpsEvent({
      organizationId: orgId,
      entityType: 'serial_unit',
      entityId: result.donorSerialUnitId,
      eventType: 'unit.part_pulled',
      actorStaffId: input.pulledBy,
      clientEventId: `${clientEventId}:ops`,
      session: input.session,
      payload: {
        partLabel,
        partSku: input.partSku ?? null,
        quantity,
        toLocationId: result.toLocationId,
        partSerialUnitId: input.partSerialUnitId ?? null,
      },
    });
  }
  return result;
}
