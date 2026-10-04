/** Movable racks — domain verbs with an in-memory `RackDb` (DB-free). */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adoptBay,
  createRack,
  editRackShelves,
  getRack,
  moveRack,
  nextRackNumber,
  parseBayCode,
  recordRackLabelsPrinted,
  type LocationPatch,
  type LocationRow,
  type NewLocationRow,
  type RackActor,
  type RackChildRow,
  type RackDb,
  type RacksDeps,
  type RackSummaryRow,
} from './racks';
import { RACK_EVENT } from './rack-events';
import type { RecordOpsEventInput } from '@/lib/ops-events';

const ORG = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';
const ACTOR: RackActor = { organizationId: ORG, staffId: 7, phoneOrigin: true };

type Row = LocationRow & { org: string };

interface Captured {
  locks: string[];
  inserts: NewLocationRow[];
  updates: Array<{ id: number; patch: LocationPatch }>;
  deactivated: number[];
  events: RecordOpsEventInput[];
  repoints: Array<{ from: Array<string | null>; to: string }>;
  txOrgs: string[];
}

function loc(org: string, id: number, kind: string, barcode: string | null, parentId: number | null, extra: Partial<LocationRow> = {}): Row {
  return {
    org,
    id,
    barcode,
    name: extra.name ?? barcode ?? `loc ${id}`,
    displayName: null,
    kind,
    parentId,
    isActive: true,
    sortOrder: 0,
    tier: null,
    capacity: null,
    ...extra,
  };
}

/** A small warehouse: two rooms + staging + a desk in ORG, one room in OTHER. */
function seed(): Row[] {
  return [
    loc(ORG, 1, 'ROOM', 'ROOM-A', null, { name: 'Room A' }),
    loc(ORG, 2, 'ROOM', 'ROOM-B', null, { name: 'Room B' }),
    loc(ORG, 3, 'STAGING', 'FLOOR-1', 2, { name: 'Floor 1' }),
    loc(ORG, 4, 'DESK', 'DESK-1', 1, { name: 'Desk 1' }),
    loc(ORG, 5, 'BIN', 'C0101100', 1),
    loc(OTHER, 50, 'ROOM', 'ROOM-X', null, { name: 'Other room' }),
  ];
}

function fakes(initial: Row[] = seed(), opts: { stock?: Record<number, number>; occupied?: number[] } = {}) {
  const rows = initial.map((r) => ({ ...r }));
  const events: Array<{ org: string; eventType: string; entityId: number; clientEventId: string | null; payload: Record<string, unknown> }> = [];
  const cap: Captured = { locks: [], inserts: [], updates: [], deactivated: [], events: [], repoints: [], txOrgs: [] };
  let nextId = 1000;

  const byId = (org: string, id: number) => rows.find((r) => r.org === org && r.id === id) ?? null;
  const roomOf = (org: string, id: number) => {
    let cur = byId(org, id);
    for (let i = 0; cur && i < 16; i++) {
      if (cur.kind === 'ROOM') return { id: cur.id, name: cur.name, code: cur.barcode };
      cur = cur.parentId == null ? null : byId(org, cur.parentId);
    }
    return null;
  };
  const strip = ({ org: _o, ...r }: Row): LocationRow => ({ ...r });

  const db: RackDb = {
    async lockRackNumbers(orgId) {
      cap.locks.push(orgId);
    },
    async rackFamilyBarcodes(orgId) {
      return rows.filter((r) => r.org === orgId && r.barcode?.toUpperCase().startsWith('RK')).map((r) => r.barcode!);
    },
    async findLocation(orgId, ref, o) {
      const hit = rows.find(
        (r) =>
          r.org === orgId &&
          (o?.includeInactive || r.isActive) &&
          ('id' in ref ? r.id === ref.id : r.barcode?.toUpperCase() === ref.code.toUpperCase()),
      );
      return hit ? strip(hit) : null;
    },
    async childrenOf(orgId, parentIds, o) {
      return rows
        .filter((r) => r.org === orgId && r.parentId != null && parentIds.includes(r.parentId) && (o?.includeInactive || r.isActive))
        .map(strip);
    },
    async ancestorIds(orgId, id) {
      const out: number[] = [];
      let cur = byId(orgId, id);
      while (cur?.parentId != null) {
        out.push(cur.parentId);
        cur = byId(orgId, cur.parentId);
      }
      return out;
    },
    async derivedRoom(orgId, id) {
      return roomOf(orgId, id);
    },
    async eventByClientId(orgId, clientEventId) {
      const e = events.find((x) => x.org === orgId && x.clientEventId === clientEventId);
      return e ? { eventType: e.eventType, entityId: e.entityId, payload: e.payload } : null;
    },
    async bayAdopted(orgId, key) {
      return events.some((e) => e.org === orgId && e.eventType === RACK_EVENT.adopted && e.payload.bay === key);
    },
    async bayRows(orgId, prefix) {
      const re = new RegExp(`^${prefix}[0-9]{3,4}$`);
      return rows.filter((r) => r.org === orgId && r.isActive && r.barcode != null && re.test(r.barcode)).map(strip);
    },
    async insertLocation(orgId, row) {
      cap.inserts.push(row);
      const id = nextId++;
      rows.push(loc(orgId, id, row.kind, row.barcode, row.parentId, { name: row.name, sortOrder: row.sortOrder, tier: row.tier ?? null }));
      return id;
    },
    async updateLocation(orgId, id, patch) {
      cap.updates.push({ id, patch });
      const r = byId(orgId, id)!;
      if (patch.parentId !== undefined) r.parentId = patch.parentId;
      if (patch.kind !== undefined) r.kind = patch.kind;
      if (patch.barcode !== undefined) r.barcode = patch.barcode;
      if (patch.name !== undefined) r.name = patch.name;
      if (patch.displayName !== undefined) r.displayName = patch.displayName;
      if (patch.sortOrder !== undefined) r.sortOrder = patch.sortOrder;
      if (patch.isActive !== undefined) r.isActive = patch.isActive;
    },
    async setActive(orgId, ids, active) {
      if (!active) cap.deactivated.push(...ids);
      for (const id of ids) byId(orgId, id)!.isActive = active;
    },
    async occupiedIds(_orgId, ids) {
      return ids.filter((id) => (opts.occupied ?? []).includes(id));
    },
    async readRacks(orgId, filter): Promise<RackSummaryRow[]> {
      return rows
        .filter((r) => r.org === orgId && r.kind === 'RACK' && r.isActive && (filter.rackId == null || r.id === filter.rackId))
        .filter((r) => filter.placementId == null || r.parentId === filter.placementId)
        .filter((r) => filter.roomId == null || roomOf(orgId, r.id)?.id === filter.roomId)
        .map((r) => {
          const p = byId(orgId, r.parentId!)!;
          return {
            id: r.id,
            barcode: r.barcode!,
            name: r.name,
            createdAt: '2026-10-03T00:00:00.000Z',
            placement: { id: p.id, code: p.barcode, name: p.name, kind: p.kind },
            room: roomOf(orgId, r.id),
            lastEventAt: null,
          };
        });
    },
    async readRackChildren(orgId, rackIds): Promise<RackChildRow[]> {
      const shelves = rows.filter((r) => r.org === orgId && r.kind === 'SHELF' && r.isActive && rackIds.includes(r.parentId!));
      const positions = rows.filter((r) => r.org === orgId && r.kind === 'POSITION' && r.isActive && shelves.some((s) => s.id === r.parentId));
      return [
        ...shelves.map((s) => ({ ...strip(s), rackId: s.parentId!, stockQty: opts.stock?.[s.id] ?? 0 })),
        ...positions.map((p) => ({ ...strip(p), rackId: byId(orgId, p.parentId!)!.parentId!, stockQty: opts.stock?.[p.id] ?? 0 })),
      ];
    },
    async repointSerialText(_orgId, from, to) {
      cap.repoints.push({ from, to });
    },
    async recordEvent(input) {
      cap.events.push(input);
      if (input.clientEventId && events.some((e) => e.clientEventId === input.clientEventId)) return null;
      events.push({
        org: input.organizationId,
        eventType: input.eventType,
        entityId: input.entityId,
        clientEventId: input.clientEventId ?? null,
        payload: input.payload as Record<string, unknown>,
      });
      return events.length;
    },
  };

  const deps: RacksDeps = {
    withTx: async (orgId, fn) => {
      cap.txOrgs.push(orgId);
      return fn(db);
    },
  };
  return { deps, cap, rows };
}

/** ORG with rack RK4 (3 shelves, shelf 2 tiered) standing in Room A. */
function withRack(opts: { stock?: Record<number, number>; occupied?: number[] } = {}) {
  return fakes(
    [
      ...seed(),
      loc(ORG, 10, 'RACK', 'RK4', 1, { name: 'Rack 4', sortOrder: 4 }),
      loc(ORG, 11, 'SHELF', 'RK4-1', 10, { name: 'Rack 4 Shelf 1', sortOrder: 1 }),
      loc(ORG, 12, 'SHELF', 'RK4-2', 10, { name: 'Rack 4 Shelf 2', sortOrder: 2, tier: 0 }),
      loc(ORG, 13, 'SHELF', 'RK4-3', 10, { name: 'Rack 4 Shelf 3', sortOrder: 3 }),
    ],
    opts,
  );
}

// ─── Allocation ─────────────────────────────────────────────────────────────

test('nextRackNumber: max rack number over every rack-family code + 1; ignores room-coded labels', () => {
  assert.equal(nextRackNumber([]), 1);
  assert.equal(nextRackNumber(['RK3', 'RK12-4', 'RK7-1-2', 'C0105101', 'rk0009', 'RKX']), 13);
});

test('createRack: allocates the next number under the org lock and writes rack + shelves + one event', async () => {
  const { deps, cap } = withRack();
  const out = await createRack(
    ACTOR,
    { placementCode: 'room-b', shelves: 3, shelfTiers: [{ shelf: 2, tier: 1 }], clientEventId: 'evt-create-1' },
    deps,
  );
  assert.ok(out.ok);
  assert.equal(out.status, 201);
  assert.ok(!out.body.dryRun);
  assert.deepEqual(cap.locks, [ORG], 'number allocation is serialized by an org-keyed lock');
  assert.deepEqual(cap.txOrgs, [ORG]);
  assert.deepEqual(
    cap.inserts.map((r) => [r.kind, r.barcode, r.parentId, r.sortOrder, r.tier ?? null]),
    [
      ['RACK', 'RK5', 2, 5, null],
      ['SHELF', 'RK5-1', 1000, 1, null],
      ['SHELF', 'RK5-2', 1000, 2, 1],
      ['SHELF', 'RK5-3', 1000, 3, null],
    ],
  );
  assert.equal(cap.events.length, 1);
  const e = cap.events[0]!;
  assert.equal(e.eventType, RACK_EVENT.created);
  assert.equal(e.entityType, 'location');
  assert.equal(e.entityId, 1000);
  assert.equal(e.clientEventId, 'evt-create-1');
  assert.equal(e.actorStaffId, 7);
  assert.equal((e.payload as Record<string, unknown>).origin, 'phone');
  assert.equal(out.body.rack.code, 'RK5');
  assert.equal(out.body.rack.room?.id, 2);
  assert.equal(out.body.rack.shelfCount, 3);
  assert.deepEqual(out.body.rack.tierCounts, [{ tier: 1, count: 1 }]);
});

test('createRack: positions per shelf become POSITION rows parented to their shelf', async () => {
  const { deps, cap } = fakes();
  const out = await createRack(ACTOR, { placementId: 1, shelves: 1, positionsPerShelf: 2, clientEventId: 'evt-pos-1' }, deps);
  assert.ok(out.ok && !out.body.dryRun);
  assert.deepEqual(
    cap.inserts.map((r) => [r.kind, r.barcode, r.name]),
    [
      ['RACK', 'RK1', 'Rack 1'],
      ['SHELF', 'RK1-1', 'Rack 1 Shelf 1'],
      ['POSITION', 'RK1-1-1', 'Rack 1 Shelf 1 Pos 1'],
      ['POSITION', 'RK1-1-2', 'Rack 1 Shelf 1 Pos 2'],
    ],
  );
  assert.deepEqual(out.body.rack.shelves[0]!.positions.map((p) => p.code), ['RK1-1-1', 'RK1-1-2']);
});

test('createRack dryRun: returns the planned codes and writes nothing', async () => {
  const { deps, cap } = withRack();
  const out = await createRack(ACTOR, { placementCode: 'FLOOR-1', shelves: 2, dryRun: true, clientEventId: 'evt-dry-1' }, deps);
  assert.ok(out.ok);
  assert.equal(out.status, 200);
  assert.ok(out.body.dryRun);
  assert.equal(out.body.planned.code, 'RK5');
  assert.deepEqual(out.body.planned.shelves.map((s) => s.code), ['RK5-1', 'RK5-2']);
  assert.equal(out.body.planned.placement.kind, 'STAGING');
  assert.equal(out.body.planned.room?.id, 2, 'a staging spot derives its room by walking up');
  assert.deepEqual(cap.inserts, []);
  assert.deepEqual(cap.events, []);
  assert.deepEqual(cap.updates, []);
});

test('createRack: a retried clientEventId replays the rack — no second write or event', async () => {
  const { deps, cap } = fakes();
  const body = { placementCode: 'ROOM-A', shelves: 2, clientEventId: 'evt-retry-1' };
  const first = await createRack(ACTOR, body, deps);
  const second = await createRack(ACTOR, body, deps);
  assert.ok(first.ok && !first.body.dryRun && second.ok && !second.body.dryRun);
  assert.equal(second.status, 200);
  assert.equal(second.body.idempotent, true);
  assert.equal(second.body.rack.id, first.body.rack.id);
  assert.equal(cap.inserts.length, 3);
  assert.equal(cap.events.length, 1);
});

test('createRack: placement must be a ROOM/STAGING of the same org', async () => {
  const { deps, cap } = fakes();
  const desk = await createRack(ACTOR, { placementCode: 'DESK-1', shelves: 1, clientEventId: 'evt-k-1' }, deps);
  assert.ok(!desk.ok);
  assert.equal(desk.error.code, 'destination_kind');
  const foreign = await createRack(ACTOR, { placementId: 50, shelves: 1, clientEventId: 'evt-k-2' }, deps);
  assert.ok(!foreign.ok);
  assert.equal(foreign.error.code, 'destination_not_found');
  assert.equal(foreign.status, 404);
  assert.deepEqual(cap.inserts, []);
});

test('createRack: shelf tier outside the shelf count is invalid before any IO', async () => {
  const { deps, cap } = fakes();
  const out = await createRack(ACTOR, { placementId: 1, shelves: 2, shelfTiers: [{ shelf: 3, tier: 0 }], clientEventId: 'evt-t-1' }, deps);
  assert.ok(!out.ok);
  assert.equal(out.error.code, 'invalid');
  assert.deepEqual(cap.txOrgs, []);
});

// ─── Read ───────────────────────────────────────────────────────────────────

test('getRack: a shelf code (any spelling) resolves to its rack', async () => {
  const { deps } = withRack();
  for (const code of ['RK4-2', 'rk0004-02', '(414)0614141000005(254)RK4-2']) {
    const out = await getRack(ORG, code, deps);
    assert.ok(out.ok, code);
    assert.equal(out.body.rack.code, 'RK4');
    assert.deepEqual(out.body.rack.shelves.map((s) => s.shelf), [1, 2, 3]);
  }
  const notRack = await getRack(ORG, 'C0101100', deps);
  assert.ok(!notRack.ok);
  assert.equal(notRack.error.code, 'not_a_rack');
});

// ─── Move ───────────────────────────────────────────────────────────────────

test('moveRack: one parent_id update; derived room flips; event carries from/to', async () => {
  const { deps, cap } = withRack();
  const out = await moveRack(ACTOR, 'RK4', { destinationCode: 'ROOM-B', clientEventId: 'evt-move-1' }, deps);
  assert.ok(out.ok);
  assert.deepEqual(cap.updates, [{ id: 10, patch: { parentId: 2 } }], 'moving is ONE write to the rack row');
  assert.equal(out.body.from.id, 1);
  assert.equal(out.body.to.id, 2);
  assert.equal(out.body.rack.room?.id, 2);
  assert.equal(out.body.rack.shelves.find((s) => s.code === 'RK4-2')?.tier, 0, 'tiers ride along untouched');
  assert.equal(cap.events.length, 1);
  const payload = cap.events[0]!.payload as Record<string, { id: number; code: string | null }>;
  assert.equal(cap.events[0]!.eventType, RACK_EVENT.moved);
  assert.deepEqual([payload.from.id, payload.from.code, payload.to.id, payload.to.code], [1, 'ROOM-A', 2, 'ROOM-B']);
});

test('moveRack: destination kind, same placement, cross-org and self-descendant are refused without writes', async () => {
  const { deps, cap, rows } = withRack();
  rows.push(loc(ORG, 20, 'STAGING', 'ON-RACK', 11)); // a staging spot that hangs under the rack's own shelf
  const cases: Array<[Parameters<typeof moveRack>[2], string]> = [
    [{ destinationCode: 'DESK-1', clientEventId: 'evt-m-1' }, 'destination_kind'],
    [{ destinationCode: 'C0101100', clientEventId: 'evt-m-2' }, 'destination_kind'],
    [{ destinationCode: 'ROOM-A', clientEventId: 'evt-m-3' }, 'same_placement'],
    [{ destinationId: 50, clientEventId: 'evt-m-4' }, 'destination_not_found'],
    [{ destinationCode: 'ROOM-X', clientEventId: 'evt-m-5' }, 'destination_not_found'],
    [{ destinationCode: 'ON-RACK', clientEventId: 'evt-m-6' }, 'destination_kind'],
  ];
  for (const [body, code] of cases) {
    const out = await moveRack(ACTOR, 'RK4', body, deps);
    assert.ok(!out.ok, JSON.stringify(body));
    assert.equal(out.error.code, code, JSON.stringify(body));
  }
  assert.deepEqual(cap.updates, []);
  assert.deepEqual(cap.events, []);
});

test('moveRack: a retried clientEventId is a no-op (no second update, no second event)', async () => {
  const { deps, cap } = withRack();
  const body = { destinationCode: 'FLOOR-1', clientEventId: 'evt-move-retry' };
  const first = await moveRack(ACTOR, 'RK4', body, deps);
  const second = await moveRack(ACTOR, 'RK4', body, deps);
  assert.ok(first.ok && second.ok);
  assert.equal(first.body.idempotent, false);
  assert.equal(second.body.idempotent, true);
  assert.deepEqual(second.body.to, first.body.to);
  assert.deepEqual(second.body.from, first.body.from);
  assert.equal(cap.updates.length, 1);
  assert.equal(cap.events.length, 1);
});

test('moveRack: a clientEventId already spent on another verb is refused', async () => {
  const { deps } = withRack();
  await recordRackLabelsPrinted(ACTOR, 'RK4', { codes: ['RK4'], transport: 'usb', clientEventId: 'evt-shared' }, deps);
  const out = await moveRack(ACTOR, 'RK4', { destinationCode: 'ROOM-B', clientEventId: 'evt-shared' }, deps);
  assert.ok(!out.ok);
  assert.equal(out.error.code, 'invalid');
});

// ─── Shelves ────────────────────────────────────────────────────────────────

test('editRackShelves: removing an occupied shelf is refused 409 and retires nothing', async () => {
  const { deps, cap } = withRack({ occupied: [12] });
  const out = await editRackShelves(ACTOR, 'RK4', { remove: ['RK4-2', 'RK4-3'], clientEventId: 'evt-sh-1' }, deps);
  assert.ok(!out.ok);
  assert.equal(out.status, 409);
  assert.equal(out.error.code, 'shelf_has_stock');
  assert.match(out.error.error, /RK4-2/);
  assert.deepEqual(cap.deactivated, []);
  assert.deepEqual(cap.events, []);
});

test('editRackShelves: remove retires the shelf, add appends after the highest and revives a retired code', async () => {
  const { deps, cap } = withRack();
  const removed = await editRackShelves(ACTOR, 'RK4', { remove: ['rk4-3'], clientEventId: 'evt-sh-2' }, deps);
  assert.ok(removed.ok);
  assert.deepEqual(removed.body.removed, ['RK4-3']);
  assert.deepEqual(cap.deactivated, [13]);
  const added = await editRackShelves(ACTOR, 'RK4', { add: 2, clientEventId: 'evt-sh-3' }, deps);
  assert.ok(added.ok);
  assert.deepEqual(added.body.added, ['RK4-3', 'RK4-4']);
  assert.deepEqual(cap.updates.at(-1), { id: 13, patch: { isActive: true, sortOrder: 3 } }, 'retired RK4-3 comes back, label still valid');
  assert.deepEqual(cap.inserts.map((r) => r.barcode), ['RK4-4']);
  assert.deepEqual(added.body.rack.shelves.map((s) => s.code), ['RK4-1', 'RK4-2', 'RK4-3', 'RK4-4']);
  assert.equal(cap.events.filter((e) => e.eventType === RACK_EVENT.shelvesEdited).length, 2);
});

test('editRackShelves: a code that is not a shelf of this rack is invalid', async () => {
  const { deps } = withRack();
  const out = await editRackShelves(ACTOR, 'RK4', { remove: ['C0101100'], clientEventId: 'evt-sh-4' }, deps);
  assert.ok(!out.ok);
  assert.equal(out.error.code, 'invalid');
});

// ─── Labels printed ─────────────────────────────────────────────────────────

test('recordRackLabelsPrinted: one event with rack id, codes, transport; retry is a no-op', async () => {
  const { deps, cap } = withRack();
  const body = { codes: ['RK4', 'RK4-1'], transport: 'usb', clientEventId: 'evt-print-1' };
  assert.ok((await recordRackLabelsPrinted(ACTOR, 'RK4-1', body, deps)).ok);
  assert.ok((await recordRackLabelsPrinted(ACTOR, 'RK4-1', body, deps)).ok);
  assert.equal(cap.events.length, 1);
  assert.equal(cap.events[0]!.eventType, RACK_EVENT.labelsPrinted);
  assert.deepEqual(cap.events[0]!.payload, { rack_id: 10, rack_code: 'RK4', codes: ['RK4', 'RK4-1'], transport: 'usb', origin: 'phone' });
});

// ─── Adopt (phase 7) ────────────────────────────────────────────────────────

test('parseBayCode: every legacy spelling names the same bay', () => {
  for (const raw of ['C-01-05', 'c-01-05-1', 'C-01-05-1-01', 'C0105101', 'C01051000', 'C0105', '(414)0614141000005(254)C0105101']) {
    assert.deepEqual(parseBayCode(raw), { zone: 'C', aisle: 1, bay: 5 }, raw);
  }
  assert.equal(parseBayCode('RK4-1'), null);
  assert.equal(parseBayCode('nonsense'), null);
});

/** Bay C-01-05: level 1 has a level row + one position; level 2 has only a position. */
function withBay() {
  return fakes([
    ...seed(),
    loc(ORG, 30, 'BIN', 'C0105100', 1, { name: 'C-01-05-1' }),
    loc(ORG, 31, 'BIN', 'C0105101', 1, { name: 'C-01-05-1-01' }),
    loc(ORG, 32, 'BIN', 'C0105201', 1, { name: 'C-01-05-2-01' }),
    loc(ORG, 33, 'BIN', 'C0106100', 1, { name: 'C-01-06-1' }), // the next bay — untouched
  ]);
}

test('adoptBay keepBarcodes: rack in the bay room, rows re-parented as shelf/positions, codes kept', async () => {
  const { deps, cap, rows } = withBay();
  const out = await adoptBay(ACTOR, { bayCode: 'C-01-05', keepBarcodes: true, clientEventId: 'evt-adopt-1' }, deps);
  assert.ok(out.ok && !out.body.dryRun);
  assert.equal(out.status, 201);
  assert.deepEqual(cap.locks, [ORG]);
  assert.deepEqual(
    cap.inserts.map((r) => [r.kind, r.barcode, r.parentId]),
    [
      ['RACK', 'RK1', 1],
      ['SHELF', 'RK1-2', 1000], // level 2 had no level row
    ],
  );
  const byId = (id: number) => rows.find((r) => r.id === id)!;
  assert.deepEqual([byId(30).kind, byId(30).parentId, byId(30).barcode, byId(30).sortOrder], ['SHELF', 1000, 'C0105100', 1]);
  assert.deepEqual([byId(31).kind, byId(31).parentId, byId(31).barcode], ['POSITION', 30, 'C0105101']);
  assert.deepEqual([byId(32).kind, byId(32).parentId, byId(32).barcode], ['POSITION', 1001, 'C0105201']);
  assert.deepEqual(
    [...new Set(cap.updates.filter((u) => [30, 31, 32].includes(u.id) && u.patch.clearLegacyRoom === true).map((u) => u.id))].sort(),
    [30, 31, 32],
    'adopted rows drop the stale legacy room text',
  );
  assert.deepEqual([byId(33).kind, byId(33).parentId], ['BIN', 1], 'the neighbouring bay is untouched');
  assert.deepEqual(cap.repoints, [], 'kept barcodes need no re-pointing');
  assert.deepEqual(out.body.rack.shelves.map((s) => [s.code, s.shelf, s.positions.map((p) => p.code)]), [
    ['C0105100', 1, ['C0105101']],
    ['RK1-2', 2, ['C0105201']],
  ]);
  assert.equal(cap.events.length, 1);
  assert.equal((cap.events[0]!.payload as Record<string, unknown>).bay, 'C-01-05');

  const again = await adoptBay(ACTOR, { bayCode: 'C0105100', keepBarcodes: true, clientEventId: 'evt-adopt-2' }, deps);
  assert.ok(!again.ok);
  assert.equal(again.error.code, 'bay_already_adopted');
});

test('adoptBay re-code: rows become RK<n>-<level>[-<pos>]; text-keyed unit locations re-pointed', async () => {
  const { deps, cap, rows } = withBay();
  const out = await adoptBay(ACTOR, { bayCode: 'C-01-05', keepBarcodes: false, clientEventId: 'evt-adopt-3' }, deps);
  assert.ok(out.ok && !out.body.dryRun);
  const byId = (id: number) => rows.find((r) => r.id === id)!;
  assert.deepEqual([byId(30).barcode, byId(30).name], ['RK1-1', 'Rack 1 Shelf 1']);
  assert.deepEqual([byId(31).barcode, byId(31).name], ['RK1-1-1', 'Rack 1 Shelf 1 Pos 1']);
  assert.deepEqual([byId(32).barcode, byId(32).name], ['RK1-2-1', 'Rack 1 Shelf 2 Pos 1']);
  assert.deepEqual(cap.repoints.map((r) => [r.from, r.to]), [
    [['C0105100', 'C-01-05-1', null], 'RK1-1'],
    [['C0105101', 'C-01-05-1-01', null], 'RK1-1-1'],
    [['C0105201', 'C-01-05-2-01', null], 'RK1-2-1'],
  ]);
});

test('adoptBay dryRun: plans every row and writes nothing; unknown bay is bay_not_found', async () => {
  const { deps, cap } = withBay();
  const out = await adoptBay(ACTOR, { bayCode: 'C-01-05', keepBarcodes: false, dryRun: true, clientEventId: 'evt-adopt-4' }, deps);
  assert.ok(out.ok && out.body.dryRun);
  assert.deepEqual(out.body.planned.shelves, [
    { id: 30, from: 'C0105100', to: 'RK1-1', shelf: 1, position: null },
    { id: 31, from: 'C0105101', to: 'RK1-1-1', shelf: 1, position: 1 },
    { id: null, from: null, to: 'RK1-2', shelf: 2, position: null },
    { id: 32, from: 'C0105201', to: 'RK1-2-1', shelf: 2, position: 1 },
  ]);
  assert.equal(out.body.planned.room?.id, 1);
  assert.deepEqual(cap.inserts, []);
  assert.deepEqual(cap.updates, []);
  assert.deepEqual(cap.events, []);

  const missing = await adoptBay(ACTOR, { bayCode: 'C-09-09', keepBarcodes: true, clientEventId: 'evt-adopt-5' }, deps);
  assert.ok(!missing.ok);
  assert.equal(missing.error.code, 'bay_not_found');
});
