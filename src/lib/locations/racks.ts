/**
 * Movable racks — the domain half of `/api/racks/**`.
 *
 * A rack is a `locations` row (`location_kind = 'RACK'`) whose `parent_id` is
 * its current placement (a ROOM or a STAGING spot). Its shelves are SHELF rows
 * parented to the rack, optional positions are POSITION rows parented to a
 * shelf. Codes are permanent and never encode a room (`rack-code.ts`); the
 * room is derived by walking `parent_id` (`derived-room.ts`). Moving a rack is
 * one UPDATE of the rack row; shelves and stock (`bin_contents.location_id`)
 * follow untouched.
 *
 * Every write runs in ONE tenant transaction (`deps.withTx`) and records one
 * `ops_events` row (entity `location`) idempotent on the client's
 * `clientEventId`, so a warehouse-Wi-Fi retry is a no-op.
 *
 * IO lives behind `RackDb` (real impl: `racks-store.ts`) so this file
 * unit-tests DB-free.
 */

import { parseLocationCodeFlat, pad2, unwrapScannedLocation } from '@/lib/barcode-routing';
import { canonicalRackCode, parseRackCode, rackCode, rackName, type RackAddress } from '@/lib/locations/rack-code';
import { RACK_EVENT } from '@/lib/locations/rack-events';
import type { RecordOpsEventInput } from '@/lib/ops-events';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { createRackDb } from '@/lib/locations/racks-store';
import type {
  AdoptBayBody,
  AdoptBayPlan,
  AdoptBayPlanRow,
  AdoptBayResponse,
  CreateRackBody,
  CreateRackResponse,
  DeleteRackBody,
  DeleteRackResponse,
  EditRackShelvesBody,
  EditRackShelvesResponse,
  GetRackResponse,
  ListRacksResponse,
  MoveRackBody,
  MoveRackResponse,
  PlannedRack,
  RackDetail,
  RackErrorBody,
  RackLabelsPrintedBody,
  RackPlacementKind,
  RackPlacementRef,
  RackRoomRef,
  RackShelf,
} from '@/lib/locations/rack-types';
import { RACK_MAX_POSITIONS_PER_SHELF, RACK_MAX_SHELVES } from '@/lib/locations/rack-types';

// ─── Store contract ─────────────────────────────────────────────────────────

export interface LocationRow {
  id: number;
  barcode: string | null;
  name: string;
  displayName: string | null;
  kind: string;
  parentId: number | null;
  isActive: boolean;
  sortOrder: number;
  capacity: number | null;
}

export interface NewLocationRow {
  name: string;
  barcode: string;
  kind: 'RACK' | 'SHELF' | 'POSITION';
  parentId: number;
  sortOrder: number;
}

export interface LocationPatch {
  parentId?: number;
  kind?: string;
  barcode?: string;
  name?: string;
  displayName?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  /**
   * NULL the legacy `locations.room` text. Rack-family rows never carry it
   * (the room is derived up `parent_id`); an adopted bay row would otherwise
   * keep stale text once its rack moves.
   */
  clearLegacyRoom?: true;
}

export interface RackSummaryRow {
  id: number;
  barcode: string;
  name: string;
  createdAt: string;
  placement: { id: number; code: string | null; name: string; kind: string };
  room: RackRoomRef | null;
  lastEventAt: string | null;
}

/** An active SHELF (parent = rack) or POSITION (parent = shelf) of a rack. */
export interface RackChildRow extends LocationRow {
  rackId: number;
  /** Units on this row alone (sum of positive `bin_contents.qty`). */
  stockQty: number;
}

export interface RackListFilter {
  rackId?: number;
  placementId?: number;
  roomId?: number;
}

export interface StoredRackEvent {
  eventType: string;
  entityId: number;
  payload: Record<string, unknown>;
}

/** Every IO the rack verbs need, bound to one tenant transaction. All org-scoped. */
export interface RackDb {
  /** `pg_advisory_xact_lock` keyed by the org — serializes rack-number allocation. */
  lockRackNumbers(orgId: string): Promise<void>;
  /** Every `RK…` barcode in the org, any kind, active or not. */
  rackFamilyBarcodes(orgId: string): Promise<string[]>;
  findLocation(
    orgId: string,
    ref: { code: string } | { id: number },
    opts?: { includeInactive?: boolean },
  ): Promise<LocationRow | null>;
  childrenOf(orgId: string, parentIds: number[], opts?: { includeInactive?: boolean }): Promise<LocationRow[]>;
  /** Ids above `id`, nearest first (excludes `id`). */
  ancestorIds(orgId: string, id: number): Promise<number[]>;
  derivedRoom(orgId: string, id: number): Promise<RackRoomRef | null>;
  eventByClientId(orgId: string, clientEventId: string): Promise<StoredRackEvent | null>;
  bayAdopted(orgId: string, bayKey: string): Promise<boolean>;
  /** Active rows whose barcode is `<prefix>` + level + position (`C0105` → `C0105101`, `C01051000`). */
  bayRows(orgId: string, prefix: string): Promise<LocationRow[]>;
  insertLocation(orgId: string, row: NewLocationRow): Promise<number>;
  updateLocation(orgId: string, id: number, patch: LocationPatch): Promise<void>;
  setActive(orgId: string, ids: number[], active: boolean): Promise<void>;
  /** Subset of `ids` holding stock, open cartons, staged lines, open totes or placed units. */
  occupiedIds(orgId: string, ids: number[]): Promise<number[]>;
  readRacks(orgId: string, filter: RackListFilter): Promise<RackSummaryRow[]>;
  readRackChildren(orgId: string, rackIds: number[]): Promise<RackChildRow[]>;
  /** Re-point text-keyed `serial_units.current_location` from old spellings to the new barcode. */
  repointSerialText(orgId: string, from: Array<string | null>, to: string): Promise<void>;
  recordEvent(input: RecordOpsEventInput): Promise<number | null>;
}

export interface RacksDeps {
  /** Run `fn` in one tenant transaction (GUC set, commit on resolve). */
  withTx<T>(orgId: string, fn: (db: RackDb) => Promise<T>): Promise<T>;
}

const defaultDeps: RacksDeps = {
  withTx: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(createRackDb(client))),
};

// ─── Results ────────────────────────────────────────────────────────────────

export interface RackActor {
  organizationId: string;
  staffId: number | null;
  /** `commitIsPhoneOrigin` — server-trusted, never the body. */
  phoneOrigin: boolean;
}

export type RackOutcome<T> =
  | { ok: true; status: 200 | 201; body: T }
  | { ok: false; status: 400 | 404 | 409; error: RackErrorBody };

const STATUS_BY_CODE: Record<RackErrorBody['code'], 400 | 404 | 409> = {
  invalid: 400,
  not_found: 404,
  destination_not_found: 404,
  destination_kind: 400,
  same_placement: 409,
  shelf_has_stock: 409,
  rack_in_use: 409,
  not_a_rack: 400,
  bay_not_found: 404,
  bay_already_adopted: 409,
};

function fail<T>(code: RackErrorBody['code'], error: string): RackOutcome<T> {
  return { ok: false, status: STATUS_BY_CODE[code], error: { error, code } };
}

function ok<T>(body: T, status: 200 | 201 = 200): RackOutcome<T> {
  return { ok: true, status, body };
}

/** Thrown inside a tx to abort it with a mapped outcome (rolls back any writes). */
class RackAbort extends Error {
  constructor(readonly outcome: RackOutcome<never>) {
    super(outcome.ok ? 'abort' : outcome.error.error);
  }
}

async function runTx<T>(
  deps: RacksDeps,
  orgId: string,
  fn: (db: RackDb) => Promise<RackOutcome<T>>,
): Promise<RackOutcome<T>> {
  try {
    return await deps.withTx(orgId, fn);
  } catch (err) {
    if (err instanceof RackAbort) return err.outcome;
    throw err;
  }
}

const PLACEMENT_KINDS: readonly RackPlacementKind[] = ['ROOM', 'STAGING'];

// ─── Pure helpers ───────────────────────────────────────────────────────────

/** Next rack number for the org: max `RK<n>` rack number in use (any level, any state) + 1. */
export function nextRackNumber(barcodes: readonly string[]): number {
  let max = 0;
  for (const b of barcodes) {
    const a = parseRackCode(b);
    if (a && a.rack > max) max = a.rack;
  }
  return max + 1;
}

/** Shelf number of a SHELF row: from its `RK…` code, else its `sort_order` (kept legacy barcodes). */
export function shelfNumberOf(row: Pick<LocationRow, 'barcode' | 'sortOrder'>): number {
  const a = row.barcode ? parseRackCode(row.barcode) : null;
  return a?.shelf ?? row.sortOrder;
}

function positionNumberOf(row: Pick<LocationRow, 'barcode' | 'sortOrder'>): number {
  const a = row.barcode ? parseRackCode(row.barcode) : null;
  return a?.position ?? row.sortOrder;
}

function placementRef(row: { id: number; code: string | null; name: string; kind: string }): RackPlacementRef {
  return { id: row.id, code: row.code, name: row.name, kind: row.kind === 'STAGING' ? 'STAGING' : 'ROOM' };
}

function locPlacementRef(row: LocationRow): RackPlacementRef {
  return placementRef({ id: row.id, code: row.barcode, name: row.name, kind: row.kind });
}

/** Assemble the wire detail from a summary row and its active children. */
export function assembleRackDetail(row: RackSummaryRow, children: readonly RackChildRow[]): RackDetail {
  const mine = children.filter((c) => c.rackId === row.id);
  const shelfRows = mine.filter((c) => c.kind === 'SHELF' && c.parentId === row.id);
  const shelves: RackShelf[] = shelfRows
    .map((s) => {
      const positions = mine
        .filter((p) => p.kind === 'POSITION' && p.parentId === s.id)
        .map((p) => ({ id: p.id, code: p.barcode ?? '', name: p.name, position: positionNumberOf(p), stockQty: p.stockQty }))
        .sort((a, b) => a.position - b.position || a.id - b.id);
      return {
        id: s.id,
        code: s.barcode ?? '',
        name: s.name,
        shelf: shelfNumberOf(s),
        capacity: s.capacity,
        sortOrder: s.sortOrder,
        stockQty: s.stockQty + positions.reduce((n, p) => n + p.stockQty, 0),
        positions: positions.map(({ stockQty: _q, ...p }) => p),
      };
    })
    .sort((a, b) => a.shelf - b.shelf || a.id - b.id);
  return {
    id: row.id,
    code: row.barcode,
    name: row.name,
    rackNumber: parseRackCode(row.barcode)?.rack ?? 0,
    placement: placementRef(row.placement),
    room: row.room,
    shelfCount: shelves.length,
    lastMovedAt: row.lastEventAt ?? row.createdAt,
    shelves,
  };
}

function shelfAddress(rack: number, shelf: number, position: number | null = null): RackAddress {
  return { rack, shelf, position };
}

/** Plan a new rack's rows: codes, names, positions. Pure. */
export function planRack(input: {
  rackNumber: number;
  shelves: number;
  positionsPerShelf?: number;
  placement: RackPlacementRef;
  room: RackRoomRef | null;
}): PlannedRack {
  const rackAddr: RackAddress = { rack: input.rackNumber, shelf: null, position: null };
  const perShelf = input.positionsPerShelf ?? 0;
  const shelves: PlannedRack['shelves'] = [];
  for (let n = 1; n <= input.shelves; n++) {
    const addr = shelfAddress(input.rackNumber, n);
    const positions: string[] = [];
    for (let p = 1; p <= perShelf; p++) positions.push(rackCode(shelfAddress(input.rackNumber, n, p)));
    shelves.push({ code: rackCode(addr), name: rackName(addr), shelf: n, positions });
  }
  return {
    code: rackCode(rackAddr),
    name: rackName(rackAddr),
    rackNumber: input.rackNumber,
    placement: input.placement,
    room: input.room,
    shelves,
  };
}

export interface BayRef {
  zone: string;
  aisle: number;
  bay: number;
}

/** `C-04-07`, `C-04-07-3`, `C-04-07-3-01`, `C0407300`, `C0407` (any scan spelling) → zone/aisle/bay. */
export function parseBayCode(raw: string): BayRef | null {
  const typed = String(raw ?? '').trim().toUpperCase();
  // The scan unwrap folds GS1 forms and collapses dashed spellings to flat
  // (`C-01-05-1` → `C01051`); try the typed form first, then the unwrapped one.
  for (const v of [typed, unwrapScannedLocation(typed).trim().toUpperCase()]) {
    const m = /^([A-Z])-(\d{2})-(\d{2})(?:-\d{1,2}(?:-\d{2})?)?$/.exec(v) ?? /^([A-Z])(\d{2})(\d{2})\d{0,4}$/.exec(v);
    if (!m) continue;
    const aisle = Number(m[2]);
    const bay = Number(m[3]);
    return aisle >= 1 && bay >= 1 ? { zone: m[1], aisle, bay } : null;
  }
  return null;
}

export function bayKey(b: BayRef): string {
  return `${b.zone}-${pad2(b.aisle)}-${pad2(b.bay)}`;
}

/** Plan an adoption: every bay row → a SHELF (position 00) or POSITION, plus shelves to create. Pure. */
export function planAdoption(input: {
  rows: readonly LocationRow[];
  bay: BayRef;
  rackNumber: number;
  keepBarcodes: boolean;
}): AdoptBayPlanRow[] {
  const levels = new Map<number, { shelf: LocationRow | null; positions: Array<{ row: LocationRow; position: number }> }>();
  for (const row of input.rows) {
    const seg = row.barcode ? parseLocationCodeFlat(row.barcode) : null;
    if (!seg || Number(seg.aisle) !== input.bay.aisle || Number(seg.bay) !== input.bay.bay || seg.zone !== input.bay.zone) {
      continue;
    }
    const level = Number(seg.level);
    const position = Number(seg.position);
    const slot = levels.get(level) ?? { shelf: null, positions: [] };
    if (position === 0) slot.shelf = row;
    else slot.positions.push({ row, position });
    levels.set(level, slot);
  }
  const plan: AdoptBayPlanRow[] = [];
  for (const level of [...levels.keys()].sort((a, b) => a - b)) {
    const slot = levels.get(level)!;
    const shelfCode = rackCode(shelfAddress(input.rackNumber, level));
    if (slot.shelf) {
      plan.push({
        id: slot.shelf.id,
        from: slot.shelf.barcode,
        to: input.keepBarcodes ? slot.shelf.barcode ?? shelfCode : shelfCode,
        shelf: level,
        position: null,
      });
    } else {
      plan.push({ id: null, from: null, to: shelfCode, shelf: level, position: null });
    }
    for (const p of slot.positions.sort((a, b) => a.position - b.position)) {
      plan.push({
        id: p.row.id,
        from: p.row.barcode,
        to: input.keepBarcodes
          ? p.row.barcode ?? rackCode(shelfAddress(input.rackNumber, level, p.position))
          : rackCode(shelfAddress(input.rackNumber, level, p.position)),
        shelf: level,
        position: p.position,
      });
    }
  }
  return plan;
}

// ─── Shared reads ───────────────────────────────────────────────────────────

async function readDetail(db: RackDb, orgId: string, rackId: number): Promise<RackDetail | null> {
  const [row] = await db.readRacks(orgId, { rackId });
  if (!row) return null;
  const children = await db.readRackChildren(orgId, [rackId]);
  return assembleRackDetail(row, children);
}

async function mustReadDetail(db: RackDb, orgId: string, rackId: number): Promise<RackDetail> {
  const detail = await readDetail(db, orgId, rackId);
  if (!detail) throw new Error(`rack ${rackId} vanished inside its own transaction`);
  return detail;
}

/** Normalize any scanned/typed spelling to the barcode to look up. */
function lookupCode(raw: string): string {
  return canonicalRackCode(raw) ?? unwrapScannedLocation(String(raw ?? '')).trim();
}

/** Any rack-family code (rack, shelf, position — RK or kept legacy) → its RACK row. */
async function resolveRack(
  db: RackDb,
  orgId: string,
  raw: string,
): Promise<{ rack: LocationRow } | { error: RackOutcome<never> }> {
  const code = lookupCode(raw);
  if (!code) return { error: fail('invalid', 'A rack code is required') };
  let row = await db.findLocation(orgId, { code });
  if (!row) {
    // A shelf code whose row is gone still names its rack.
    const a = parseRackCode(code);
    if (a && a.shelf != null) row = await db.findLocation(orgId, { code: rackCode({ rack: a.rack, shelf: null, position: null }) });
  }
  if (!row) return { error: fail('not_found', `No rack ${code}`) };
  for (let hop = 0; hop < 2 && (row.kind === 'POSITION' || row.kind === 'SHELF'); hop++) {
    if (row.parentId == null) break;
    const parent: LocationRow | null = await db.findLocation(orgId, { id: row.parentId });
    if (!parent) break;
    row = parent;
  }
  if (row.kind !== 'RACK') return { error: fail('not_a_rack', `${code} is not a rack`) };
  return { rack: row };
}

async function resolvePlacement(
  db: RackDb,
  orgId: string,
  ref: { code?: string; id?: number },
): Promise<{ placement: LocationRow } | { error: RackOutcome<never> }> {
  let row: LocationRow | null = null;
  if (ref.id != null) row = await db.findLocation(orgId, { id: ref.id });
  else if (ref.code) row = await db.findLocation(orgId, { code: lookupCode(ref.code) });
  else return { error: fail('invalid', 'A placement code or id is required') };
  if (!row) return { error: fail('destination_not_found', `No room or floor spot ${ref.code ?? `#${ref.id}`}`) };
  if (!PLACEMENT_KINDS.includes(row.kind as RackPlacementKind)) {
    return { error: fail('destination_kind', `${row.barcode ?? row.name} is not a room or floor spot`) };
  }
  return { placement: row };
}

/** One `ops_events` row for a rack verb; origin is the server-trusted phone/desk flag. */
function event(actor: RackActor, eventType: string, entityId: number, clientEventId: string, payload: Record<string, unknown>): RecordOpsEventInput {
  return {
    organizationId: actor.organizationId,
    entityType: 'location',
    entityId,
    eventType,
    actorStaffId: actor.staffId,
    clientEventId,
    payload: { ...payload, origin: actor.phoneOrigin ? 'phone' : 'desk' },
  };
}

/** A replayed clientEventId: same verb → its entity; another verb → refuse. */
async function replayed(
  db: RackDb,
  orgId: string,
  clientEventId: string,
  eventType: string,
): Promise<{ hit: StoredRackEvent } | { error: RackOutcome<never> } | null> {
  const prior = await db.eventByClientId(orgId, clientEventId);
  if (!prior) return null;
  if (prior.eventType !== eventType) return { error: fail('invalid', 'clientEventId was already used for another action') };
  return { hit: prior };
}

// ─── Verbs ──────────────────────────────────────────────────────────────────

export async function listRacks(
  orgId: string,
  filter: { placementCode?: string | null; roomId?: number | null },
  deps: RacksDeps = defaultDeps,
): Promise<RackOutcome<ListRacksResponse>> {
  return runTx(deps, orgId, async (db) => {
    const f: RackListFilter = {};
    if (filter.placementCode) {
      const placement = await db.findLocation(orgId, { code: lookupCode(filter.placementCode) });
      if (!placement) return ok({ racks: [] });
      f.placementId = placement.id;
    }
    if (filter.roomId != null) f.roomId = filter.roomId;
    const rows = await db.readRacks(orgId, f);
    const children = await db.readRackChildren(orgId, rows.map((r) => r.id));
    const racks = rows
      .map((r) => assembleRackDetail(r, children))
      .sort((a, b) => a.rackNumber - b.rackNumber || a.id - b.id)
      .map(({ shelves: _s, ...summary }) => summary);
    return ok({ racks });
  });
}

export async function getRack(orgId: string, code: string, deps: RacksDeps = defaultDeps): Promise<RackOutcome<GetRackResponse>> {
  return runTx(deps, orgId, async (db) => {
    const r = await resolveRack(db, orgId, code);
    if ('error' in r) return r.error;
    const rack = await readDetail(db, orgId, r.rack.id);
    return rack ? ok({ rack }) : fail('not_found', `No rack ${code}`);
  });
}

export async function createRack(
  actor: RackActor,
  body: CreateRackBody,
  deps: RacksDeps = defaultDeps,
): Promise<RackOutcome<CreateRackResponse>> {
  const orgId = actor.organizationId;
  if (!Number.isInteger(body.shelves) || body.shelves < 1 || body.shelves > RACK_MAX_SHELVES) {
    return fail('invalid', `A rack has 1–${RACK_MAX_SHELVES} shelves`);
  }
  const perShelf = body.positionsPerShelf ?? 0;
  if (!Number.isInteger(perShelf) || perShelf < 0 || perShelf > RACK_MAX_POSITIONS_PER_SHELF) {
    return fail('invalid', `Positions per shelf must be 0–${RACK_MAX_POSITIONS_PER_SHELF}`);
  }
  return runTx(deps, orgId, async (db) => {
    const p = await resolvePlacement(db, orgId, { code: body.placementCode, id: body.placementId });
    if ('error' in p) return p.error;
    const placement = locPlacementRef(p.placement);
    const room = await db.derivedRoom(orgId, p.placement.id);

    if (!body.dryRun) {
      await db.lockRackNumbers(orgId);
      const prior = await replayed(db, orgId, body.clientEventId, RACK_EVENT.created);
      if (prior && 'error' in prior) return prior.error;
      if (prior) {
        const rack = await readDetail(db, orgId, prior.hit.entityId);
        if (rack) return ok<CreateRackResponse>({ dryRun: false, rack, idempotent: true });
      }
    }

    const rackNumber = nextRackNumber(await db.rackFamilyBarcodes(orgId));
    const planned = planRack({
      rackNumber,
      shelves: body.shelves,
      positionsPerShelf: perShelf,
      placement,
      room,
    });
    if (body.dryRun) return ok<CreateRackResponse>({ dryRun: true, planned });

    const rackId = await db.insertLocation(orgId, {
      name: planned.name,
      barcode: planned.code,
      kind: 'RACK',
      parentId: p.placement.id,
      sortOrder: rackNumber,
    });
    for (const s of planned.shelves) {
      const shelfId = await db.insertLocation(orgId, {
        name: s.name,
        barcode: s.code,
        kind: 'SHELF',
        parentId: rackId,
        sortOrder: s.shelf,
      });
      for (let i = 0; i < s.positions.length; i++) {
        const addr = shelfAddress(rackNumber, s.shelf, i + 1);
        await db.insertLocation(orgId, {
          name: rackName(addr),
          barcode: s.positions[i]!,
          kind: 'POSITION',
          parentId: shelfId,
          sortOrder: i + 1,
        });
      }
    }
    await db.recordEvent(
      event(actor, RACK_EVENT.created, rackId, body.clientEventId, {
        rack_code: planned.code,
        placement_id: placement.id,
        placement_code: placement.code,
        shelves: planned.shelves.map((s) => s.code),
        positions_per_shelf: perShelf,
      }),
    );
    const rack = await mustReadDetail(db, orgId, rackId);
    return ok<CreateRackResponse>({ dryRun: false, rack, idempotent: false }, 201);
  });
}

export async function moveRack(
  actor: RackActor,
  code: string,
  body: MoveRackBody,
  deps: RacksDeps = defaultDeps,
): Promise<RackOutcome<MoveRackResponse>> {
  const orgId = actor.organizationId;
  return runTx(deps, orgId, async (db) => {
    const r = await resolveRack(db, orgId, code);
    if ('error' in r) return r.error;
    const rack = r.rack;

    const prior = await replayed(db, orgId, body.clientEventId, RACK_EVENT.moved);
    if (prior && 'error' in prior) return prior.error;
    if (prior) {
      if (prior.hit.entityId !== rack.id) return fail('invalid', 'clientEventId was already used for another rack');
      const detail = await mustReadDetail(db, orgId, rack.id);
      const pl = prior.hit.payload;
      const ref = (k: 'from' | 'to'): RackPlacementRef => {
        const raw = pl[k];
        const v: object = raw && typeof raw === 'object' ? raw : {};
        return placementRef({
          id: 'id' in v ? Number(v.id) : 0,
          code: 'code' in v && typeof v.code === 'string' ? v.code : null,
          name: 'name' in v && typeof v.name === 'string' ? v.name : '',
          kind: 'kind' in v && typeof v.kind === 'string' ? v.kind : 'ROOM',
        });
      };
      return ok({ rack: detail, from: ref('from'), to: ref('to'), idempotent: true });
    }

    const d = await resolvePlacement(db, orgId, { code: body.destinationCode, id: body.destinationId });
    if ('error' in d) return d.error;
    const dest = d.placement;
    if (dest.id === rack.parentId) return fail('same_placement', `${rack.barcode} is already in ${dest.barcode ?? dest.name}`);
    if (dest.id === rack.id || (await db.ancestorIds(orgId, dest.id)).includes(rack.id)) {
      return fail('destination_kind', 'A rack cannot stand inside itself');
    }
    if (rack.parentId == null) return fail('not_found', `${rack.barcode} has no placement`);
    const fromRow = await db.findLocation(orgId, { id: rack.parentId }, { includeInactive: true });
    const from = fromRow
      ? locPlacementRef(fromRow)
      : placementRef({ id: rack.parentId, code: null, name: '', kind: 'ROOM' });
    const to = locPlacementRef(dest);

    await db.updateLocation(orgId, rack.id, { parentId: dest.id });
    const [fromRoom, toRoom] = await Promise.all([db.derivedRoom(orgId, from.id), db.derivedRoom(orgId, dest.id)]);
    await db.recordEvent(
      event(actor, RACK_EVENT.moved, rack.id, body.clientEventId, {
        rack_code: rack.barcode,
        from,
        to,
        from_room_id: fromRoom?.id ?? null,
        to_room_id: toRoom?.id ?? null,
      }),
    );
    const detail = await mustReadDetail(db, orgId, rack.id);
    return ok({ rack: detail, from, to, idempotent: false });
  });
}

/** Retire one empty rack and every active shelf/position beneath it. */
export async function deleteRack(
  actor: RackActor,
  code: string,
  body: DeleteRackBody,
  deps: RacksDeps = defaultDeps,
): Promise<RackOutcome<DeleteRackResponse>> {
  const orgId = actor.organizationId;
  return runTx(deps, orgId, async (db) => {
    const prior = await replayed(db, orgId, body.clientEventId, RACK_EVENT.deleted);
    if (prior && 'error' in prior) return prior.error;
    if (prior) {
      const priorCode = typeof prior.hit.payload.rack_code === 'string' ? prior.hit.payload.rack_code : lookupCode(code);
      const retired = Array.isArray(prior.hit.payload.retired) ? prior.hit.payload.retired.map(String) : [priorCode];
      return ok({ rackId: prior.hit.entityId, code: priorCode, retired, idempotent: true });
    }

    const r = await resolveRack(db, orgId, code);
    if ('error' in r) return r.error;
    const rack = r.rack;
    const shelves = (await db.childrenOf(orgId, [rack.id])).filter((row) => row.kind === 'SHELF');
    const positions = shelves.length
      ? (await db.childrenOf(orgId, shelves.map((shelf) => shelf.id))).filter((row) => row.kind === 'POSITION')
      : [];
    const rows = [rack, ...shelves, ...positions];
    const ids = rows.map((row) => row.id);
    const occupied = await db.occupiedIds(orgId, ids);
    if (occupied.length > 0) {
      return fail('rack_in_use', `${rack.barcode ?? rack.name} still holds stock, cartons, totes, or staged work`);
    }

    await db.setActive(orgId, ids, false);
    const retired = rows.map((row) => row.barcode ?? row.name);
    await db.recordEvent(event(actor, RACK_EVENT.deleted, rack.id, body.clientEventId, {
      rack_code: rack.barcode,
      retired,
    }));
    return ok({ rackId: rack.id, code: rack.barcode ?? rack.name, retired, idempotent: false });
  });
}

export async function editRackShelves(
  actor: RackActor,
  code: string,
  body: EditRackShelvesBody,
  deps: RacksDeps = defaultDeps,
): Promise<RackOutcome<EditRackShelvesResponse>> {
  const orgId = actor.organizationId;
  const add = body.add ?? 0;
  const removeCodes = [...new Set((body.remove ?? []).map(lookupCode).filter(Boolean))];
  if (!Number.isInteger(add) || add < 0 || add > RACK_MAX_SHELVES) return fail('invalid', `Add 0–${RACK_MAX_SHELVES} shelves`);
  if (add === 0 && removeCodes.length === 0) return fail('invalid', 'Nothing to add or remove');

  return runTx(deps, orgId, async (db) => {
    const r = await resolveRack(db, orgId, code);
    if ('error' in r) return r.error;
    const rack = r.rack;
    const rackNumber = rack.barcode ? parseRackCode(rack.barcode)?.rack : undefined;
    if (rackNumber == null) return fail('not_a_rack', `${rack.barcode ?? rack.name} has no rack number`);

    const prior = await replayed(db, orgId, body.clientEventId, RACK_EVENT.shelvesEdited);
    if (prior && 'error' in prior) return prior.error;
    if (prior) {
      const detail = await mustReadDetail(db, orgId, rack.id);
      const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
      return ok({ rack: detail, added: strings(prior.hit.payload.added), removed: strings(prior.hit.payload.removed) });
    }

    const allShelves = (await db.childrenOf(orgId, [rack.id], { includeInactive: true })).filter((c) => c.kind === 'SHELF');
    const active = allShelves.filter((s) => s.isActive);
    if (active.length - removeCodes.length + add > RACK_MAX_SHELVES) {
      return fail('invalid', `A rack has at most ${RACK_MAX_SHELVES} shelves`);
    }

    // Remove: every code must be an active shelf on THIS rack, none occupied.
    const toRemove: LocationRow[] = [];
    for (const c of removeCodes) {
      const s = active.find((x) => x.barcode != null && x.barcode.toUpperCase() === c.toUpperCase());
      if (!s) return fail('invalid', `${c} is not a shelf on ${rack.barcode}`);
      toRemove.push(s);
    }
    const removedPositions = toRemove.length
      ? (await db.childrenOf(orgId, toRemove.map((s) => s.id))).filter((c) => c.kind === 'POSITION')
      : [];
    const retireIds = [...toRemove.map((s) => s.id), ...removedPositions.map((p) => p.id)];
    const occupied = new Set(await db.occupiedIds(orgId, retireIds));
    const blocked = toRemove.filter(
      (s) => occupied.has(s.id) || removedPositions.some((p) => p.parentId === s.id && occupied.has(p.id)),
    );
    if (blocked.length) {
      return fail('shelf_has_stock', `${blocked.map((s) => s.barcode).join(', ')} still holds stock or cartons`);
    }
    await db.setActive(orgId, retireIds, false);

    // Add: append after the highest remaining shelf; a retired RK shelf of this rack comes back.
    const remaining = active.filter((s) => !toRemove.includes(s));
    let next = remaining.reduce((m, s) => Math.max(m, shelfNumberOf(s)), 0) + 1;
    const added: string[] = [];
    for (let i = 0; i < add; i++, next++) {
      const addr = shelfAddress(rackNumber, next);
      const shelfCode = rackCode(addr);
      const existing = await db.findLocation(orgId, { code: shelfCode }, { includeInactive: true });
      if (existing && existing.parentId === rack.id && existing.kind === 'SHELF' && !existing.isActive) {
        await db.updateLocation(orgId, existing.id, { isActive: true, sortOrder: next });
      } else if (existing) {
        throw new RackAbort(fail('invalid', `${shelfCode} is already used by another location`));
      } else {
        await db.insertLocation(orgId, { name: rackName(addr), barcode: shelfCode, kind: 'SHELF', parentId: rack.id, sortOrder: next });
      }
      added.push(shelfCode);
    }
    const removed = toRemove.map((s) => s.barcode ?? String(s.id));
    await db.recordEvent(event(actor, RACK_EVENT.shelvesEdited, rack.id, body.clientEventId, { rack_code: rack.barcode, added, removed }));
    const detail = await mustReadDetail(db, orgId, rack.id);
    return ok({ rack: detail, added, removed });
  });
}

export async function recordRackLabelsPrinted(
  actor: RackActor,
  code: string,
  body: RackLabelsPrintedBody,
  deps: RacksDeps = defaultDeps,
): Promise<RackOutcome<{ ok: true; rackId: number }>> {
  const orgId = actor.organizationId;
  const codes = [...new Set(body.codes.map((c) => String(c).trim()).filter(Boolean))];
  if (codes.length === 0) return fail('invalid', 'No printed codes');
  return runTx(deps, orgId, async (db) => {
    const r = await resolveRack(db, orgId, code);
    if ('error' in r) return r.error;
    const prior = await replayed(db, orgId, body.clientEventId, RACK_EVENT.labelsPrinted);
    if (prior && 'error' in prior) return prior.error;
    if (!prior) {
      await db.recordEvent(
        event(actor, RACK_EVENT.labelsPrinted, r.rack.id, body.clientEventId, {
          rack_id: r.rack.id,
          rack_code: r.rack.barcode,
          codes,
          transport: body.transport,
        }),
      );
    }
    return ok({ ok: true as const, rackId: r.rack.id });
  });
}

export async function adoptBay(
  actor: RackActor,
  body: AdoptBayBody,
  deps: RacksDeps = defaultDeps,
): Promise<RackOutcome<AdoptBayResponse>> {
  const orgId = actor.organizationId;
  const bay = parseBayCode(body.bayCode);
  if (!bay) return fail('invalid', `${body.bayCode} is not an aisle-bay code`);
  const key = bayKey(bay);

  return runTx(deps, orgId, async (db) => {
    if (!body.dryRun) {
      await db.lockRackNumbers(orgId);
      const prior = await replayed(db, orgId, body.clientEventId, RACK_EVENT.adopted);
      if (prior && 'error' in prior) return prior.error;
      if (prior) {
        const rack = await readDetail(db, orgId, prior.hit.entityId);
        if (rack) return ok<AdoptBayResponse>({ dryRun: false, rack, idempotent: true });
      }
    }
    if (await db.bayAdopted(orgId, key)) return fail('bay_already_adopted', `Bay ${key} is already a rack`);
    const rows = await db.bayRows(orgId, `${bay.zone}${pad2(bay.aisle)}${pad2(bay.bay)}`);
    if (rows.length === 0) return fail('bay_not_found', `No shelves for bay ${key}`);
    if (rows.some((row) => row.kind !== 'BIN')) return fail('bay_already_adopted', `Bay ${key} is already a rack`);
    const parentIds = [...new Set(rows.map((row) => row.parentId))];
    if (parentIds.length !== 1 || parentIds[0] == null) {
      return fail('invalid', `Bay ${key} shelves stand in more than one place`);
    }
    const parent = await db.findLocation(orgId, { id: parentIds[0] });
    if (!parent || !PLACEMENT_KINDS.includes(parent.kind as RackPlacementKind)) {
      return fail('destination_kind', `Bay ${key} does not stand in a room or floor spot`);
    }

    const rackNumber = nextRackNumber(await db.rackFamilyBarcodes(orgId));
    const rackAddr: RackAddress = { rack: rackNumber, shelf: null, position: null };
    const planRows = planAdoption({ rows, bay, rackNumber, keepBarcodes: body.keepBarcodes });
    const planned: AdoptBayPlan = {
      rack: { code: rackCode(rackAddr), name: rackName(rackAddr) },
      placement: locPlacementRef(parent),
      room: await db.derivedRoom(orgId, parent.id),
      shelves: planRows,
    };
    if (body.dryRun) return ok<AdoptBayResponse>({ dryRun: true, planned });

    const rackId = await db.insertLocation(orgId, {
      name: planned.rack.name,
      barcode: planned.rack.code,
      kind: 'RACK',
      parentId: parent.id,
      sortOrder: rackNumber,
    });
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    const shelfIdByLevel = new Map<number, number>();
    for (const p of planRows) {
      if (p.position != null) continue;
      const addr = shelfAddress(rackNumber, p.shelf);
      if (p.id == null) {
        shelfIdByLevel.set(p.shelf, await db.insertLocation(orgId, { name: rackName(addr), barcode: p.to, kind: 'SHELF', parentId: rackId, sortOrder: p.shelf }));
        continue;
      }
      await adoptRow(db, orgId, byId.get(p.id)!, { kind: 'SHELF', parentId: rackId, sortOrder: p.shelf, recode: body.keepBarcodes ? null : { barcode: p.to, name: rackName(addr) } });
      shelfIdByLevel.set(p.shelf, p.id);
    }
    for (const p of planRows) {
      if (p.position == null || p.id == null) continue;
      const addr = shelfAddress(rackNumber, p.shelf, p.position);
      await adoptRow(db, orgId, byId.get(p.id)!, {
        kind: 'POSITION',
        parentId: shelfIdByLevel.get(p.shelf)!,
        sortOrder: p.position,
        recode: body.keepBarcodes ? null : { barcode: p.to, name: rackName(addr) },
      });
    }
    await db.recordEvent(
      event(actor, RACK_EVENT.adopted, rackId, body.clientEventId, {
        bay: key,
        rack_code: planned.rack.code,
        keep_barcodes: body.keepBarcodes,
        placement_id: parent.id,
        rows: planRows,
      }),
    );
    const rack = await mustReadDetail(db, orgId, rackId);
    return ok<AdoptBayResponse>({ dryRun: false, rack, idempotent: false }, 201);
  });
}

async function adoptRow(
  db: RackDb,
  orgId: string,
  row: LocationRow,
  change: { kind: 'SHELF' | 'POSITION'; parentId: number; sortOrder: number; recode: { barcode: string; name: string } | null },
): Promise<void> {
  const patch: LocationPatch = { kind: change.kind, parentId: change.parentId, sortOrder: change.sortOrder, clearLegacyRoom: true };
  if (change.recode) {
    patch.barcode = change.recode.barcode;
    patch.name = change.recode.name;
    patch.displayName = null;
  }
  await db.updateLocation(orgId, row.id, patch);
  // Stock is keyed by location_id and follows untouched; text-keyed unit
  // locations would orphan on a re-code, so re-point them in the same tx.
  if (change.recode) await db.repointSerialText(orgId, [row.barcode, row.name, row.displayName], change.recode.barcode);
}
