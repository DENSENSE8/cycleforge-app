/**
 * Station flush planes + Flex-Grow Sandwich (Unbox golden).
 *
 * SoT (ruled 2026-08-03 · elastic-center Option A 2026-08-10 · enclose-don't-
 * hide 2026-08-10):
 *   - Context rail + Unbox push are **flush** coplanar columns (no outer `m-*`
 *     islands). Depth = surface steps on `CONTEXT_PANEL_HOST` ground.
 *   - Center = `bg-surface-sunken` via `StationPanelRoot`, ELASTIC with a 720
 *     floor (the single absorber); the rails resize against it.
 *   - Displays = an explicitly-sized `shrink-0` sibling; it abuts the center
 *     with no `ml-auto` detach band, and its sash clamps at the local
 *     `stationDisplaysCapPx` (no inverse coupling to the far rail).
 *   - No host `justify-between` / host `gap-*` / gutter div / leading spacer.
 *     `RIGHT_RAIL_GUTTER_PX = 0`.
 *   - `STATION_IDENTITY_INSET_TOP` (`top-0`) = identity flush under
 *     GlobalHeader — same flush-planes ruling as the retired rail `m-2`.
 *   - Displays is **in-flow when it fits**; on a tight frame the left rail
 *     parks first so Displays stays open; Displays auto-parks only when even a
 *     parked left cannot seat it (never overlay, never off-screen).
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
import { RIGHT_RAIL_GUTTER_PX } from '@/lib/right-rail/frame';
import { STATION_DISPLAYS_HOST_PAD_CLASS } from '@/components/station/displays';

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
    assert.equal(STATION_DISPLAYS_HOST_PAD_CLASS, '');
    assert.equal(
      /\bpy-/.test(STATION_DISPLAYS_HOST_PAD_CLASS),
      false,
      'vertical host pad stacks under StationContextBar top-0',
    );
  });

  it('StationDisplaysPushColumn is in-flow when it fits; frame-narrow auto-parks (never overlay)', () => {
    const src = code('src/components/station/displays/StationDisplaysPushColumn.tsx');
    assert.equal(
      src.includes('CONTEXT_PANEL_OUTER_MARGIN_Y'),
      false,
      'wide push must not use retired vertical outer gutters',
    );
    assert.ok(
      src.includes('DETAIL_STACK_PUSH_COLUMN_CLASS'),
      'must compose the flush push surface',
    );
    assert.equal(
      src.includes('DETAIL_STACK_ASIDE_SURFACE'),
      false,
      'must not use the rounded float aside surface',
    );
    assert.equal(
      /absolute inset-y-0/.test(src) || /absolute inset-0/.test(src) || /'absolute /.test(src),
      false,
      'must never absolute-overlay the middle / dock',
    );
    assert.ok(
      /'shrink-0 self-stretch'/.test(src),
      'must stay an in-flow shrink-0 sibling when open',
    );
    assert.ok(
      src.includes('stationDisplaysCollapsed'),
      'must read the frame auto-park latch',
    );
    assert.ok(
      /data-displays-frame-parked/.test(src),
      'frame auto-park must mark the slim strip',
    );
    assert.ok(
      src.includes('UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX'),
      'resize pad must come from frame station pad SoT',
    );
    assert.ok(
      src.includes('setStationPushDemand'),
      'must publish station demand into the shared width budget',
    );
  });

  it('widen control maximizes the sash in-flow (never a fullscreen cover)', () => {
    const src = code('src/components/station/displays/StationDisplaysPushColumn.tsx');
    assert.ok(
      src.includes('unbox-push-fullscreen'),
      'widen control keeps the stable test id',
    );
    assert.ok(
      src.includes('toggleMaximize') || src.includes('setMaximized'),
      'widen is an in-flow sash maximize latch',
    );
    assert.equal(
      src.includes("'absolute inset-0'"),
      false,
      'widen must not cover the pane with absolute inset-0',
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

  it('LineEditPanel composes StationScanPaneHost with an elastic-floor-720 center', () => {
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
    // Option A: ONE elastic center class (`flex-1 min-w-[720px]`) — the center
    // is the row's single absorber, floored at 720, never a locked/max-w variant.
    const layout = code('src/components/station/workbench/workbench-layout.ts');
    assert.equal(
      layout.includes('STATION_CENTER_COLUMN_CLASS'),
      false,
      'the locked-720 center variant is retired — the center is always elastic',
    );
    assert.match(
      layout,
      new RegExp(
        `STATION_CENTER_COLUMN_OPEN_CLASS\\s*=\\s*'[^']*min-w-\\[${STATION_WORKBENCH_LOCK_PX}px\\][^']*'`,
      ),
      'elastic center must min-w at STATION_WORKBENCH_LOCK_PX (720 floor)',
    );
    assert.match(
      layout,
      /STATION_CENTER_COLUMN_OPEN_CLASS\s*=\s*'[^']*\bflex-1\b/,
      'elastic center must be flex-1 (the single absorber — the rails resize against it)',
    );
    assert.equal(
      new RegExp(
        `STATION_CENTER_COLUMN_OPEN_CLASS\\s*=\\s*'[^']*max-w-\\[${STATION_WORKBENCH_LOCK_PX}px\\][^']*'`,
      ).test(layout),
      false,
      'elastic center must NOT max-w at 720 (that is the retired lock)',
    );
    assert.match(
      layout,
      /STATION_WORKBENCH_COLUMN\s*=\s*'w-full min-w-0'/,
      'middle content must be edge-to-edge (no max-w / mx-auto gutters)',
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

  it('middle wrapper edge-to-edge; Displays flex-1 always fills leftover; PhotoPeek on center', () => {
    assert.equal(
      STATION_WORKBENCH_BODY_PAD_X,
      '',
      'body pad must be empty — readable air lives inside rows, not against rails',
    );
    assert.equal(
      STATION_WORKBENCH_COLUMN,
      'w-full min-w-0',
      'middle wrapper is edge-to-edge of the center column (no max-w / mx-auto gutters)',
    );
    assert.equal(
      /max-w-\[/.test(STATION_WORKBENCH_COLUMN),
      false,
      'middle wrapper must not ship max-w-[Npx] gutters',
    );
    assert.equal(
      /\bmx-auto\b/.test(STATION_WORKBENCH_COLUMN),
      false,
      'middle wrapper must not mx-auto (that parks sunken gutters beside identity + dock)',
    );
    assert.equal(
      STATION_WORKBENCH_IDENTITY_COLUMN,
      'w-full min-w-0',
      'identity host must be full-bleed for layout (white face on the edge-to-edge measure)',
    );
    assert.equal(STATION_DISPLAYS_MIN_WIDTH_PX, 280);
    assert.equal(RIGHT_RAIL_GUTTER_PX, 0, 'layout chrome must not invent inter-column gutter px');
    const push = code('src/components/station/displays/StationDisplaysPushColumn.tsx');
    assert.ok(
      push.includes('STATION_DISPLAYS_MIN_WIDTH_PX'),
      'Displays resize must use the station min (280), not desk DETAIL_STACK 360',
    );
    assert.ok(
      /'shrink-0 self-stretch'/.test(push),
      'in-flow Displays must be an explicitly-sized shrink-0 sibling (Option A — the elastic center absorbs; Displays does not flex-1 fill)',
    );
    assert.equal(
      /'ml-auto shrink-0 self-stretch'/.test(push),
      false,
      'in-flow Displays must NOT use ml-auto detach (that parks a gray band)',
    );
    assert.equal(
      push.includes('station-dual-rail') ||
        push.includes('applyStationDisplaysDelta') ||
        push.includes('isStationDualRailCouplingActive'),
      false,
      'Displays sash must NOT couple the far rail (Option A — the sash resizes only Displays; the center absorbs)',
    );
    assert.ok(
      push.includes('stationDisplaysCapPx'),
      'Displays sash must clamp at the local stationDisplaysCapPx (frame − leftCost − 720), not a coupling ceiling',
    );
    const host = code('src/components/station/workbench/StationScanPaneHost.tsx');
    assert.equal(
      /\bgap-/.test(host),
      false,
      'StationScanPaneHost must not hard-code gap-* layout gutters',
    );
    assert.equal(
      /justify-between|justify-around/.test(host),
      false,
      'StationScanPaneHost must not justify-between (permanent gray band)',
    );
    const peek = code('src/components/receiving/workspace/line-edit/PhotoPeekFan.tsx');
    assert.ok(
      /absolute inset-y-0 right-0/.test(peek),
      'PhotoPeek must pin to the center column right edge (Displays seam or pane edge)',
    );
  });

  it('identity + notes dock share edge-to-edge measure; rows justify-between', () => {
    assert.equal(
      STATION_WORKBENCH_COLUMN,
      'w-full min-w-0',
      'identity + notes dock share the edge-to-edge workbench measure',
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
    const src = code('src/components/station/displays/StationDisplaysPushStack.tsx');
    assert.equal(src.includes('ReceivingTicketExpandStrip'), false);
    assert.equal(src.includes('ReceivingPushExpandStrip'), false);
  });

  it('Displays push is a sized local splitter (Option A); no per-surface hard ceiling', () => {
    const stack = code('src/components/station/displays/StationDisplaysPushStack.tsx');
    assert.equal(
      /DISPLAYS_PUSH_MAX_WIDTH_PX/.test(stack),
      false,
      'StationDisplaysPushStack must not ship a hard maxWidth constant (the cap is the frame-derived stationDisplaysCapPx)',
    );
    assert.equal(
      /maxWidthPx=\{/.test(stack),
      false,
      'StationDisplaysPushStack must not pass maxWidthPx into StationDisplaysPushColumn',
    );
    const push = code('src/components/station/displays/StationDisplaysPushColumn.tsx');
    assert.ok(
      /maxWidthPx\?:/.test(push) || /maxWidthPx\?\s*:/.test(push),
      'StationDisplaysPushColumn.maxWidthPx must stay an optional taste ceiling',
    );
    assert.ok(
      /shrink-0 self-stretch/.test(push),
      'in-flow Displays must be an explicitly-sized shrink-0 sibling (center absorbs)',
    );
    assert.ok(
      /width:\s*layoutWidth/.test(push),
      'in-flow Displays must paint its own resized width (layoutWidth) — the center flexes',
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
