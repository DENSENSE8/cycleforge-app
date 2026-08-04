/**
 * Station flush planes + identity clearance — Unbox golden.
 *
 * SoT (ruled 2026-08-03):
 *   - Context rail + Unbox push are **flush** coplanar columns (no outer `m-*`
 *     islands). Depth = surface steps on `CONTEXT_PANEL_HOST` ground.
 *   - Center = `bg-surface-sunken` via `StationPanelRoot`.
 *   - `STATION_IDENTITY_INSET_TOP` (`top-0`) = identity flush under
 *     GlobalHeader — same flush-planes ruling as the retired rail `m-2`.
 *   - Narrow push overlay may float (exception) with the same top inset.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/unbox-push-gutter.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONTEXT_PANEL_COLUMN_CLASS,
  CONTEXT_PANEL_COLLAPSE_STRIP_CLASS,
} from '@/components/sidebar/context-panel-column';
import {
  STATION_IDENTITY_INSET_RIGHT,
  STATION_IDENTITY_INSET_TOP,
  stationContextBarHostClass,
  stationMoreDetailsPaneHostClass,
} from '@/components/station/entity-context';
import { DETAIL_STACK_PUSH_COLUMN_CLASS } from '@/design-system/shells/detail-stack';
import { TICKET_PUSH_HOST_PAD_CLASS } from './ReceivingTicketStack';

const ROOT = resolve(import.meta.dirname, '../../../..');

function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('Station flush planes — Unbox golden', () => {
  it('context panel column is flush (no outer margin island / cast / full radius)', () => {
    assert.equal(/\bm-2\b/.test(CONTEXT_PANEL_COLUMN_CLASS), false);
    assert.equal(/rounded-2xl/.test(CONTEXT_PANEL_COLUMN_CLASS), false);
    assert.equal(/shadow-elev/.test(CONTEXT_PANEL_COLUMN_CLASS), false);
    assert.ok(
      CONTEXT_PANEL_COLUMN_CLASS.includes('border-r'),
      'flush rail needs a trailing hairline against the center',
    );
    assert.ok(CONTEXT_PANEL_COLUMN_CLASS.includes('bg-surface-card'));
  });

  it('collapse strip is flush on the shared ground', () => {
    assert.equal(/\bm-2\b/.test(CONTEXT_PANEL_COLLAPSE_STRIP_CLASS), false);
    assert.ok(CONTEXT_PANEL_COLLAPSE_STRIP_CLASS.includes('border-r'));
  });

  it('detail-stack in-flow push column is flush (no m-2 island)', () => {
    assert.equal(/\bm-2\b/.test(DETAIL_STACK_PUSH_COLUMN_CLASS), false);
    assert.equal(/rounded-2xl/.test(DETAIL_STACK_PUSH_COLUMN_CLASS), false);
    assert.equal(/shadow-elev/.test(DETAIL_STACK_PUSH_COLUMN_CLASS), false);
    assert.ok(DETAIL_STACK_PUSH_COLUMN_CLASS.includes('border-l'));
  });

  it('station identity is flush top (top-0) with trailing right-2', () => {
    assert.equal(STATION_IDENTITY_INSET_TOP, 'top-0');
    assert.equal(STATION_IDENTITY_INSET_RIGHT, 'right-2');
    assert.ok(
      stationContextBarHostClass.includes(STATION_IDENTITY_INSET_TOP),
      'StationContextBar host must compose STATION_IDENTITY_INSET_TOP',
    );
    assert.ok(
      stationMoreDetailsPaneHostClass.includes(STATION_IDENTITY_INSET_TOP),
      'pane more-details must compose the same top inset',
    );
  });

  it('host pad is empty (flush) and never py-*', () => {
    assert.equal(TICKET_PUSH_HOST_PAD_CLASS, '');
    assert.equal(
      /\bpy-/.test(TICKET_PUSH_HOST_PAD_CLASS),
      false,
      'vertical host pad stacks under StationContextBar top-0',
    );
  });

  it('UnboxPushColumn is flush wide; narrow overlay keeps identity top inset', () => {
    const src = code('src/components/receiving/workspace/UnboxPushColumn.tsx');
    assert.equal(
      src.includes('CONTEXT_PANEL_OUTER_MARGIN_Y'),
      false,
      'wide push must not use retired vertical outer gutters',
    );
    assert.ok(
      src.includes('DETAIL_STACK_PUSH_COLUMN_CLASS'),
      'wide push must compose the flush push surface',
    );
    assert.ok(
      src.includes('STATION_IDENTITY_INSET_TOP'),
      'narrow overlay must use STATION_IDENTITY_INSET_TOP',
    );
    assert.ok(
      src.includes('UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX'),
      'resize pad must come from frame MIN_WORK_SURFACE SoT',
    );
    assert.ok(
      src.includes('setStationPushDemand'),
      'wide push must publish station demand so 1440 parks the context rail',
    );
    assert.equal(
      /inset-y-0/.test(src),
      false,
      'narrow overlay must not use inset-y-0',
    );
  });

  it('fullscreen expand is square and edge-to-edge', () => {
    const src = code('src/components/receiving/workspace/UnboxPushColumn.tsx');
    assert.ok(
      src.includes("'absolute inset-0'"),
      'expanded fullscreen must use absolute inset-0',
    );
    assert.ok(
      src.includes("expanded && 'rounded-none shadow-none'"),
      'expanded fullscreen must drop card radius + float shadow',
    );
  });

  it('pane carton cursor sits above panel-band push overlay', () => {
    assert.ok(
      stationMoreDetailsPaneHostClass.includes('z-panelPopover'),
      'pane ↑↓ must clear z-panel fullscreen push',
    );
    assert.equal(
      stationMoreDetailsPaneHostClass.includes('z-raised'),
      false,
      'z-raised sits under z-panel and would hide ↑↓ when expanded',
    );
  });

  it('StationPanelRoot is the sunken center plane', () => {
    const src = code('src/components/station/workbench/StationPanelRoot.tsx');
    assert.ok(
      src.includes('bg-surface-sunken'),
      'center work column must step to sunken for plane depth',
    );
  });

  it('LineEditPanel exposes unbox-station-center for flush geometry E2E', () => {
    const src = code('src/components/receiving/workspace/LineEditPanel.tsx');
    assert.ok(src.includes('unbox-station-center'));
  });

  it('Ticket stack no longer ships a parked expand strip', () => {
    const src = code('src/components/receiving/workspace/ReceivingTicketStack.tsx');
    assert.equal(src.includes('ReceivingTicketExpandStrip'), false);
  });

  it('identity strip is square-top flush (no top radius / top border)', () => {
    const src = code(
      'src/components/station/entity-context/station-identity-chrome.ts',
    );
    assert.ok(src.includes('rounded-t-none'));
    assert.ok(src.includes('border-t-0'));
    assert.ok(src.includes("stationIdentityPadClass = 'px-1 pt-1 pb-1.5'"));
    assert.equal(src.includes('stationBookmark'), false);
  });
});
