/**
 * Guard: the WorkStatus presentation SoT is complete — label, tone AND dot.
 *
 *   npx tsx --test src/lib/work-orders/work-status-display.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WorkStatus } from '@/lib/work-orders/types';
import {
  workStatusChipClass,
  workStatusDot,
  workStatusLabel,
} from './work-status-display';

const ALL: WorkStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELED'];

describe('work-status-display', () => {
  it('answers all three presentation kinds for every status', () => {
    // The module docblock promised "label · tone · dot" while shipping only the
    // first two, so consumers rendered dotless chips next to Receiving's
    // dot · chip. A missing half of an SoT is why two surfaces diverge.
    for (const status of ALL) {
      assert.ok(workStatusLabel(status), `${status} label`);
      assert.ok(workStatusChipClass(status), `${status} chip`);
      assert.ok(workStatusDot(status), `${status} dot`);
    }
  });

  it('distinguishes every status — no two read identically', () => {
    // The bug that created this module: CANCELED and IN_PROGRESS painted the
    // same blue chip, so two opposite outcomes looked alike.
    const faces = ALL.map((s) => `${workStatusLabel(s)}|${workStatusChipClass(s)}`);
    assert.equal(new Set(faces).size, ALL.length);
  });

  it('the dot is a FILL only — the dot has no text or ring of its own', () => {
    for (const status of ALL) {
      const dot = workStatusDot(status);
      assert.ok(dot.startsWith('bg-'), `${status} dot is a fill: ${dot}`);
      assert.ok(!/\btext-|\bring-/.test(dot), `${status} dot carries no ink/ring`);
    }
  });

  it('falls back to OPEN for an unknown or absent status', () => {
    for (const bad of [null, undefined, '', 'NOPE']) {
      assert.equal(workStatusChipClass(bad), workStatusChipClass('OPEN'));
      assert.equal(workStatusDot(bad), workStatusDot('OPEN'));
    }
    assert.equal(workStatusLabel('NOPE'), null, 'an unknown status has no label to invent');
  });
});
