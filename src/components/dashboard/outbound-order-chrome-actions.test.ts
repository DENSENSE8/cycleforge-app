/**
 * Ship-desk chrome: Add opens the ingest index (not a split dropdown).
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
const DESK = readFileSync(join(ROOT, 'src/components/outbound/orders/OutboundOrdersDesk.tsx'), 'utf8');
const RAIL = readFileSync(join(ROOT, 'src/components/outbound/orders/OrderIngestRail.tsx'), 'utf8');

describe('OutboundOrderChromeActions — ship ingest rail', () => {
  it('To-ship Band 1 mounts the ingest layout (not a split dropdown)', () => {
    assert.match(HEADER, /layout="ingest"/);
    assert.doesNotMatch(HEADER, /layout="split"/);
    assert.doesNotMatch(ACTIONS, /SplitButton/);
  });

  it('ingest Add face is sentence case (no uppercase tracking shout)', () => {
    assert.match(ACTIONS, /INGEST_CTA_FACE/);
    const ingestFace = ACTIONS.slice(
      ACTIONS.indexOf('const INGEST_CTA_FACE'),
      ACTIONS.indexOf('export function OutboundOrderChromeActions'),
    );
    assert.doesNotMatch(ingestFace, /uppercase/);
    assert.doesNotMatch(ingestFace, /tracking-widest/);
  });

  it('ship desk mounts OrderIngestRail over DeskInspectorIndexShell', () => {
    assert.match(DESK, /OrderIngestRail/);
    assert.match(RAIL, /DeskInspectorIndexShell/);
    assert.match(RAIL, /Add order manually/);
    assert.match(RAIL, /Add from platform/);
    assert.match(RAIL, /Import from file/);
    assert.match(RAIL, /Import latest orders/);
    assert.match(RAIL, /Backfill/);
    assert.match(RAIL, /SearchableSelectField/);
    assert.match(RAIL, /modal=\{false\}/);
  });
});
