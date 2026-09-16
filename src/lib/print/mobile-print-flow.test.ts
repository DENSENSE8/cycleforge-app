/**
 * Tripwire — mobile print procedure steps.
 *
 * Run: node --import tsx --test src/lib/print/mobile-print-flow.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mobilePrintStepIndex,
  nextMobilePrintStep,
  parseMobilePrintStep,
  prevMobilePrintStep,
} from './mobile-print-flow';

describe('mobile print steps', () => {
  it('puts printer before the display ladder, and Print last', () => {
    assert.equal(parseMobilePrintStep('nope'), 'job');
    assert.equal(nextMobilePrintStep('job', 'rack'), 'options');
    assert.equal(nextMobilePrintStep('options', 'bin'), 'room');
    assert.equal(nextMobilePrintStep('preview', 'rack'), 'ack');
    assert.equal(nextMobilePrintStep('ack', 'rack'), 'print');
    assert.equal(nextMobilePrintStep('print', 'rack'), null);
    assert.equal(prevMobilePrintStep('room', 'rack'), 'options');
    assert.equal(prevMobilePrintStep('options', 'bin'), 'job');
  });

  it('a tote run skips the location ladder entirely', () => {
    // A tote has no zone/aisle/bay to build — its code is a DB serial, so the
    // only question between Options and Preview is how many.
    assert.equal(nextMobilePrintStep('options', 'tote'), 'count');
    assert.equal(nextMobilePrintStep('count', 'tote'), 'preview');
    assert.equal(prevMobilePrintStep('preview', 'tote'), 'count');
    assert.equal(nextMobilePrintStep('print', 'tote'), null);
  });

  it('count belongs to totes and the ladder belongs to locations', () => {
    // The two rails must not leak into each other: a bin run that lands on
    // `count` would ask for a quantity it has no way to print.
    assert.equal(nextMobilePrintStep('options', 'bin'), 'room');
    assert.equal(mobilePrintStepIndex('count', 'bin'), -1);
    assert.equal(mobilePrintStepIndex('room', 'tote'), -1);
  });
});
