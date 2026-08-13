/**
 * Ship-desk chrome: Add/Import is a split button (not two isolated pills).
 *
 *   node --import tsx --test src/components/dashboard/outbound-order-chrome-actions.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const ACTIONS = readFileSync(join(ROOT, 'src/components/dashboard/OutboundOrderChromeActions.tsx'), 'utf8');
const HEADER = readFileSync(join(ROOT, 'src/components/dashboard/OutboundWorkspaceHeader.tsx'), 'utf8');

describe('OutboundOrderChromeActions — ship split', () => {
  it('To-ship Band 1 mounts the split layout', () => {
    assert.match(HEADER, /layout="split"/);
  });

  it('split face is sentence case (no uppercase tracking shout)', () => {
    assert.match(ACTIONS, /SPLIT_CTA_FACE/);
    const splitFace = ACTIONS.slice(
      ACTIONS.indexOf('const SPLIT_CTA_FACE'),
      ACTIONS.indexOf('export function OutboundOrderChromeActions'),
    );
    assert.doesNotMatch(splitFace, /uppercase/);
    assert.doesNotMatch(splitFace, /tracking-widest/);
  });

  it('split menu names import commands in sentence case', () => {
    assert.match(ACTIONS, /Import from file/);
    assert.match(ACTIONS, /Import latest orders/);
    assert.match(ACTIONS, /Backfill/);
    assert.match(ACTIONS, /<SplitButton/);
  });
});
