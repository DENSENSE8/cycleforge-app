/**
 * Tripwire — freeze + one-axis print runs.
 *
 * Run: node --import tsx --test src/lib/locations/expand-print-run.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BayLevelRange } from './expand-bay-levels';
import {
  expandOddEvenBayLevelsPrintRun,
  expandPartsDrawersPrintRun,
  expandPrintRun,
  expandRaggedBayLevelsPrintRun,
  seedPrintRunVary,
} from './expand-print-run';

function baySpec(bay: number, levels: number): BayLevelRange {
  return { bay, letter: 'X', levelStart: 1, levelEnd: levels };
}

describe('expandPrintRun', () => {
  it('expands racks 1–16 on C aisle 01 at level 1 position 1', () => {
    const rows = expandPrintRun({
      zone: 'C',
      aisle: 1,
      level: 1,
      vary: 'bay',
      from: 1,
      through: 16,
    });
    assert.equal(rows.length, 16);
    assert.equal(rows[0]?.code, 'C-01-01-1-01');
    assert.equal(rows[15]?.code, 'C-01-16-1-01');
  });

  it('expands levels 1–16 on rack 01 as qty bins', () => {
    const rows = expandPrintRun({
      zone: 'C',
      aisle: 1,
      bay: 1,
      vary: 'level',
      from: 1,
      through: 16,
    });
    assert.equal(rows.length, 16);
    assert.equal(rows[0]?.code, 'C-01-01-1-01');
    assert.equal(rows[15]?.code, 'C-01-01-16-01');
  });

  it('expands positions 1–20 on a frozen level', () => {
    const rows = expandPrintRun({
      zone: 'C',
      aisle: 1,
      bay: 1,
      level: 1,
      vary: 'position',
      from: 1,
      through: 20,
    });
    assert.equal(rows.length, 20);
    assert.equal(rows[0]?.code, 'C-01-01-1-01');
    assert.equal(rows[19]?.code, 'C-01-01-1-20');
  });

  it('expands rack printer levels with position 0', () => {
    const rows = expandPrintRun({
      zone: 'C',
      aisle: 1,
      bay: 1,
      vary: 'level',
      from: 1,
      through: 5,
      rack: true,
    });
    assert.equal(rows.length, 5);
    assert.equal(rows[0]?.code, 'C-01-01-1');
    assert.equal(rows[4]?.code, 'C-01-01-5');
    assert.equal(rows[0]?.segments.position, 0);
  });

  it('expands rack printer bays at a fixed level with position 0', () => {
    const rows = expandPrintRun({
      zone: 'C',
      aisle: 1,
      level: 2,
      vary: 'bay',
      from: 1,
      through: 3,
      rack: true,
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.code, 'C-01-01-2');
    assert.equal(rows[2]?.code, 'C-01-03-2');
    assert.equal(rows[0]?.segments.position, 0);
  });

  it('rejects rack grain when varying position', () => {
    assert.deepEqual(
      expandPrintRun({
        zone: 'C',
        aisle: 1,
        bay: 1,
        level: 1,
        vary: 'position',
        from: 1,
        through: 3,
        rack: true,
      }),
      [],
    );
  });
});

describe('expandPartsDrawersPrintRun', () => {
  it('feeds A1–A4 · B1–B48 as 52 faces', () => {
    const rows = expandPartsDrawersPrintRun({ zone: 'C', aisle: 3 });
    assert.equal(rows.length, 52);
    assert.equal(rows[0]?.code, 'C-03-01-1-01');
    assert.equal(rows[51]?.code, 'C-03-02-48-01');
  });
});

describe('expandOddEvenBayLevelsPrintRun', () => {
  it('expands odd=10 even=6 across bays 1–4 as qty bins', () => {
    const rows = expandOddEvenBayLevelsPrintRun({
      zone: 'C',
      aisle: 1,
      bayFrom: 1,
      bayThrough: 4,
      oddLevels: 10,
      evenLevels: 6,
    });
    // 10 + 6 + 10 + 6
    assert.equal(rows.length, 32);
    assert.equal(rows[0]?.code, 'C-01-01-1-01');
    assert.equal(rows[9]?.code, 'C-01-01-10-01');
    assert.equal(rows[10]?.code, 'C-01-02-1-01');
    assert.equal(rows[15]?.code, 'C-01-02-6-01');
    assert.equal(rows[31]?.code, 'C-01-04-6-01');
  });

  it('expands rack codes with position 0', () => {
    const rows = expandOddEvenBayLevelsPrintRun({
      zone: 'C',
      aisle: 1,
      bayFrom: 1,
      bayThrough: 2,
      oddLevels: 3,
      evenLevels: 2,
      rack: true,
    });
    assert.equal(rows.length, 5);
    assert.equal(rows[0]?.code, 'C-01-01-1');
    assert.equal(rows[2]?.code, 'C-01-01-3');
    assert.equal(rows[3]?.code, 'C-01-02-1');
    assert.equal(rows[4]?.code, 'C-01-02-2');
    assert.equal(rows[0]?.segments.position, 0);
  });
});

describe('seedPrintRunVary', () => {
  it('picks position when level is frozen', () => {
    assert.equal(seedPrintRunVary({ aisle: 1, bay: 1, level: 1 }), 'position');
  });
  it('picks level when rack is frozen', () => {
    assert.equal(seedPrintRunVary({ aisle: 1, bay: 1 }), 'level');
  });
  it('picks bay when only aisle is frozen', () => {
    assert.equal(seedPrintRunVary({ aisle: 1 }), 'bay');
  });
  it('picks level for rack printer', () => {
    assert.equal(seedPrintRunVary({ aisle: 1, bay: 1, rack: true }), 'level');
  });
});

describe('expandRaggedBayLevelsPrintRun', () => {
  it('A1: C aisle 01, bays 1/2/16 at 3,1,2 levels — rack codes, bay then level', () => {
    const rows = expandRaggedBayLevelsPrintRun({
      zone: 'C',
      aisle: 1,
      rack: true,
      bays: [baySpec(16, 2), baySpec(1, 3), baySpec(2, 1)],
    });
    assert.deepEqual(
      rows.map((r) => r.code),
      ['C-01-01-1', 'C-01-01-2', 'C-01-01-3', 'C-01-02-1', 'C-01-16-1', 'C-01-16-2'],
    );
    assert.ok(rows.every((r) => r.segments.position === 0));
  });

  it('A2: rack call does not emit five-part bin codes', () => {
    const rows = expandRaggedBayLevelsPrintRun({
      zone: 'C',
      aisle: 1,
      rack: true,
      bays: [baySpec(1, 1)],
    });
    assert.equal(rows[0]?.code, 'C-01-01-1');
    assert.equal(rows[0]?.code.includes('-01-01-1-'), false);
  });

  it('Labels: same bay matrix at position 1 is five-part', () => {
    const rows = expandRaggedBayLevelsPrintRun({
      zone: 'C',
      aisle: 1,
      position: 1,
      bays: [baySpec(16, 2), baySpec(1, 3), baySpec(2, 1)],
    });
    assert.deepEqual(
      rows.map((r) => r.code),
      [
        'C-01-01-1-01',
        'C-01-01-2-01',
        'C-01-01-3-01',
        'C-01-02-1-01',
        'C-01-16-1-01',
        'C-01-16-2-01',
      ],
    );
    assert.ok(rows.every((r) => r.segments.position === 1));
  });
});
