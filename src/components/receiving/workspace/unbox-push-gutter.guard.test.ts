/**
 * Station canvas gutter twins — keep bookmark / rail / Unbox push on one top edge.
 *
 * SoT:
 *   - `CONTEXT_PANEL_OUTER_MARGIN` (`m-2`) — left context-panel card
 *   - `CONTEXT_PANEL_OUTER_MARGIN_Y` (`my-2`) — Unbox push vertical when trailing is host `pr-2`
 *   - `STATION_BOOKMARK_CANVAS_INSET_TOP` (`top-2`) — StationContextBar / more-details
 *   - `TICKET_PUSH_HOST_PAD_CLASS` (`pr-2`) — trailing only; never `py-*`
 *
 * Host `py-2` stacks under the absolute identity `top-2` and drops carton
 * context below the sidebar (16px vs 8px). Guard that regression.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/unbox-push-gutter.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONTEXT_PANEL_OUTER_MARGIN,
  CONTEXT_PANEL_OUTER_MARGIN_Y,
} from '@/components/sidebar/context-panel-column';
import {
  STATION_BOOKMARK_CANVAS_INSET_RIGHT,
  STATION_BOOKMARK_CANVAS_INSET_TOP,
  stationContextBarHostClass,
  stationMoreDetailsPaneHostClass,
} from '@/components/station/entity-context/station-bookmark';
import { TICKET_PUSH_HOST_PAD_CLASS } from './ReceivingTicketStack';

const ROOT = resolve(import.meta.dirname, '../../../..');

function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('Station canvas gutter — top-padding SoT twins', () => {
  it('context-panel margin is the 8px m-2 SoT', () => {
    assert.equal(CONTEXT_PANEL_OUTER_MARGIN, 'm-2');
    assert.equal(CONTEXT_PANEL_OUTER_MARGIN_Y, 'my-2');
  });

  it('station bookmark insets are the top/right twins of that 8px', () => {
    assert.equal(STATION_BOOKMARK_CANVAS_INSET_TOP, 'top-2');
    assert.equal(STATION_BOOKMARK_CANVAS_INSET_RIGHT, 'right-2');
    assert.ok(
      stationContextBarHostClass.includes(STATION_BOOKMARK_CANVAS_INSET_TOP),
      'StationContextBar host must compose STATION_BOOKMARK_CANVAS_INSET_TOP',
    );
    assert.ok(
      stationMoreDetailsPaneHostClass.includes(STATION_BOOKMARK_CANVAS_INSET_TOP),
      'pane more-details must compose the same top inset',
    );
  });

  it('host pad is trailing-only (never py-*)', () => {
    assert.equal(TICKET_PUSH_HOST_PAD_CLASS, 'pr-2');
    assert.equal(
      /\bpy-/.test(TICKET_PUSH_HOST_PAD_CLASS),
      false,
      'vertical host pad stacks under StationContextBar top-2',
    );
  });

  it('UnboxPushColumn composes the vertical SoT twin', () => {
    const src = code('src/components/receiving/workspace/UnboxPushColumn.tsx');
    assert.ok(
      src.includes('CONTEXT_PANEL_OUTER_MARGIN_Y'),
      'wide push column must use CONTEXT_PANEL_OUTER_MARGIN_Y (not a raw my-2 fork)',
    );
    assert.ok(
      src.includes('STATION_BOOKMARK_CANVAS_INSET_TOP'),
      'narrow overlay must use STATION_BOOKMARK_CANVAS_INSET_TOP',
    );
    assert.equal(
      /inset-y-0/.test(src),
      false,
      'narrow overlay must not use inset-y-0 (needs the same 8px gutter)',
    );
  });

  it('expand strip composes the vertical SoT twin', () => {
    const src = code('src/components/receiving/workspace/ReceivingTicketStack.tsx');
    assert.ok(
      src.includes('CONTEXT_PANEL_OUTER_MARGIN_Y'),
      'ReceivingPushExpandStrip must use CONTEXT_PANEL_OUTER_MARGIN_Y',
    );
  });
});
