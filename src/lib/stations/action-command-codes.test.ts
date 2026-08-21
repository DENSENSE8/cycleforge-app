import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTION_COMMAND_CODES,
  listActionCommands,
  parseActionCommand,
} from './action-command-codes';
import { NAV_COMMAND_CODES, parseNavCommand, squashCommandCode } from './nav-command-codes';
import { detectStationScanType, getStationInputMode } from '../station-scan-routing';

describe('action-command-codes', () => {
  it('parses every registered code, including mangled forms', () => {
    for (const def of ACTION_COMMAND_CODES) {
      assert.equal(parseActionCommand(def.code)?.code, def.code);
      assert.equal(parseActionCommand(squashCommandCode(def.code))?.code, def.code);
      assert.equal(parseActionCommand(def.code.toLowerCase())?.code, def.code);
    }
  });

  it('every `thenGo` names a REGISTERED nav command', () => {
    // A compound that pointed at a code nobody registered would write the
    // verdict and then silently not move — the half-failure that is hardest to
    // notice at a bench.
    for (const def of ACTION_COMMAND_CODES) {
      if (!def.thenGo) continue;
      assert.ok(parseNavCommand(def.thenGo), `${def.code} → ${def.thenGo}`);
    }
  });

  it('a failing verdict requires the fail permission, never the pass floor', () => {
    // A pass-only tech must not reach a hold-inducing verdict with a sticker
    // they could not reach with the button.
    for (const def of ACTION_COMMAND_CODES) {
      if (def.verdict === 'TESTING_FAILED') {
        assert.equal(def.requires, 'tech.qc_fail', def.code);
      }
    }
  });

  it('shares no code with the nav family', () => {
    const nav = new Set(NAV_COMMAND_CODES.map((c) => squashCommandCode(c.code)));
    for (const def of ACTION_COMMAND_CODES) {
      assert.equal(nav.has(squashCommandCode(def.code)), false, def.code);
    }
  });

  it('a compound never collides with the plain jump it ends on', () => {
    // `CMD-PASS-GO-READY` and `CMD-GO-READY` must stay distinguishable after
    // squashing, or a compound sticker read on a mangling wedge would navigate
    // without writing.
    for (const def of ACTION_COMMAND_CODES) {
      assert.equal(parseNavCommand(def.code), null, def.code);
    }
    for (const def of NAV_COMMAND_CODES) {
      assert.equal(parseActionCommand(def.code), null, def.code);
    }
  });

  it('lists in sticker-sheet order', () => {
    const order = listActionCommands().map((c) => c.sortOrder);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });
});

describe('detectStationScanType — action family', () => {
  it('types an action / compound sticker ACTION', () => {
    assert.equal(detectStationScanType('CMD-PASS'), 'ACTION');
    assert.equal(detectStationScanType('CMD-PASS-GO-READY'), 'ACTION');
    assert.equal(detectStationScanType('CMD-FAIL-GO-REPAIR'), 'ACTION');
    assert.equal(detectStationScanType('cmdpassgoready'), 'ACTION');
  });

  it('keeps a plain jump on NAV', () => {
    assert.equal(detectStationScanType('CMD-GO-READY'), 'NAV');
  });

  it('puts an action on the non-persisting input lane', () => {
    assert.equal(getStationInputMode('CMD-PASS-GO-READY'), 'tracking');
  });
});
