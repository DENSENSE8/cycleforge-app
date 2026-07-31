/**
 * Source guard: Main L1 nests Overview / Library; Stations stay nested Floor/Desk
 * on the root map; Stock is a Vercel-style drill-in (root chevron → back + children).
 *
 * SoT: MAIN_GROUPS + STOCK_DRILL + kind stock rows in sidebar-navigation.ts
 * Display law: .claude/rules/display/workbench.md
 * Brief: docs/todo/spine-drill-in-vercel-GEMINI-RESEARCH-BRIEFING.md
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
  STOCK_DRILL,
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

test('SidebarNavList: Stock drill via STOCK_DRILL; no Overview/Library twin; ChevronRight drill affordance', () => {
  assert.match(LIST_SRC, /MAIN_GROUPS/);
  assert.match(LIST_SRC, /STOCK_DRILL/);
  assert.doesNotMatch(LIST_SRC, /['"]Overview['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Library['"]/);
  // Stock label comes from STOCK_DRILL — no hard-coded twin string in render.
  assert.doesNotMatch(LIST_SRC, /label: ['"]Stock['"]/);
  assert.match(LIST_SRC, /ChevronRight/);
  assert.match(LIST_SRC, /ChevronLeft/);
  assert.match(LIST_SRC, /onDrillChange/);
  assert.match(LIST_SRC, /role=["']group["']/);
  assert.match(LIST_SRC, /aria-labelledby/);
});

test('SidebarNavList: Stock drill back header centers STOCK_DRILL label', () => {
  assert.match(LIST_SRC, /STOCK_DRILL\.label/);
  assert.match(LIST_SRC, /text-center text-role-eyebrow/);
  // Optical center: chevron | title | mirror spacer (not left-packed flex-1).
  assert.match(LIST_SRC, /grid-cols-\[1\.25rem_1fr_1\.25rem\]/);
});

test('SidebarNavList: Stock drill uses named spineDrill SoT (opacity-only; no inline x slide)', () => {
  assert.match(LIST_SRC, /framerPresence\.spineDrill/);
  assert.match(LIST_SRC, /framerTransition\.spineDrill/);
  assert.match(LIST_SRC, /useMotionPresence/);
  // Drill swap must not revive a page-local horizontal slide twin.
  assert.doesNotMatch(LIST_SRC, /x:\s*drillId/);
  assert.doesNotMatch(LIST_SRC, /x:\s*-?12/);
  // SoT presence (last spineDrill object) is opacity-only — no x/y.
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

test('MasterNav: auto-drill on kind stock does not steal focus', () => {
  assert.match(MASTER_SRC, /kind === ['"]stock['"]/);
  assert.match(MASTER_SRC, /setDrillId\(['"]stock['"]\)/);
  // Route-driven enter/leave must not focus sidebar chrome (main content stays).
  assert.doesNotMatch(MASTER_SRC, /\.focus\s*\(/);
  assert.doesNotMatch(MASTER_SRC, /autoFocus/);
});

test('L1 parent eyebrows outrank Main nest subtitles (type hierarchy)', () => {
  assert.match(LIST_SRC, /text-role-eyebrow uppercase tracking-widest text-text-soft/);
  assert.match(LIST_SRC, /text-role-micro uppercase tracking-widest text-text-faint/);
});

test('L1 sections separate with a quiet hairline (Main / Stations / Stock)', () => {
  assert.match(LIST_SRC, /border-t border-border-soft pt-1\.5/);
});
