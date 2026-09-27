/**
 * Tripwire — staff print bridge wire parse + station targeting.
 *
 * Run: node --import tsx --test src/lib/print/staff-print-bridge.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STAFF_PRINT_STATION_STALE_MS,
  UNNAMED_PRINT_STATION,
  parseStaffPrintJob,
  parseStaffPrintOptionsPatch,
  parseStaffPrintStatus,
  resolveStaffPrintTarget,
  roleReady,
  staffPrintBlockedReason,
  decideStaffPrintAutoSend,
  NO_PRINT_STATION_ONLINE,
  thisDeviceCanFulfillPrintJob,
  upsertStaffPrintStation,
  type StaffPrintStatus,
} from './staff-print-bridge';

const BENCH = 'ps_bench_a';
const PACK = 'ps_pack_1';

function status(stationId: string, over: Record<string, unknown> = {}): StaffPrintStatus {
  const parsed = parseStaffPrintStatus({
    stationId,
    stationName: stationId === BENCH ? 'Bench A' : 'Pack 1',
    silent: true,
    label: { ready: true, name: 'TSC', kind: 'usb', profileId: 'p1' },
    paper: { ready: false, name: null, kind: null },
    profiles: [{ id: 'p1', name: 'TSC', role: 'label', kind: 'usb' }],
    ...over,
  });
  assert.ok(parsed);
  return parsed;
}

describe('parseStaffPrintJob', () => {
  it('accepts a targeted rack location job', () => {
    const job = parseStaffPrintJob({
      request_id: 'req-1',
      targetStationId: BENCH,
      grain: 'rack',
      role: 'label',
      location: {
        roomName: 'Zone 3 - Parts',
        gln: '123',
        segments: [{ zone: 'C', aisle: 1, bay: 1, level: 1, position: 0 }],
      },
    });
    assert.equal(job?.targetStationId, BENCH);
    assert.equal(job?.location?.segments[0]?.zone, 'C');
    assert.equal(job?.location?.segments[0]?.position, 0);
  });

  it('treats a job with no target station as junk — it would print on every computer', () => {
    const base = {
      request_id: 'req-2',
      grain: 'papers',
      papers: { orderRowIds: [44], packerLogId: null, reprint: true },
    };
    assert.equal(parseStaffPrintJob(base), null);
    assert.equal(parseStaffPrintJob({ ...base, targetStationId: '' }), null);
    assert.equal(parseStaffPrintJob({ ...base, targetStationId: '   ' }), null);
    assert.deepEqual(parseStaffPrintJob({ ...base, targetStationId: PACK })?.papers?.orderRowIds, [44]);
  });

  it('a bulk papers job keeps its orders and the papers asked for, and refuses a runaway or junk list', () => {
    const base = { request_id: 'req-3', targetStationId: PACK, grain: 'papers' };
    const job = parseStaffPrintJob({
      ...base,
      papers: { orderRowIds: [7, 8, 7], packerLogId: 99, documents: ['packing_slip'], batchId: 'print-abc12345' },
    });
    assert.deepEqual(job?.papers, {
      orderRowIds: [7, 8],
      // A pack id belongs to one order; a bulk job never carries it.
      packerLogId: null,
      reprint: false,
      documents: ['packing_slip'],
      batchId: 'print-abc12345',
    });
    const many = Array.from({ length: 26 }, (_, i) => i + 1);
    assert.equal(parseStaffPrintJob({ ...base, papers: { orderRowIds: many, packerLogId: null } }), null);
    assert.equal(parseStaffPrintJob({ ...base, papers: { orderRowIds: [], packerLogId: null } }), null);
    assert.equal(parseStaffPrintJob({ ...base, papers: { orderRowIds: [1.5], packerLogId: null } }), null);
    assert.equal(
      parseStaffPrintJob({ ...base, papers: { orderRowIds: [1], packerLogId: null, documents: ['invoice'] } }),
      null,
    );
  });

  it('rejects empty segments', () => {
    assert.equal(
      parseStaffPrintJob({
        request_id: 'req-1',
        targetStationId: BENCH,
        grain: 'bin',
        location: { roomName: 'Cage', gln: '', segments: [] },
      }),
      null,
    );
  });

  it('derives a repair job role from the document, not the sender', () => {
    const receipt = parseStaffPrintJob({
      request_id: 'req-3',
      targetStationId: BENCH,
      grain: 'repair',
      role: 'label',
      repair: { repairId: 4799, document: 'receipt' },
    });
    assert.equal(receipt?.role, 'paper');
    assert.deepEqual(receipt?.repair, { repairId: 4799, document: 'receipt' });
    const label = parseStaffPrintJob({
      request_id: 'req-4',
      targetStationId: BENCH,
      grain: 'repair',
      role: 'paper',
      repair: { repairId: 4799, document: 'label', manualId: 9 },
    });
    assert.equal(label?.role, 'label');
    assert.deepEqual(label?.repair, { repairId: 4799, document: 'label' });
  });

  it('rejects repair jobs without a repair anchor or a manual id', () => {
    const base = { request_id: 'req-5', targetStationId: BENCH, grain: 'repair' };
    assert.equal(parseStaffPrintJob({ ...base, repair: { repairId: 0, document: 'receipt' } }), null);
    assert.equal(parseStaffPrintJob({ ...base, repair: { repairId: 12.5, document: 'label' } }), null);
    assert.equal(parseStaffPrintJob({ ...base, repair: { repairId: 1, document: 'invoice' } }), null);
    assert.equal(parseStaffPrintJob({ ...base, repair: { repairId: 1, document: 'manual' } }), null);
    assert.equal(
      parseStaffPrintJob({ ...base, repair: { repairId: 1, document: 'manual', manualId: 7 } })?.repair?.manualId,
      7,
    );
  });

  it('an FNSKU job is always a label job carrying one catalog key', () => {
    const base = { request_id: 'req-6', targetStationId: BENCH, grain: 'fnsku' };
    const job = parseStaffPrintJob({ ...base, role: 'paper', fnsku: { fnsku: ' x002lxygwn ' } });
    assert.equal(job?.role, 'label');
    assert.deepEqual(job?.fnsku, { fnsku: 'X002LXYGWN', copies: 1 });
    assert.equal(parseStaffPrintJob({ ...base, fnsku: { fnsku: '' } }), null);
    assert.equal(parseStaffPrintJob({ ...base, fnsku: { fnsku: 'X00/../../x' } }), null);
    assert.equal(parseStaffPrintJob(base), null);
  });

  it('an FNSKU job carries 1..99 stickers — clamped, never refused', () => {
    const base = { request_id: 'req-7', targetStationId: BENCH, grain: 'fnsku' };
    const copiesOf = (copies: unknown) => parseStaffPrintJob({ ...base, fnsku: { fnsku: 'X004O69DL9', copies } })?.fnsku?.copies;
    assert.equal(copiesOf(3), 3);
    assert.equal(copiesOf('12'), 12);
    assert.equal(copiesOf(99), 99);
    assert.equal(copiesOf(100), 99);
    assert.equal(copiesOf(5000), 99);
    assert.equal(copiesOf(0), 1);
    assert.equal(copiesOf(-4), 1);
    assert.equal(copiesOf(undefined), 1);
    assert.equal(copiesOf('lots'), 1);
  });
});

describe('parseStaffPrintStatus', () => {
  it('drops a status with no station id — it cannot be picked or targeted', () => {
    assert.equal(
      parseStaffPrintStatus({
        silent: true,
        label: { ready: true, name: 'TSC', kind: 'usb' },
        paper: { ready: false, name: null, kind: null },
      }),
      null,
    );
  });

  it('names an unnamed station rather than showing a blank row', () => {
    assert.equal(status(BENCH, { stationName: '  ' }).stationName, UNNAMED_PRINT_STATION);
  });
});

describe('parseStaffPrintOptionsPatch', () => {
  it('refuses an untargeted patch — routing is per station', () => {
    assert.equal(parseStaffPrintOptionsPatch({ routing: { label: 'p1' } }), null);
    assert.deepEqual(parseStaffPrintOptionsPatch({ targetStationId: BENCH, routing: { label: 'p1' } }), {
      type: 'staff.print_options_patch',
      targetStationId: BENCH,
      routing: { label: 'p1' },
    });
  });
});

describe('roleReady', () => {
  it('requires silent + that role paired', () => {
    const bench = status(BENCH);
    assert.equal(roleReady(bench, 'label'), true);
    assert.equal(roleReady(bench, 'paper'), false);
    assert.equal(roleReady({ ...bench, silent: false }, 'label'), false);
  });
});

describe('thisDeviceCanFulfillPrintJob', () => {
  it('fulfils only when the job targets this station and the role is ready', () => {
    const bench = status(BENCH);
    const pack = status(PACK);
    assert.equal(thisDeviceCanFulfillPrintJob({ grain: 'rack', targetStationId: BENCH }, bench), true);
    // Same staffer, same ready printer — but not the station the phone picked.
    assert.equal(thisDeviceCanFulfillPrintJob({ grain: 'rack', targetStationId: BENCH }, pack), false);
    assert.equal(thisDeviceCanFulfillPrintJob({ grain: 'papers', targetStationId: BENCH }, bench), false);
    assert.equal(
      thisDeviceCanFulfillPrintJob({ grain: 'repair', role: 'label', targetStationId: BENCH }, bench),
      true,
    );
    assert.equal(
      thisDeviceCanFulfillPrintJob({ grain: 'repair', role: 'paper', targetStationId: BENCH }, bench),
      false,
    );
  });
});

describe('station roster', () => {
  const now = 1_000_000;

  it('lists paired stations once each, by name, and leaves out hosts with nothing paired', () => {
    const phone = status('ps_phone', {
      label: { ready: false, name: null, kind: null },
      paper: { ready: false, name: null, kind: null },
      profiles: [],
    });
    let roster = upsertStaffPrintStation([], status(PACK), now);
    roster = upsertStaffPrintStation(roster, status(BENCH), now);
    roster = upsertStaffPrintStation(roster, status(BENCH), now + 5);
    roster = upsertStaffPrintStation(roster, phone, now + 5);
    assert.deepEqual(
      roster.map((s) => [s.status.stationName, s.lastSeenAt]),
      [
        ['Bench A', now + 5],
        ['Pack 1', now],
      ],
    );
  });

  it('sends to the remembered pick, else the only live station, else nowhere', () => {
    const bench = { status: status(BENCH), lastSeenAt: now };
    const pack = { status: status(PACK), lastSeenAt: now };
    const stalePack = { status: status(PACK), lastSeenAt: now - STAFF_PRINT_STATION_STALE_MS - 1 };
    assert.equal(resolveStaffPrintTarget([bench, pack], PACK, now), pack);
    assert.equal(resolveStaffPrintTarget([bench, pack], null, now), null);
    assert.equal(resolveStaffPrintTarget([bench, pack], 'ps_gone', now), null);
    assert.equal(resolveStaffPrintTarget([bench, stalePack], null, now), bench);
    // An offline pick is kept and reported, never swapped for another computer.
    assert.equal(resolveStaffPrintTarget([bench, stalePack], PACK, now), stalePack);
    // Its label printer is ready, but it is not answering: blocked.
    assert.notEqual(staffPrintBlockedReason(stalePack, 'label', now), null);
  });

  it('blocks a role the picked station cannot print', () => {
    const bench = { status: status(BENCH), lastSeenAt: now };
    assert.equal(staffPrintBlockedReason(bench, 'label', now), null);
    assert.notEqual(staffPrintBlockedReason(bench, 'paper', now), null);
    assert.notEqual(staffPrintBlockedReason(null, 'label', now), null);
  });
});

describe('decideStaffPrintAutoSend', () => {
  const now = 1_000_000;
  const bench = { status: status(BENCH), lastSeenAt: now };
  const pack = { status: status(PACK), lastSeenAt: now };
  const decide = (stations: (typeof bench)[], rememberedId: string | null, settled: boolean) =>
    decideStaffPrintAutoSend({ stations, rememberedId, role: 'label', now, settled });

  it('sends to the remembered pick the moment it answers ready', () => {
    assert.deepEqual(decide([bench, pack], PACK, false), { kind: 'send', station: pack });
  });

  it('waits for the whole roster before trusting a lone reply', () => {
    // One station has answered so far; another may still be answering.
    assert.equal(decide([bench], null, false).kind, 'wait');
    assert.deepEqual(decide([bench], null, true), { kind: 'send', station: bench });
  });

  it('never swaps a silent remembered pick for the only other live station', () => {
    assert.equal(decide([bench], PACK, false).kind, 'wait');
    assert.equal(decide([bench], PACK, true).kind, 'pick');
  });

  it('asks the operator to pick when several stations are live and none is remembered', () => {
    assert.equal(decide([bench, pack], null, true).kind, 'pick');
  });

  it('fails when no station is online or none can print labels', () => {
    assert.deepEqual(decide([], null, true), { kind: 'fail', reason: NO_PRINT_STATION_ONLINE });
    const paperOnly = {
      status: status(PACK, { label: { ready: false, name: null, kind: null }, paper: { ready: true, name: 'HP', kind: 'os' } }),
      lastSeenAt: now,
    };
    assert.deepEqual(decide([paperOnly], PACK, true), { kind: 'fail', reason: 'Pack 1 has no label printer set up.' });
  });

  it('keeps a picked station that cannot print labels as the reason to pick another', () => {
    const paperOnly = {
      status: status(PACK, { label: { ready: false, name: null, kind: null }, paper: { ready: true, name: 'HP', kind: 'os' } }),
      lastSeenAt: now,
    };
    assert.deepEqual(decide([bench, paperOnly], PACK, true), { kind: 'pick', reason: 'Pack 1 has no label printer set up.' });
  });
});
