/**
 * Source guard: Spine L1 is section drills (Overview / Scan Stations / Desk /
 * Stock / Products / Library) — root buttons replace the body with back + pages.
 * Home is top-pinned (house glyph + Home label) above Search. Modes stay
 * always-visible under multi-mode pages (pinned count, no accordion).
 *
 * SoT: SPINE_SECTIONS + spineSectionIdForPage + MAIN_GROUPS / STATION_GROUPS /
 *      STOCK_DRILL / PRODUCTS_SECTION
 * Display law: .claude/rules/display/workbench.md
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
  PRODUCTS_SECTION,
  SIDEBAR_PAGE_NAV,
  SPINE_SECTIONS,
  STOCK_DRILL,
  spineSectionIdForPage,
  type MainGroupId,
} from '@/lib/sidebar-navigation';
import { Home } from '@/components/Icons';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const STOCK_PIPELINE = ['inventory', 'warehouse'] as const;
const ALLOWED_MAIN: ReadonlySet<MainGroupId> = new Set(['overview', 'library']);

const LIST_SRC = code(sourceOf('./SidebarNavList.tsx'));
const MASTER_SRC = code(sourceOf('./MasterNav.tsx'));
const MOTION_SRC = code(
  sourceOf('../../../design-system/foundations/motion-framer.ts'),
);

test('MAIN_GROUPS is Overview then Library (Library drills last via SPINE_SECTIONS)', () => {
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

test('PRODUCTS_SECTION label is Products', () => {
  assert.equal(PRODUCTS_SECTION.id, 'products');
  assert.equal(PRODUCTS_SECTION.label, 'Products');
});

test('SPINE_SECTIONS is Overview → Scan Stations → Desk → Stock → Products → Library', () => {
  assert.deepEqual(
    SPINE_SECTIONS.map((d) => d.id),
    ['overview', 'floor', 'desk', 'stock', 'products', 'library'],
  );
});

test('spineSectionIdForPage maps main/station/stock/products pages; top/bottom pins are null', () => {
  assert.equal(spineSectionIdForPage({ kind: 'main', mainGroup: 'overview' }), 'overview');
  assert.equal(spineSectionIdForPage({ kind: 'main', mainGroup: 'library' }), 'library');
  assert.equal(spineSectionIdForPage({ kind: 'station', stationGroup: 'floor' }), 'floor');
  assert.equal(spineSectionIdForPage({ kind: 'station', stationGroup: 'desk' }), 'desk');
  assert.equal(spineSectionIdForPage({ kind: 'stock' }), 'stock');
  assert.equal(spineSectionIdForPage({ kind: 'products' }), 'products');
  assert.equal(spineSectionIdForPage({ kind: 'top' }), null);
  assert.equal(spineSectionIdForPage({ kind: 'bottom' }), null);
});

test('Home then Search then Media then AI Chat are kind top', () => {
  const topIds = APP_SIDEBAR_NAV.filter((item) => item.kind === 'top').map((item) => item.id);
  assert.deepEqual(topIds, ['home', 'search', 'ops-photos', 'ai-chat']);
  const home = APP_SIDEBAR_NAV.find((item) => item.id === 'home');
  assert.equal(home?.kind, 'top');
  assert.equal(home?.label, 'Home');
  assert.equal(home?.icon, Home);
  const aiChat = APP_SIDEBAR_NAV.find((item) => item.id === 'ai-chat');
  assert.equal(aiChat?.kind, 'top');
  assert.equal(aiChat?.label, 'AI Chat');
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

test('Stock rows are kind stock in Inventory → Warehouse order', () => {
  const stockIds = APP_SIDEBAR_NAV.filter((item) => item.kind === 'stock').map(
    (item) => item.id,
  );
  assert.deepEqual(stockIds, [...STOCK_PIPELINE]);
});

test('Products is its own spine kind products (not stock)', () => {
  const products = APP_SIDEBAR_NAV.find((item) => item.id === 'products');
  assert.ok(products);
  assert.equal(products.kind, 'products');
  const page = SIDEBAR_PAGE_NAV.find((p) => p.id === 'products');
  assert.ok(page);
  assert.equal(page.kind, 'products');
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

test('Overview mains precede Library mains in APP_SIDEBAR_NAV', () => {
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

test('SidebarNavList: section drills via SPINE_SECTIONS; no label twins; ChevronRight affordance', () => {
  assert.match(LIST_SRC, /SPINE_SECTIONS/);
  assert.match(LIST_SRC, /spineSectionIdForPage/);
  assert.doesNotMatch(LIST_SRC, /['"]Overview['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Library['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Scan Stations['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Floor['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Desk['"]/);
  assert.doesNotMatch(LIST_SRC, /label: ['"]Stock['"]/);
  assert.doesNotMatch(LIST_SRC, /label: ['"]Products['"]/);
  assert.match(LIST_SRC, /ChevronRight/);
  assert.match(LIST_SRC, /ChevronLeft/);
  assert.match(LIST_SRC, /onDrillChange/);
  assert.match(LIST_SRC, /role=["']group["']/);
});

test('SidebarNavList: Home/Search/Media/AI Chat top pin band above drills; Settings/Admin footer', () => {
  assert.match(LIST_SRC, /kind === ['"]top['"]/);
  assert.match(LIST_SRC, /border-b border-border-soft/);
  assert.match(LIST_SRC, /renderRow\(page, ['"]top['"]/);
  assert.match(LIST_SRC, /renderRow\(page, ['"]bottom['"]/);
  assert.doesNotMatch(LIST_SRC, /GlobalHeaderSearch/);
  assert.doesNotMatch(LIST_SRC, /HeaderAi/);
});

test('SidebarNavList: drill back header centers section label from SoT', () => {
  assert.match(LIST_SRC, /section\.label/);
  assert.match(LIST_SRC, /text-center text-role-caption/);
  assert.match(LIST_SRC, /grid-cols-\[1\.25rem_1fr_1\.25rem\]/);
});

test('SidebarNavList: page/mode destinations share caption; modes stay readable; no accordion', () => {
  assert.match(LIST_SRC, /text-role-caption font-semibold/);
  assert.match(LIST_SRC, /text-role-caption font-medium/);
  assert.doesNotMatch(LIST_SRC, /text-role-eyebrow font-semibold/);
  assert.doesNotMatch(LIST_SRC, /ChevronDown/);
  assert.doesNotMatch(LIST_SRC, /aria-expanded/);
  assert.doesNotMatch(LIST_SRC, /onToggleRow/);
  assert.match(LIST_SRC, /text-text-default hover:bg-surface-canvas/);
  assert.match(LIST_SRC, /opts\.active \? 'text-blue-600' : 'text-text-muted'/);
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
  assert.match(MASTER_SRC, /spineSectionIdForPage/);
  assert.match(MASTER_SRC, /setDrillId\(activeSection\)/);
  assert.doesNotMatch(MASTER_SRC, /\.focus\s*\(/);
  assert.doesNotMatch(MASTER_SRC, /autoFocus/);
});
