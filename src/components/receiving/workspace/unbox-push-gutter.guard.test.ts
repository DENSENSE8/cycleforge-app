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
import { STATION_WORKBENCH_LOCK_PX, STATION_WORKBENCH_BODY_PAD_X, STATION_DISPLAYS_MIN_WIDTH_PX, STATION_WORKBENCH_COLUMN, STATION_WORKBENCH_IDENTITY_COLUMN } from '@/components/station/workbench/workbench-layout';
import {
  STATION_IDENTITY_INSET_RIGHT,
  STATION_IDENTITY_INSET_TOP,
  stationContextBarHostClass,
  stationMoreDetailsPaneHostClass,
} from '@/components/station/entity-context';
import { DETAIL_STACK_PUSH_COLUMN_CLASS } from '@/design-system/shells/detail-stack';
import { TICKET_PUSH_HOST_PAD_CLASS } from './UnboxPushColumn';

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
      'resize pad must come from frame station pad SoT',
    );
    assert.ok(
      src.includes('setStationPushDemand'),
      'wide push must publish station demand into the shared width budget',
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

  it('scan-station utility rail is a separate white trailing chrome', () => {
    const layout = code('src/components/station/workbench/workbench-layout.ts');
    assert.ok(
      layout.includes('STATION_UTILITY_RAIL_CLASS'),
      'utility rail class must be named in workbench-layout',
    );
    assert.match(
      layout,
      /STATION_UTILITY_RAIL_CLASS\s*=\s*'[^']*bg-surface-card[^']*'/,
      'utility rail is white card face',
    );
    assert.match(
      layout,
      /STATION_UTILITY_RAIL_CLASS\s*=\s*'[^']*border-l[^']*'/,
      'utility rail hairline against center',
    );
    assert.match(
      layout,
      /STATION_UTILITY_RAIL_CLASS\s*=\s*'[^']*z-raised[^']*'/,
      'utility rail stacks above center overflow (PhotoPeek z-20) so Open displays stays clickable',
    );
    const host = code('src/components/station/workbench/StationScanPaneHost.tsx');
    assert.match(
      host,
      /ScanStationUtilityRail/,
      'StationScanPaneHost mounts ScanStationUtilityRail between center and Displays',
    );
    assert.doesNotMatch(
      host,
      /stationMoreDetailsPaneHostClass/,
      'utility is in-flow rail chrome — not an absolute float over identity',
    );
  });

  it('StationPanelRoot is the sunken center plane', () => {
    const src = code('src/components/station/workbench/StationPanelRoot.tsx');
    assert.ok(
      src.includes('bg-surface-sunken'),
      'center work column must step to sunken for plane depth',
    );
  });

  it('LineEditPanel composes StationScanPaneHost for locked-720 middle + pinned Displays', () => {
    const src = code('src/components/receiving/workspace/LineEditPanel.tsx');
    assert.ok(src.includes('unbox-station-center'));
    assert.ok(
      src.includes('StationScanPaneHost'),
      'Unbox must compose StationScanPaneHost (one host SoT)',
    );
    assert.equal(
      src.includes('STATION_DISPLAYS_OPEN_SPACER_CLASS'),
      false,
      'must NOT reintroduce the leading spacer (gutter left of middle)',
    );
    assert.equal(
      /showDisplays\s*&&\s*['"]justify-between['"]/.test(src) ||
        src.includes("showDisplays && 'justify-between'"),
      false,
      'host must NOT justify-between when Displays is open — that leaves a gray gutter',
    );
    assert.equal(STATION_WORKBENCH_LOCK_PX, 720);
    const layout = code('src/components/station/workbench/workbench-layout.ts');
    assert.match(
      layout,
      new RegExp(
        `STATION_CENTER_COLUMN_CLASS\\s*=\\s*'[^']*min-w-\\[${STATION_WORKBENCH_LOCK_PX}px\\][^']*'`,
      ),
      'open-Displays center must min-w at STATION_WORKBENCH_LOCK_PX (720 lock)',
    );
    assert.match(
      layout,
      new RegExp(
        `STATION_CENTER_COLUMN_CLASS\\s*=\\s*'[^']*max-w-\\[${STATION_WORKBENCH_LOCK_PX}px\\][^']*'`,
      ),
      'open-Displays center must max-w at STATION_WORKBENCH_LOCK_PX',
    );
    assert.equal(
      /STATION_CENTER_COLUMN_CLASS\s*=\s*'[^']*\bmin-w-0\b/.test(layout),
      false,
      'open-Displays center must NOT be min-w-0 (middle must not yield below 720)',
    );
    assert.equal(
      /STATION_CENTER_COLUMN_CLASS\s*=\s*'[^']*\bflex-1\b/.test(layout),
      false,
      'open-Displays center must NOT be flex-1 — that parks surplus AFTER Displays',
    );
    assert.match(
      layout,
      new RegExp(
        `STATION_WORKBENCH_COLUMN\\s*=\\s*'[^']*max-w-\\[${STATION_WORKBENCH_LOCK_PX}px\\][^']*'`,
      ),
      'middle content must max-w at STATION_WORKBENCH_LOCK_PX',
    );
    for (const panel of [
      'src/components/receiving/triage/TriagePanel.tsx',
      'src/components/tech/TestingPanel.tsx',
    ]) {
      const panelSrc = code(panel);
      assert.ok(
        panelSrc.includes('StationScanPaneHost'),
        `${panel} must compose StationScanPaneHost`,
      );
    }
  });

  it('station push publishes centerFloorPx = STATION_PUSH_CENTER_FLOOR_PX (720 lock)', () => {
    const src = code('src/lib/right-rail/frame.ts');
    assert.ok(
      src.includes('STATION_PUSH_CENTER_FLOOR_PX = STATION_WORKBENCH_LOCK_PX'),
      'frame must set STATION_PUSH_CENTER_FLOOR_PX = STATION_WORKBENCH_LOCK_PX (720)',
    );
    assert.ok(
      /centerFloorPx:\s*station\s*\?\s*STATION_PUSH_CENTER_FLOOR_PX/.test(src),
      'station push must publish STATION_PUSH_CENTER_FLOOR_PX so middle stays locked',
    );
    assert.equal(
      src.includes('STATION_PUSH_CENTER_FLOOR_PX = 0'),
      false,
      'station push must not use center floor 0 (middle must not yield)',
    );
  });

  it('middle wrapper caps at 720; Displays flex-1 pins trailing; PhotoPeek hugs Displays', () => {
    assert.equal(
      STATION_WORKBENCH_BODY_PAD_X,
      '',
      'body pad must be empty — readable air lives inside rows, not against rails',
    );
    assert.ok(
      STATION_WORKBENCH_COLUMN.includes(`max-w-[${STATION_WORKBENCH_LOCK_PX}px]`),
      'middle wrapper must max-w at the station lock (720)',
    );
    assert.ok(
      /\bmx-auto\b/.test(STATION_WORKBENCH_COLUMN),
      'middle wrapper mx-auto centres when Displays is closed',
    );
    assert.equal(
      /min-w-\[\d+px\]/.test(STATION_WORKBENCH_COLUMN),
      false,
      'middle wrapper must not ship min-w-[Npx]',
    );
    assert.equal(
      STATION_WORKBENCH_IDENTITY_COLUMN,
      'w-full min-w-0',
      'identity host must be full-bleed for layout (white face on the ≤720 measure)',
    );
    assert.equal(STATION_DISPLAYS_MIN_WIDTH_PX, 280);
    const push = code('src/components/receiving/workspace/UnboxPushColumn.tsx');
    assert.ok(
      push.includes('STATION_DISPLAYS_MIN_WIDTH_PX'),
      'Displays resize must use the station min (280), not desk DETAIL_STACK 360',
    );
    assert.ok(
      push.includes("'min-w-0 flex-1 self-stretch'") ||
        /'min-w-0 flex-1 self-stretch'/.test(push),
      'in-flow Displays must be flex-1 so it fills from the middle to the pane right',
    );
    assert.equal(
      /'shrink-0 self-stretch'/.test(push) &&
        !/overlay[\s\S]{0,400}'shrink-0 self-stretch'/.test(push),
      false,
      'in-flow Displays must not be unconditional shrink-0 (overlay may still shrink-0)',
    );
    assert.ok(
      push.includes('applyStationDisplaysDelta') || push.includes('station-dual-rail'),
      'Displays sash must wire station dual-rail coupling',
    );
    const peek = code('src/components/receiving/workspace/line-edit/PhotoPeekFan.tsx');
    assert.ok(
      /absolute inset-y-0 right-0/.test(peek),
      'PhotoPeek must pin to the center column right edge (Displays seam or pane edge)',
    );
  });

  it('identity measure matches the 720 max; rows justify-between', () => {
    assert.ok(
      STATION_WORKBENCH_COLUMN.includes(`max-w-[${STATION_WORKBENCH_LOCK_PX}px]`),
      'identity chips share the workbench max',
    );
    const bar = code('src/components/station/entity-context/StationContextBar.tsx');
    assert.ok(
      bar.includes('STATION_WORKBENCH_COLUMN'),
      'StationContextBar must compose the middle measure as the white face',
    );
    assert.ok(
      bar.includes('station-identity-measure'),
      'measure host keeps a stable test id for E2E / guards',
    );
    assert.ok(
      /stationIdentityPanelClass[\s\S]{0,400}STATION_WORKBENCH_COLUMN/.test(bar),
      'identity Panel must compose STATION_WORKBENCH_COLUMN',
    );
    const card = code('src/components/station/entity-context/CartonContextCard.tsx');
    assert.ok(
      /grid min-w-0 w-full flex-1 gap-0/.test(card) &&
        card.includes('carton-context-two-row'),
      'CartonContextCard must keep a two-column stretch grid (left stack · right actions)',
    );
    assert.ok(
      card.includes('photosClaimColumn') || /items-end|justify-end/.test(card),
      'CartonContextCard right column must end-align Photos · Claim under the measure',
    );
  });

  it('Displays push does not ship a parked expand strip', () => {
    const src = code('src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx');
    assert.equal(src.includes('ReceivingTicketExpandStrip'), false);
    assert.equal(src.includes('ReceivingPushExpandStrip'), false);
  });

  it('Displays push fills leftover (flex-1); no per-surface taste ceiling', () => {
    const stack = code('src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx');
    assert.equal(
      /DISPLAYS_PUSH_MAX_WIDTH_PX/.test(stack),
      false,
      'ReceivingDisplaysPushStack must not ship a hard maxWidth constant',
    );
    assert.equal(
      /maxWidthPx=\{/.test(stack),
      false,
      'ReceivingDisplaysPushStack must not pass maxWidthPx into UnboxPushColumn',
    );
    const push = code('src/components/receiving/workspace/UnboxPushColumn.tsx');
    assert.ok(
      /maxWidthPx\?:/.test(push) || /maxWidthPx\?\s*:/.test(push),
      'UnboxPushColumn.maxWidthPx must be optional',
    );
    assert.ok(
      /min-w-0 flex-1 self-stretch/.test(push),
      'in-flow Displays must flex-1 fill leftover (pinned to pane right)',
    );
    assert.ok(
      /width:\s*overlay\s*\?/.test(push) || /width: overlay \?/.test(push),
      'in-flow must not paint a fixed width — only overlay/expanded set width',
    );
  });

  it('identity strip is a coplanar flush white band (no radius / elevation / pad)', () => {
    const src = code(
      'src/components/station/entity-context/station-identity-chrome.ts',
    );
    assert.ok(src.includes('rounded-none'));
    assert.ok(src.includes('border-b border-border-soft'));
    assert.ok(src.includes("stationIdentityPadClass = 'px-0'"));
    assert.ok(
      src.includes('bg-surface-card'),
      'identity band must paint white card face',
    );
    assert.equal(
      /stationIdentityPanelClass[\s\S]*?bg-surface-sunken/.test(src),
      false,
      'identity band must not stay sunken',
    );
    assert.equal(
      /stationIdentityPadClass\s*=\s*'[^']*\bpt-/.test(src),
      false,
      'identity pad must not carry vertical pt-*',
    );
    assert.equal(
      /stationIdentityPadClass\s*=\s*'[^']*\bpb-/.test(src),
      false,
      'identity pad must not carry vertical pb-*',
    );
    assert.equal(src.includes('rounded-b-2xl'), false);
    assert.equal(src.includes("elevationClass('raised'"), false);
    assert.equal(src.includes('stationBookmark'), false);
  });
});
