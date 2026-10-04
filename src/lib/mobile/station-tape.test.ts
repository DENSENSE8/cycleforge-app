import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pushStationTape,
  stationDedupeId,
  stationDedupeKey,
  STATION_TAPE_LIMIT,
  type StationTapeEntry,
} from './station-tape';

const AT = new Date(Date.UTC(2026, 8, 4, 17, 0, 0)).toISOString();

const row = (over: Partial<StationTapeEntry>): StationTapeEntry => ({
  id: 'e0',
  tone: 'ok',
  verb: 'Done',
  title: 'A thing',
  identifier: '1Z999AA10123456784',
  meta: [],
  message: null,
  at: AT,
  dedupeKey: null,
  ...over,
});

describe('pushStationTape', () => {
  it('puts the newest entry at the head', () => {
    const tape = pushStationTape([row({ id: 'a' })], row({ id: 'b' }));
    assert.deepEqual(tape.map((e) => e.id), ['b', 'a']);
  });

  it('collapses an earlier entry with the same dedupe key', () => {
    const tape = pushStationTape(
      [row({ id: 'a', dedupeKey: 'shipment:7' }), row({ id: 'z', dedupeKey: 'shipment:3' })],
      row({ id: 'b', dedupeKey: 'shipment:7', tone: 'warn' }),
    );
    assert.equal(tape.length, 2);
    assert.equal(tape[0].id, 'b');
    assert.equal(tape[0].tone, 'warn');
    assert.equal(tape[1].dedupeKey, 'shipment:3');
  });

  it('never collapses keyless entries into each other', () => {
    // Two things that resolved to nothing are two separate problems; merging
    // them would hide one.
    const tape = pushStationTape([row({ id: 'a' })], row({ id: 'b' }));
    assert.equal(tape.length, 2);
  });

  it('replaces an entry re-pushed under its own id', () => {
    const tape = pushStationTape([row({ id: 'a', tone: 'ok' })], row({ id: 'a', tone: 'bad' }));
    assert.equal(tape.length, 1);
    assert.equal(tape[0].tone, 'bad');
  });

  it('caps at the limit, dropping the oldest', () => {
    let tape: StationTapeEntry[] = [];
    for (let i = 0; i < STATION_TAPE_LIMIT + 5; i += 1) {
      tape = pushStationTape(tape, row({ id: `e${i}`, dedupeKey: `shipment:${i}` }));
    }
    assert.equal(tape.length, STATION_TAPE_LIMIT);
    assert.equal(tape[0].id, `e${STATION_TAPE_LIMIT + 4}`);
    assert.equal(tape[tape.length - 1].id, `e${5}`);
  });

  it('does not mutate the tape it was given', () => {
    const before = [row({ id: 'a' })];
    const copy = [...before];
    pushStationTape(before, row({ id: 'b' }));
    assert.deepEqual(before, copy);
  });
});

describe('stationDedupeKey / stationDedupeId', () => {
  it('round-trips a real id', () => {
    const key = stationDedupeKey('shipment', 7);
    assert.equal(key, 'shipment:7');
    assert.equal(stationDedupeId('shipment', key), 7);
  });

  it('refuses ids that cannot identify anything', () => {
    for (const bad of [null, undefined, 0, -1, Number.NaN]) {
      assert.equal(stationDedupeKey('shipment', bad as number), null);
    }
  });

  it('refuses to read a key from another namespace', () => {
    // The failure this prevents: `Number(key.replace('shipment:',''))` on a
    // carton key returned NaN silently, and the row simply stopped offering
    // its action with no way to tell why.
    assert.equal(stationDedupeId('shipment', 'carton:7'), null);
    assert.equal(stationDedupeId('shipment', 'shipment:abc'), null);
    assert.equal(stationDedupeId('shipment', null), null);
  });
});
