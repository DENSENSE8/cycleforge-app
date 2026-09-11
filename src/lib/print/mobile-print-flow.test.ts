/**
 * Tripwire — mobile print procedure steps.
 *
 * Run: node --import tsx --test src/lib/print/mobile-print-flow.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
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
});
