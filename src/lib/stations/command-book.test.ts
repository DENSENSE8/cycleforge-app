import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildCommandBook, listCommandBookEntries } from './command-book';
import { NAV_COMMAND_CODES, parseNavCommand } from './nav-command-codes';
import { ACTION_COMMAND_CODES, parseActionCommand } from './action-command-codes';
import { STATION_COMMAND_CODES, parseStationCommand } from './station-command-codes';

describe('command-book', () => {
  it('prints every registered code and nothing else', () => {
    // A book that drifts from the parser teaches an operator a code the app
    // will refuse — a laminated page that lies.
    const printed = listCommandBookEntries().map((e) => e.code).sort();
    const registered = [
      ...NAV_COMMAND_CODES,
      ...ACTION_COMMAND_CODES,
      ...STATION_COMMAND_CODES,
    ].map((c) => c.code).sort();
    assert.deepEqual(printed, registered);
  });

  it('every printed code actually parses', () => {
    for (const entry of listCommandBookEntries()) {
      const hit =
        parseNavCommand(entry.code) ??
        parseActionCommand(entry.code) ??
        parseStationCommand(entry.code);
      assert.ok(hit, entry.code);
    }
  });

  it('marks exactly the action family as writing', () => {
    // The book's warning treatment keys off `writes`. A move code shown as
    // dangerous trains operators to ignore the warning; a write shown as safe
    // is worse.
    for (const entry of listCommandBookEntries()) {
      assert.equal(entry.writes, entry.family === 'act', entry.code);
    }
  });

  it('names the destination of a compound in its effect line', () => {
    const compound = listCommandBookEntries().find((e) => e.code === 'CMD-PASS-GO-READY');
    assert.ok(compound);
    assert.match(compound!.effect, /Record PASS/);
    assert.match(compound!.effect, /Ready to Pack/);
  });

  it('orders each section by the registry sort order', () => {
    for (const section of buildCommandBook()) {
      const order = section.entries.map((e) => e.sortOrder);
      assert.deepEqual(order, [...order].sort((a, b) => a - b), section.family);
    }
  });

  it('has no duplicate code across families', () => {
    const codes = listCommandBookEntries().map((e) => e.code);
    assert.equal(new Set(codes).size, codes.length);
  });
});
