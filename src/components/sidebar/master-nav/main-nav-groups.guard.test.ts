/**
 * Source guard: Spine L1 is section drills (Overview / Library / Floor / Desk /
 * Stock) — root buttons replace the body with back + pages. Modes stay accordion.
 *
 * SoT: SPINE_DRILLS + spineDrillIdForPage + MAIN_GROUPS / STATION_GROUPS / STOCK_DRILL
 * Display law: .claude/rules/display/workbench.md
 * Brief: docs/todo/spine-drill-in-vercel-GEMINI-RESEARCH-BRIEFING.md (evolved: full section drill)
 *
 * Run: node --test --import tsx \
 *        src/components/sidebar/master-nav/main-nav-groups.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  APP_SIDEBAR_NAV,
  MAIN_GROUPS,
  SIDEBAR_PAGE_NAV,
  SPINE_DRILLS,
  STOCK_DRILL,
  spineDrillIdForPage,
  type MainGroupId,
} from '@/lib/sidebar-navigation';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const STOCK_PIPELINE = ['products', 'inventory', 'warehouse'] as const;
const ALLOWED_MAIN: ReadonlySet<MainGroupId> = new Set(['overview', 'library']);

const LIST_SRC = code(sourceOf('./SidebarNavList.tsx'));
const MASTER_SRC = code(sourceOf('./MasterNav.tsx'));
const MOTION_SRC = code(
  sourceOf('../../../design-system/foundations/motion-framer.ts'),
);

test('MAIN_GROUPS is Overview then Library (Stock drills, not a Main nest)', () => {
  assert.deepEqual(
    MAIN_GROUPS.map((g) => g.id),
    ['overview', 'library'],
  );
  assert.deepEqual(
    MAIN_GROUPS.map((g) => g.label),
    ['Overview', 'Library'],
  );
});

test('STOCK_DRILL label is Stock', () => {
  assert.equal(STOCK_DRILL.id, 'stock');
  assert.equal(STOCK_DRILL.label, 'Stock');
});

test('SPINE_DRILLS is Overview → Library → Floor → Desk → Stock', () => {
  assert.deepEqual(
    SPINE_DRILLS.map((d) => d.id),
    ['overview', 'library', 'floor', 'desk', 'stock'],
  );
});

test('spineDrillIdForPage maps main/station/stock pages; top/bottom pins are null', () => {
  assert.equal(spineDrillIdForPage({ kind: 'main', mainGroup: 'overview' }), 'overview');
  assert.equal(spineDrillIdForPage({ kind: 'main', mainGroup: 'library' }), 'library');
  assert.equal(spineDrillIdForPage({ kind: 'station', stationGroup: 'floor' }), 'floor');
  assert.equal(spineDrillIdForPage({ kind: 'station', stationGroup: 'desk' }), 'desk');
  assert.equal(spineDrillIdForPage({ kind: 'stock' }), 'stock');
  assert.equal(spineDrillIdForPage({ kind: 'top' }), null);
  assert.equal(spineDrillIdForPage({ kind: 'bottom' }), null);
});

test('Search then Media are kind top (header pin, not Overview/Library)', () => {
  const topIds = APP_SIDEBAR_NAV.filter((item) => item.kind === 'top').map((item) => item.id);
  assert.deepEqual(topIds, ['search', 'ops-photos']);
  const search = APP_SIDEBAR_NAV.find((item) => item.id === 'search');
  const media = APP_SIDEBAR_NAV.find((item) => item.id === 'ops-photos');
  assert.equal(search?.kind, 'top');
  assert.equal(media?.kind, 'top');
});

test('every APP_SIDEBAR_NAV main declares mainGroup overview|library', () => {
  const mains = APP_SIDEBAR_NAV.filter((item) => item.kind === 'main');
  assert.ok(mains.length >= 2, `expected ≥2 main rows, got ${mains.length}`);
  for (const item of mains) {
    assert.equal(item.kind, 'main');
    assert.ok(
      ALLOWED_MAIN.has(item.mainGroup),
      `${item.id} has invalid mainGroup ${String((item as { mainGroup?: string }).mainGroup)}`,
    );
  }
});

test('every SIDEBAR_PAGE_NAV main declares matching mainGroup', () => {
  const byId = new Map(
    APP_SIDEBAR_NAV.filter((i) => i.kind === 'main').map((i) => [i.id, i]),
  );
  for (const page of SIDEBAR_PAGE_NAV) {
    if (page.kind !== 'main') continue;
    const flat = byId.get(page.id);
    if (flat) {
      assert.equal(
        page.mainGroup,
        flat.mainGroup,
        `${page.id} mainGroup drift vs APP_SIDEBAR_NAV`,
      );
    } else {
      assert.ok(
        ALLOWED_MAIN.has(page.mainGroup),
        `${page.id} has invalid mainGroup ${String(page.mainGroup)}`,
      );
    }
  }
});

test('Stock rows are kind stock in Products → Inventory → Warehouse order', () => {
  const stockIds = APP_SIDEBAR_NAV.filter((item) => item.kind === 'stock').map(
    (item) => item.id,
  );
  assert.deepEqual(stockIds, [...STOCK_PIPELINE]);
});

test('SIDEBAR_PAGE_NAV stock pages use kind stock', () => {
  for (const id of STOCK_PIPELINE) {
    const page = SIDEBAR_PAGE_NAV.find((p) => p.id === id);
    assert.ok(page, `${id} missing from SIDEBAR_PAGE_NAV`);
    assert.equal(page!.kind, 'stock', `${id} should be kind stock`);
  }
  for (const id of ['sourcing', 'fba'] as const) {
    const page = SIDEBAR_PAGE_NAV.find((p) => p.id === id);
    assert.ok(page, `${id} missing from SIDEBAR_PAGE_NAV`);
    assert.equal(page!.kind, 'stock', `${id} should be kind stock`);
  }
});

test('Overview → Library filtered order in APP_SIDEBAR_NAV mains', () => {
  const mains = APP_SIDEBAR_NAV.filter((item) => item.kind === 'main');
  const groups = mains.map((item) => item.mainGroup);
  const rank: Record<MainGroupId, number> = { overview: 0, library: 1 };
  for (let i = 1; i < groups.length; i++) {
    assert.ok(
      rank[groups[i]!] >= rank[groups[i - 1]!],
      `main row order regresses at ${mains[i]!.id} (${groups[i]} after ${groups[i - 1]})`,
    );
  }
});

test('SidebarNavList: section drills via SPINE_DRILLS; no label twins; ChevronRight affordance', () => {
  assert.match(LIST_SRC, /SPINE_DRILLS/);
  assert.match(LIST_SRC, /spineDrillIdForPage/);
  assert.doesNotMatch(LIST_SRC, /['"]Overview['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Library['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Floor['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Desk['"]/);
  assert.doesNotMatch(LIST_SRC, /label: ['"]Stock['"]/);
  assert.match(LIST_SRC, /ChevronRight/);
  assert.match(LIST_SRC, /ChevronLeft/);
  assert.match(LIST_SRC, /onDrillChange/);
  assert.match(LIST_SRC, /role=["']group["']/);
});

test('SidebarNavList: Search/Media top pin band above drills; Settings/Admin footer', () => {
  assert.match(LIST_SRC, /kind === ['"]top['"]/);
  assert.match(LIST_SRC, /border-b border-border-soft/);
  assert.match(LIST_SRC, /renderRow\(page, ['"]top['"]/);
  assert.match(LIST_SRC, /renderRow\(page, ['"]bottom['"]/);
  // GlobalHeaderSearch / AI must not twin into the spine list.
  assert.doesNotMatch(LIST_SRC, /GlobalHeaderSearch/);
  assert.doesNotMatch(LIST_SRC, /HeaderAi/);
});

test('SidebarNavList: drill back header centers section label from SoT', () => {
  assert.match(LIST_SRC, /drill\.label/);
  assert.match(LIST_SRC, /text-center text-role-caption/);
  assert.match(LIST_SRC, /grid-cols-\[1\.25rem_1fr_1\.25rem\]/);
});

test('SidebarNavList: page/drill/mode destinations share caption; modes stay readable', () => {
  // Destinations are places (caption sans) — not eyebrow chrome DNA or micro whisper.
  assert.match(LIST_SRC, /text-role-caption font-semibold/);
  assert.match(LIST_SRC, /text-role-caption font-medium/);
  assert.doesNotMatch(LIST_SRC, /text-role-eyebrow font-semibold/);
  assert.doesNotMatch(LIST_SRC, /text-role-micro font-medium/);
  // Idle modes stay default ink (active alone takes blue) — not muted/faint.
  assert.match(LIST_SRC, /text-text-default hover:bg-surface-canvas/);
  assert.match(LIST_SRC, /modeActive \? 'text-blue-600' : 'text-text-muted'/);
});

test('SidebarNavList: inactive page/drill rows whisper until hover or active', () => {
  assert.match(LIST_SRC, /text-text-muted hover:bg-surface-canvas hover:text-text-default/);
});

test('SidebarNavList: section drills use named spineDrill SoT (opacity-only; no inline x slide)', () => {
  assert.match(LIST_SRC, /framerPresence\.spineDrill/);
  assert.match(LIST_SRC, /framerTransition\.spineDrill/);
  assert.match(LIST_SRC, /useMotionPresence/);
  assert.doesNotMatch(LIST_SRC, /x:\s*drillId/);
  assert.doesNotMatch(LIST_SRC, /x:\s*-?12/);
  const presenceMatches = [
    ...MOTION_SRC.matchAll(/spineDrill:\s*\{[\s\S]*?\n\s*\},?/g),
  ];
  assert.ok(presenceMatches.length >= 1, 'spineDrill blocks missing');
  const presenceBlock = presenceMatches[presenceMatches.length - 1]![0];
  assert.match(presenceBlock, /initial:\s*\{\s*opacity:\s*0\s*\}/);
  assert.match(presenceBlock, /animate:\s*\{\s*opacity:\s*1\s*\}/);
  assert.match(presenceBlock, /exit:\s*\{\s*opacity:\s*0\s*\}/);
  assert.doesNotMatch(presenceBlock, /\bx\s*:/);
  assert.doesNotMatch(presenceBlock, /\by\s*:/);
});

test('MasterNav: auto-drill on section change does not steal focus', () => {
  assert.match(MASTER_SRC, /spineDrillIdForPage/);
  assert.match(MASTER_SRC, /setDrillId\(activeSection\)/);
  assert.doesNotMatch(MASTER_SRC, /\.focus\s*\(/);
  assert.doesNotMatch(MASTER_SRC, /autoFocus/);
});
