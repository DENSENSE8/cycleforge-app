/**
 * Unit tests for TestingStatusPills collapsible collapse/expand wiring.
 * Pure mapping helpers stay covered via existing receive/test flows; this
 * asserts the collapsible API mirrors ConditionPills.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  unitStatusToVerdict,
  verdictToUnitStatus,
  workflowToVerdict,
  type TestingVerdict,
} from '@/components/receiving/workspace/TestingStatusPills';

const SRC = join(process.cwd(), 'src');
const PILLS = readFileSync(
  join(SRC, 'components/receiving/workspace/TestingStatusPills.tsx'),
  'utf8',
);
const SLOTS = readFileSync(
  join(SRC, 'components/tech/TestingUnitSlots.tsx'),
  'utf8',
);

describe('TestingStatusPills verdict mappings', () => {
  it('round-trips unit status ↔ verdict', () => {
    const verdicts: TestingVerdict[] = ['PASS', 'TEST_AGAIN', 'TESTING_FAILED'];
    for (const v of verdicts) {
      assert.equal(unitStatusToVerdict(verdictToUnitStatus(v)), v);
    }
  });

  it('maps workflow statuses for line-level seed', () => {
    assert.equal(workflowToVerdict('PASSED'), 'PASS');
    assert.equal(workflowToVerdict('IN_TEST'), 'TEST_AGAIN');
    assert.equal(workflowToVerdict('FAILED'), 'TESTING_FAILED');
    assert.equal(workflowToVerdict('RECEIVED'), null);
  });
});

describe('TestingStatusPills flush face (ConditionPills parity)', () => {
  it('expanded verdict segments fill equal thirds; collapsed face stays h-11 w-11', () => {
    assert.match(
      PILLS,
      /SEGMENT_FACE[\s\S]{0,200}flex-1/,
      'expanded verdict segments must flex-1 fill the trailing band',
    );
    assert.match(
      PILLS,
      /SEGMENT_FACE[\s\S]{0,200}h-11/,
      'expanded segments stay h-11 flush with condition Tags',
    );
    assert.match(
      PILLS,
      /ICON_FACE[\s\S]{0,200}h-11 w-11/,
      'collapsed selected face stays locked h-11 w-11',
    );
    assert.match(
      PILLS,
      /justify-end gap-0/,
      'collapsed face pins trailing (end) of the fill track',
    );
    assert.match(PILLS, /VERDICT_ICON|Check className|Wrench className/);
    assert.doesNotMatch(
      PILLS,
      /SEGMENT_FACE[\s\S]{0,200}rounded-full/,
      'verdict segments must not reintroduce stadium pills',
    );
    assert.doesNotMatch(
      PILLS,
      /PILL_BASE/,
      'text PILL_BASE retired — icon faces only',
    );
  });

  it('active tones stay flat (shadow-none); Test Again is blue wrench', () => {
    assert.match(PILLS, /shadow-none ring-emerald-700/);
    assert.match(PILLS, /shadow-none ring-blue-700/);
    assert.match(PILLS, /shadow-none ring-rose-700/);
    assert.match(PILLS, /Wrench className/);
    assert.doesNotMatch(
      PILLS,
      /shadow-sm shadow-(emerald|amber|rose|blue)/,
      'verdict active tones must not keep soft drop shadows',
    );
    assert.doesNotMatch(
      PILLS,
      /TEST_AGAIN[\s\S]{0,200}amber/,
      'Test Again must be blue — not amber',
    );
    assert.doesNotMatch(
      PILLS,
      /RotateCcw/,
      'Test Again uses Wrench — not RotateCcw',
    );
  });

  it('collapsed + expanded strips abut (gap-0); expand on hover', () => {
    assert.match(PILLS, /items-stretch gap-0/);
    assert.match(
      PILLS,
      /onMouseEnter=\{openStrip\}/,
      'collapsed verdict face must expand on hover',
    );
    assert.match(
      PILLS,
      /onMouseLeave=\{closeStrip\}/,
      'expanded verdict strip collapses when the pointer leaves',
    );
    assert.doesNotMatch(
      PILLS,
      /gap-1\.5/,
      'verdict strip must not space icon faces',
    );
    assert.doesNotMatch(
      PILLS,
      /-mx-1[\s\S]{0,80}px-1 py-1/,
      'expanded verdict row must not float with outer pad',
    );
  });

  it('TestingLinePanel pins verdict fill-band trailing after Tags', () => {
    assert.match(
      SLOTS,
      /flex w-full min-w-0 items-stretch gap-0/,
      'ConditionVerdictColumns host must span the row',
    );
    assert.match(
      SLOTS,
      /min-w-0 flex-1[\s\S]{0,80}TestingStatusPills/,
      'verdict band must flex-1 fill remaining width after Tags',
    );
    assert.doesNotMatch(
      SLOTS,
      /h-8 w-px shrink-0 bg-surface-sunken/,
      'condition · verdict must not keep a soft gutter divider',
    );
  });
});
