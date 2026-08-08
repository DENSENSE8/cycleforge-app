/**
 * Guard — Arrival · Unbox Band-1 box CTAs share ReceivingBoxChromeActions
 * (Check · Add · resume). Add stays between Check and the station resume CTA.
 *
 * Run: node --import tsx --test src/components/receiving/receiving-box-chrome-actions.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('ReceivingBoxChromeActions', () => {
  it('orders Check → Add → resume (Add between Check and station CTA)', () => {
    const src = read('src/components/receiving/ReceivingBoxChromeActions.tsx');
    const check = src.indexOf('data-testid="receiving-box-check"');
    const add = src.indexOf('data-testid="receiving-box-add"');
    const resume = src.indexOf('data-testid="receiving-box-resume"');
    assert.ok(check >= 0 && add > check && resume > add, 'Check then Add then resume');
  });

  it('Unbox + Arrival compose the SoT; Testing / Pack do not', () => {
    const unbox = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    const arrival = read('src/components/receiving/triage/TriageWorkspaceHeader.tsx');
    assert.match(unbox, /ReceivingBoxChromeActions/);
    assert.match(arrival, /ReceivingBoxChromeActions/);
    assert.match(unbox, /IncomingAddInboundOverlay/);
    assert.match(arrival, /IncomingAddInboundOverlay/);
    assert.doesNotMatch(unbox, /IncomingChromeActions/);
    assert.doesNotMatch(arrival, /IncomingChromeActions/);

    const testing = read('src/components/tech/testing/TestingWorkspaceHeader.tsx');
    const packer = read('src/components/packer/PackWorkspaceHeader.tsx');
    assert.doesNotMatch(testing, /ReceivingBoxChromeActions/);
    assert.doesNotMatch(packer, /ReceivingBoxChromeActions/);
  });
});
