import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  NAV_COMMAND_CODES,
  isCommandNamespace,
  listNavCommands,
  parseNavCommand,
  squashCommandCode,
} from './nav-command-codes';
import { detectStationScanType, getStationInputMode } from '../station-scan-routing';
import { STATION_COMMAND_CODES } from './station-command-codes';

describe('nav-command-codes', () => {
  it('parses every registered code exactly', () => {
    for (const def of NAV_COMMAND_CODES) {
      assert.equal(parseNavCommand(def.code)?.code, def.code);
    }
  });

  it('parses the country-mangled and lower-cased forms of every code', () => {
    // An HID wedge on the wrong keyboard layout drops every separator and upper-cases the rest — the same failure `FLATTENED_MOBILE_LINK_RE`…
    for (const def of NAV_COMMAND_CODES) {
      const squashed = squashCommandCode(def.code);
      assert.equal(parseNavCommand(squashed)?.code, def.code, squashed);
      assert.equal(parseNavCommand(def.code.toLowerCase())?.code, def.code);
      assert.equal(parseNavCommand(`  ${def.code}  `)?.code, def.code);
    }
  });

  it('returns null for a non-command', () => {
    for (const value of ['1Z999AA10123456784', 'CN1A2B3XYZ', 'R-51189', '']) {
      assert.equal(parseNavCommand(value), null, value);
    }
  });

  it('claims the CMD- namespace but not a serial that merely starts CMD', () => {
    assert.equal(isCommandNamespace('CMD-GO-QC'), true);
    assert.equal(isCommandNamespace('CMD-BATCH-SORT'), true);
    assert.equal(isCommandNamespace('CMD-NOT-REGISTERED'), true);
    assert.equal(isCommandNamespace('CMDGOQC'), true);
    // A manufacturer serial is NOT a command. Trading a missed sticker for a
    // swallowed serial is not a fix.
    assert.equal(isCommandNamespace('CMD1234ABC'), false);
    assert.equal(isCommandNamespace('CMDX9'), false);
  });

  it('has unique codes across both command families', () => {
    const all = [
      ...NAV_COMMAND_CODES.map((c) => c.code),
      ...STATION_COMMAND_CODES.map((c) => c.code),
    ].map(squashCommandCode);
    assert.equal(new Set(all).size, all.length, 'duplicate command code');
  });

  it('lists in sticker-sheet order', () => {
    const order = listNavCommands().map((c) => c.sortOrder);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  });
});

describe('detectStationScanType — command precedence', () => {
  it('types a registered nav command NAV', () => {
    assert.equal(detectStationScanType('CMD-GO-QC'), 'NAV');
    assert.equal(detectStationScanType('CMD-GO-READY'), 'NAV');
    assert.equal(detectStationScanType('cmdgoready'), 'NAV');
  });

  it('types an UNREGISTERED CMD-* as COMMAND, never SERIAL', () => {
    // This is the whole reason the namespace is claimed wholesale: a command we
    // cannot act on must be nacked, not written into `tech_serial_numbers` as a
    // unit identity.
    assert.equal(detectStationScanType('CMD-BATCH-SORT'), 'COMMAND');
    assert.equal(detectStationScanType('CMD-GO-NOWHERE'), 'COMMAND');
  });

  it('leaves every non-command classification unchanged', () => {
    assert.equal(detectStationScanType('CN1A2B3XYZ'), 'SERIAL');
    assert.equal(detectStationScanType('R-51189'), 'HANDLE');
    assert.equal(detectStationScanType('RS-42'), 'REPAIR');
    assert.equal(detectStationScanType('12345:HP-PSU'), 'SKU');
    assert.equal(detectStationScanType('1Z999AA10123456784'), 'TRACKING');
  });

  it('puts a command on the non-persisting input lane', () => {
    // `serial` is the lane that writes an identity. A command must never ride it.
    assert.equal(getStationInputMode('CMD-GO-QC'), 'tracking');
    assert.equal(getStationInputMode('CMD-BATCH-SORT'), 'tracking');
  });
});
