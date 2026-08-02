/**
 * Source guard: Spine L1 is section drills (Analytics Monitor / Scan Stations /
 * Inbound / Catalog / Inventory / Fulfillment / Sales / Support / Workflow
 * Studio) — root buttons replace the body with back + pages. Home is top-pinned
 * (house glyph + Home label) above Search. Modes stay always-visible under
 * multi-mode pages (pinned count, no accordion).
 *
 * The dead labels are load-bearing here: `Triage Desk` was "everything
 * pointer-driven", `Print Stations` was "everything that ends at a printer".
 * Neither is a place an operator can predict, and both minted second front doors
 * for URLs a domain row already owned. They must never come back under another
 * name — see the "no residual grab-bag section" test at the bottom.
 *
 * SoT: SPINE_SECTIONS + spineSectionIdForPage + MAIN_GROUPS / STATION_GROUPS /
 *      DOMAIN_GROUPS
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
  DOMAIN_GROUPS,
  MAIN_GROUPS,
  SIDEBAR_PAGE_NAV,
  SPINE_SECTIONS,
  isSidebarPageReachable,
  spineSectionIdForPage,
  type DomainGroupId,
  type MainGroupId,
} from '@/lib/sidebar-navigation';
import { ChartPie, Home, Workflow } from '@/components/Icons';
import {
  SPINE_NEUTRAL_ACCENT,
  SPINE_SECTION_ACCENTS,
  spineAccentFor,
} from '@/lib/nav/spine-section-accent';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** The locked root order (§1.1 of the desk→domain split prompt). */
const SPINE_ORDER = [
  'monitor',
  'floor',
  'inbound',
  'catalog',
  'inventory',
  'fulfillment',
  'sales',
  'support',
  'studio',
] as const;

/** Flat L1 order inside each domain drill. */
const DOMAIN_FLAT_ORDER: Record<DomainGroupId, readonly string[]> = {
  inbound: ['incoming'],
  catalog: ['products'],
  inventory: ['inventory', 'sourcing', 'warehouse'],
  fulfillment: ['outbound'],
  sales: ['sales'],
  support: ['support'],
};

/** Labels an operator could not predict — never a root drill again. */
const DEAD_L1_PAGE_IDS = ['dashboard', 'review', 'print-labels', 'print-documents'] as const;

const DEAD_SECTION_LABELS = [
  'Triage Desk',
  'Print Stations',
  'Desk',
  'Floor',
  'Stock',
  'Misc',
  'Other',
] as const;

const ALLOWED_MAIN: ReadonlySet<MainGroupId> = new Set(['monitor', 'studio']);
const ALLOWED_DOMAIN: ReadonlySet<string> = new Set(DOMAIN_GROUPS.map((g) => g.id));

const LIST_SRC = code(sourceOf('./SidebarNavList.tsx'));
const MASTER_SRC = code(sourceOf('./MasterNav.tsx'));
const MOTION_SRC = code(
  sourceOf('../../../design-system/foundations/motion-framer.ts'),
);
const ACCENT_SRC = code(sourceOf('../../../lib/nav/spine-section-accent.ts'));

test('MAIN_GROUPS is Analytics Monitor then Workflow Studio', () => {
  assert.deepEqual(
    MAIN_GROUPS.map((g) => g.id),
    ['monitor', 'studio'],
  );
  assert.deepEqual(
    MAIN_GROUPS.map((g) => g.label),
    ['Analytics Monitor', 'Workflow Studio'],
  );
  assert.equal(MAIN_GROUPS[0]!.icon, ChartPie, 'monitor section icon is ChartPie');
  assert.equal(MAIN_GROUPS[1]!.icon, Workflow, 'studio section icon is Workflow');
});

test('DOMAIN_GROUPS is Inbound → Catalog → Inventory → Fulfillment → Sales → Support', () => {
  assert.deepEqual(
    DOMAIN_GROUPS.map((g) => g.id),
    ['inbound', 'catalog', 'inventory', 'fulfillment', 'sales', 'support'],
  );
  assert.deepEqual(
    DOMAIN_GROUPS.map((g) => g.label),
    ['Inbound', 'Catalog', 'Inventory', 'Fulfillment', 'Sales', 'Support'],
  );
  for (const g of DOMAIN_GROUPS) {
    assert.equal(typeof g.icon, 'function', `${g.id} must declare a section icon`);
  }
});

test('SPINE_SECTIONS is Monitor → Scan Stations → the six domains → Studio', () => {
  assert.deepEqual(SPINE_SECTIONS.map((d) => d.id), [...SPINE_ORDER]);
  assert.deepEqual(
    SPINE_SECTIONS.map((d) => d.label),
    [
      'Analytics Monitor',
      'Scan Stations',
      'Inbound',
      'Catalog',
      'Inventory',
      'Fulfillment',
      'Sales',
      'Support',
      'Workflow Studio',
    ],
  );
  for (const d of SPINE_SECTIONS) {
    assert.equal(typeof d.icon, 'function', `${d.id} must declare a section icon`);
  }
});

/**
 * The grab-bag is the failure mode, not the label. `desk` collected seven
 * unrelated pages behind "not a scanner"; `print` collected three URL aliases
 * behind "ends at a printer". A replacement under any name would re-create both.
 */
test('no residual grab-bag section survives under any name', () => {
  const labels = SPINE_SECTIONS.map((d) => d.label);
  const ids = SPINE_SECTIONS.map((d) => String(d.id));
  for (const dead of DEAD_SECTION_LABELS) {
    assert.equal(labels.includes(dead), false, `${dead} must not be a root section`);
  }
  assert.equal(ids.includes('desk'), false, 'the desk section id must stay retired');
  assert.equal(ids.includes('print'), false, 'the print section id must stay retired');
  // Section ids are unique and every one is reachable from a group registry.
  assert.equal(new Set(ids).size, ids.length, 'duplicate spine section id');

  // The pages those sections existed to hold must not come back as L1 rows
  // either: Dashboard's boards are domain modes (D5) and the print hub's rows
  // were aliases of URLs canonical pages already own (D2).
  const navIds = APP_SIDEBAR_NAV.map((i) => i.id);
  for (const dead of DEAD_L1_PAGE_IDS) {
    assert.equal(navIds.includes(dead), false, `${dead} must not own a spine row`);
  }
});

test('spineSectionIdForPage resolves main / station / domain, and nothing else', () => {
  assert.equal(spineSectionIdForPage({ kind: 'main', mainGroup: 'monitor' }), 'monitor');
  assert.equal(spineSectionIdForPage({ kind: 'main', mainGroup: 'studio' }), 'studio');
  assert.equal(spineSectionIdForPage({ kind: 'station', stationGroup: 'floor' }), 'floor');
  for (const g of DOMAIN_GROUPS) {
    assert.equal(spineSectionIdForPage({ kind: 'domain', domainGroup: g.id }), g.id);
  }
  assert.equal(spineSectionIdForPage({ kind: 'top' }), null);
  assert.equal(spineSectionIdForPage({ kind: 'bottom' }), null);
  assert.equal(spineSectionIdForPage(null), null);
});

test('Home then Search then Media then Chat are kind top', () => {
  const topIds = APP_SIDEBAR_NAV.filter((item) => item.kind === 'top').map((item) => item.id);
  assert.deepEqual(topIds, ['home', 'search', 'ops-photos', 'ai-chat']);
  const home = APP_SIDEBAR_NAV.find((item) => item.id === 'home');
  assert.equal(home?.kind, 'top');
  assert.equal(home?.label, 'Home');
  assert.equal(home?.icon, Home);
  const aiChat = APP_SIDEBAR_NAV.find((item) => item.id === 'ai-chat');
  assert.equal(aiChat?.kind, 'top');
  assert.equal(aiChat?.label, 'Chat');
});

test('every APP_SIDEBAR_NAV main declares mainGroup monitor|studio', () => {
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

test('Monitor mains are Operations only; Studio mains are Studio + Catalog', () => {
  const monitorIds = APP_SIDEBAR_NAV.filter(
    (item) => item.kind === 'main' && item.mainGroup === 'monitor',
  ).map((item) => item.id);
  assert.deepEqual(monitorIds, ['operations']);

  const studioIds = APP_SIDEBAR_NAV.filter(
    (item) => item.kind === 'main' && item.mainGroup === 'studio',
  ).map((item) => item.id);
  assert.deepEqual(studioIds, ['studio', 'studio-catalog']);
});

test('every APP_SIDEBAR_NAV domain row declares a known domainGroup', () => {
  const domains = APP_SIDEBAR_NAV.filter((item) => item.kind === 'domain');
  assert.ok(domains.length >= 6, `expected ≥6 domain rows, got ${domains.length}`);
  for (const item of domains) {
    assert.equal(item.kind, 'domain');
    assert.ok(
      ALLOWED_DOMAIN.has(item.domainGroup),
      `${item.id} has invalid domainGroup ${String((item as { domainGroup?: string }).domainGroup)}`,
    );
  }
});

test('each domain drill holds exactly its locked flat L1 order', () => {
  for (const group of DOMAIN_GROUPS) {
    const ids = APP_SIDEBAR_NAV.filter(
      (item) => spineSectionIdForPage(item) === group.id,
    ).map((item) => item.id);
    assert.deepEqual(ids, [...DOMAIN_FLAT_ORDER[group.id]], `${group.id} drill drift`);
  }
});

test('Catalog owns the product-label + manuals URLs — no second print row', () => {
  const ids = APP_SIDEBAR_NAV.map((item) => item.id);
  assert.equal(ids.includes('print-labels'), false, 'print-labels row must stay deleted');
  assert.equal(ids.includes('print-documents'), false, 'print-documents row must stay deleted');
  assert.equal(
    SIDEBAR_PAGE_NAV.some((p) => p.id === 'print-labels' || p.id === 'print-documents'),
    false,
    'print page-nav entries must stay deleted',
  );

  const products = APP_SIDEBAR_NAV.find((item) => item.id === 'products');
  assert.ok(products && products.kind === 'domain');
  assert.equal(products.domainGroup, 'catalog');
  assert.equal(products.label, 'Catalog', 'Products relabels to Catalog (D11)');
  assert.equal(products.href, '/products');

  const page = SIDEBAR_PAGE_NAV.find((p) => p.id === 'products');
  assert.ok(page);
  // Reference (not "Catalog") so the section and its browse mode differ (D11).
  const catalogMode = page!.modes?.find((m) => m.id === 'catalog');
  assert.ok(catalogMode, 'products keeps the stable `catalog` mode id');
  assert.equal(catalogMode!.label, 'Reference');
});

/**
 * Carrier postage is not a print destination and never merges into a label
 * workspace. `/shipping/labels` is the ONE home for buying postage.
 */
test('carrier Labels stays Fulfillment → Shipping, never Catalog/Inventory labels', () => {
  const outbound = APP_SIDEBAR_NAV.find((item) => item.id === 'outbound');
  assert.ok(outbound && outbound.kind === 'domain');
  assert.equal(outbound.domainGroup, 'fulfillment');
  assert.ok(outbound.href.startsWith('/shipping/'), 'Shipping L1 lands on a /shipping route');

  const products = SIDEBAR_PAGE_NAV.find((p) => p.id === 'products');
  for (const mode of products?.modes ?? []) {
    assert.equal(
      mode.to().pathname.startsWith('/shipping'),
      false,
      `Catalog mode ${mode.id} must not point at a carrier route`,
    );
  }
  const warehouse = SIDEBAR_PAGE_NAV.find((p) => p.id === 'warehouse');
  for (const mode of warehouse?.modes ?? []) {
    assert.equal(
      mode.to().pathname.startsWith('/shipping'),
      false,
      `Locations mode ${mode.id} must not point at a carrier route`,
    );
  }
});

/**
 * D10 — Review splits by JOB, and exactly ONE shape was picked: Packing Review
 * is a mode on Manage Shipping, not a standalone L1 beside it. Shipping both
 * would give packing QA two nav homes, which is the duplication the split exists
 * to remove.
 */
test('Review splits: packing → Fulfillment mode, pairing / catalog-link → Catalog', () => {
  assert.equal(
    APP_SIDEBAR_NAV.some((i) => i.id === 'review'),
    false,
    'no standalone Review L1 survives the split',
  );
  assert.equal(
    SIDEBAR_PAGE_NAV.some((p) => p.id === 'review'),
    false,
    'Review keeps no page-nav entry — its modes hang off the owning domains',
  );

  const outbound = SIDEBAR_PAGE_NAV.find((p) => p.id === 'outbound');
  const packingReview = outbound?.modes?.find((m) => m.id === 'review');
  assert.ok(packingReview, 'Manage Shipping is missing the Packing Review mode');
  assert.equal(packingReview!.label, 'Packing Review');
  assert.equal(packingReview!.requires, 'packing.review');
  // Packing is the bare-URL lane: the mode names NO `?mode=` value at all, so it
  // can only ever land there (`/review` constructs from its param spec, so a
  // `{ mode: null }` clear would be dead weight — see route-mode-registry.guard).
  assert.equal(packingReview!.to().pathname, '/review');
  assert.equal(packingReview!.to().params?.mode, undefined);

  const products = SIDEBAR_PAGE_NAV.find((p) => p.id === 'products');
  const pairing = products?.modes?.find((m) => m.id === 'pairing');
  const catalogLink = products?.modes?.find((m) => m.id === 'catalog-link');
  assert.ok(pairing, 'Catalog owns Pairing');
  assert.equal(pairing!.to().pathname, '/products');
  assert.ok(catalogLink, 'Catalog absorbed Review catalog-link');
  assert.equal(catalogLink!.to().pathname, '/review');
  assert.equal(catalogLink!.to().params?.mode, 'catalog-link');

  // Neither Review lane may reappear on a Fulfillment mode.
  for (const mode of outbound?.modes ?? []) {
    if (mode.id === 'review') continue;
    assert.equal(
      mode.to().pathname.startsWith('/review'),
      false,
      `Fulfillment mode ${mode.id} must not target the Review station`,
    );
  }
});

test('Inventory absorbs Sourcing + Locations (ex-Warehouse)', () => {
  const warehouse = APP_SIDEBAR_NAV.find((item) => item.id === 'warehouse');
  assert.ok(warehouse && warehouse.kind === 'domain');
  assert.equal(warehouse.domainGroup, 'inventory');
  assert.equal(warehouse.label, 'Locations', 'Warehouse relabels to Locations (D8)');
  // The bin/rack label printer is the Locations default tab — do not lose it.
  const page = SIDEBAR_PAGE_NAV.find((p) => p.id === 'warehouse');
  assert.deepEqual(page?.modes?.map((m) => m.id), ['labels', 'racks', 'rooms', 'bins', 'map']);

  const sourcing = APP_SIDEBAR_NAV.find((item) => item.id === 'sourcing');
  assert.ok(sourcing && sourcing.kind === 'domain');
  assert.equal(sourcing.domainGroup, 'inventory', 'Sourcing lives under Inventory (D9)');
});

test('SIDEBAR_PAGE_NAV domain pages declare a known domainGroup', () => {
  for (const page of SIDEBAR_PAGE_NAV) {
    if (page.kind !== 'domain') continue;
    assert.ok(
      ALLOWED_DOMAIN.has(page.domainGroup),
      `${page.id} has invalid domainGroup ${String(page.domainGroup)}`,
    );
  }
  // `fba` is URL-only (redirects into Shipping) — it owns no APP_SIDEBAR_NAV row.
  const fba = SIDEBAR_PAGE_NAV.find((p) => p.id === 'fba');
  assert.ok(fba, 'fba missing from SIDEBAR_PAGE_NAV');
  assert.equal(fba!.kind, 'domain');
});

test('Monitor mains precede Studio mains in APP_SIDEBAR_NAV', () => {
  const mains = APP_SIDEBAR_NAV.filter((item) => item.kind === 'main');
  const groups = mains.map((item) => item.mainGroup);
  const rank: Record<MainGroupId, number> = { monitor: 0, studio: 1 };
  for (let i = 1; i < groups.length; i++) {
    assert.ok(
      rank[groups[i]!] >= rank[groups[i - 1]!],
      `main row order regresses at ${mains[i]!.id} (${groups[i]} after ${groups[i - 1]})`,
    );
  }
});

test('SidebarNavList: section drills via SPINE_SECTIONS; no label twins; icons + ChevronRight', () => {
  assert.match(LIST_SRC, /SPINE_SECTIONS/);
  assert.match(LIST_SRC, /spineSectionIdForPage/);
  assert.match(LIST_SRC, /section\.icon/);
  assert.match(LIST_SRC, /TechRailSearchBar/);
  assert.match(LIST_SRC, /navFilter/);
  // The root map renders the WHOLE section list — narrowing is the search
  // body's job now, so the local section matcher is gone rather than merely
  // unused. See "a query flattens the body to ranked destinations".
  assert.doesNotMatch(LIST_SRC, /sectionMatchesNavFilter|pageMatchesDrillFilter/);
  assert.doesNotMatch(LIST_SRC, /['"]Overview['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Library['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Analytics Monitor['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Triage Desk['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Print Stations['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Workflow Studio['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Scan Stations['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Floor['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Desk['"]/);
  assert.doesNotMatch(LIST_SRC, /label: ['"]Stock['"]/);
  assert.doesNotMatch(LIST_SRC, /label: ['"]Labels['"]/);
  assert.doesNotMatch(LIST_SRC, /label: ['"]Products['"]/);
  // Every domain section label, too — membership is `spineSectionIdForPage`,
  // never a name the render path knows.
  for (const section of SPINE_SECTIONS) {
    assert.doesNotMatch(
      LIST_SRC,
      new RegExp(`['"]${section.label}['"]`),
      `SidebarNavList twins the ${section.id} section label`,
    );
  }
  // The page-id-keyed print alias predicate is gone with the print rows.
  assert.doesNotMatch(LIST_SRC, /isPrintAliasActive|printLabelsAliasModeId/);
  assert.doesNotMatch(LIST_SRC, /['"]print-labels['"]|['"]print-documents['"]/);
  assert.match(LIST_SRC, /ChevronRight/);
  assert.match(LIST_SRC, /ChevronLeft/);
  assert.match(LIST_SRC, /onDrillChange/);
  assert.match(LIST_SRC, /role=["']group["']/);
});

/**
 * Hollow domains are forbidden at BOTH altitudes: a section with no visible page
 * renders nothing on the root map, and a page whose every mode was
 * permission-filtered is dropped entirely rather than shown as a dead header
 * that opens onto a denial state.
 */
test('SidebarNavList: a section with no visible page renders nothing', () => {
  assert.match(LIST_SRC, /groupPages\.length === 0\) return null/);
  assert.match(MASTER_SRC, /isSidebarPageReachable/);
  // A modeless page is always reachable; only "declared modes, all filtered" drops.
  assert.equal(isSidebarPageReachable({ modes: undefined } as never), true);
  assert.equal(isSidebarPageReachable({ modes: [] } as never), false);
  assert.equal(isSidebarPageReachable({ modes: [{ id: 'x' }] } as never), true);
});

test('SidebarNavList: Home/Search/Media/Chat top pin; footer filter above Settings/Admin', () => {
  assert.match(LIST_SRC, /kind === ['"]top['"]/);
  assert.match(LIST_SRC, /border-b border-border-soft/);
  assert.match(LIST_SRC, /renderRow\(page, ['"]top['"]/);
  assert.match(LIST_SRC, /renderRow\(page, ['"]bottom['"]/);
  assert.match(LIST_SRC, /TechRailSearchBar/);
  // ONE placeholder: the box searches every destination, everywhere. It used to
  // say "Filter sections…" at the root and "Filter pages…" in a drill — two
  // behaviours from one field, and the root one described narrowing CATEGORIES
  // rather than reaching a page.
  assert.match(LIST_SRC, /placeholder="Go to…"/);
  assert.doesNotMatch(LIST_SRC, /Filter pages|Filter sections/);
  // Footer filter sits above the Admin/Settings pin — not inside the drill body.
  assert.doesNotMatch(LIST_SRC, /SearchField/);
  assert.doesNotMatch(LIST_SRC, /GlobalHeaderSearch/);
  assert.doesNotMatch(LIST_SRC, /HeaderAi/);
});

test('SidebarNavList: a query flattens the body to ranked destinations', () => {
  // Tree at rest, FLAT while searching. The old filter narrowed the section
  // BUTTONS, so typing a page's exact name returned a category that did not
  // contain the word and the operator still had to drill and re-scan.
  assert.match(LIST_SRC, /const searching = navFilter\.trim\(\)\.length > 0/);
  assert.match(LIST_SRC, /buildNavDestinations/);
  assert.match(LIST_SRC, /searchNav/);
  assert.match(LIST_SRC, /renderSearchResults/);
  // The shared matcher owns ranking + highlight offsets — no local includes().
  assert.match(LIST_SRC, /splitNavHighlight/);
  assert.doesNotMatch(LIST_SRC, /toLowerCase\(\)\.includes\(/);
  // Keyed on the MODE, never the query: typing updates in place instead of
  // replaying the crossfade on every keystroke.
  assert.match(LIST_SRC, /key=\{searching \? ['"]search['"] : \(drillId \?\? ['"]root['"]\)\}/);
  // Results are keyboard-reachable from the box that produced them.
  assert.match(LIST_SRC, /handleFilterKeyDown/);
  assert.match(LIST_SRC, /ArrowDown/);
  assert.match(LIST_SRC, /ArrowUp/);
  // Empty state names the query back.
  assert.match(LIST_SRC, /No destination matches/);
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
  assert.match(LIST_SRC, /spineAccentFor/);
  assert.match(LIST_SRC, /accent\.modeActive/);
  assert.match(LIST_SRC, /accent\.modeActiveIcon/);
});

test('SidebarNavList: idle page/section rows use default ink (type comfort); icons stay muted', () => {
  assert.match(LIST_SRC, /idlePageIcon/);
  assert.match(ACCENT_SRC, /text-text-default hover:bg-surface-canvas/);
  assert.match(ACCENT_SRC, /idlePageIcon: 'text-text-muted'/);
  assert.doesNotMatch(LIST_SRC, /text-text-muted hover:bg-surface-canvas hover:text-text-default/);
});

test('SidebarNavList: section accents come from SoT — no lone hardcoded bg-blue-600 active fill', () => {
  assert.match(LIST_SRC, /spineAccentFor/);
  assert.match(LIST_SRC, /accent\.activePage/);
  assert.doesNotMatch(LIST_SRC, /bg-blue-600 text-white/);
  assert.equal(spineAccentFor(null), SPINE_NEUTRAL_ACCENT);
  assert.equal(spineAccentFor('monitor'), SPINE_SECTION_ACCENTS.monitor);
  assert.match(SPINE_SECTION_ACCENTS.monitor.activePage, /sky-/);
  assert.match(SPINE_SECTION_ACCENTS.floor.activePage, /amber-/);
  assert.match(SPINE_SECTION_ACCENTS.inbound.activePage, /teal-/);
  assert.match(SPINE_SECTION_ACCENTS.catalog.activePage, /emerald-/);
  assert.match(SPINE_SECTION_ACCENTS.inventory.activePage, /cyan-/);
  assert.match(SPINE_SECTION_ACCENTS.fulfillment.activePage, /indigo-/);
  assert.match(SPINE_SECTION_ACCENTS.sales.activePage, /rose-/);
  assert.match(SPINE_SECTION_ACCENTS.support.activePage, /orange-/);
  assert.match(SPINE_SECTION_ACCENTS.studio.activePage, /violet-/);
  assert.match(SPINE_NEUTRAL_ACCENT.activePage, /blue-/);
  // Total map: a new section without a hue is a type error, and a stale one is
  // an extra key here.
  assert.deepEqual(
    Object.keys(SPINE_SECTION_ACCENTS).sort(),
    SPINE_SECTIONS.map((s) => String(s.id)).sort(),
  );
});

test('SidebarNavList: section drills use named spineDrill SoT (opacity-only; no inline x slide)', () => {
  assert.match(LIST_SRC, /framerPresence\.spineDrill/);
  assert.match(LIST_SRC, /framerTransition\.spineDrill/);
  assert.match(LIST_SRC, /useMotionPresence/);
  assert.match(LIST_SRC, /framerPresence\.spineActiveWash/);
  assert.match(LIST_SRC, /framerVariants\.spineRowStaggerContainer/);
  // Filter lives in the footer TechRailSearchBar — not a drill-mount motion slot.
  assert.doesNotMatch(LIST_SRC, /framerPresence\.spineDrillFilter/);
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

/**
 * ONE cascade for both altitudes of the drill list. Page rows and the mode rows
 * nested under them used to run on different ladders (modes staggered at 40ms,
 * pages not at all), which made a 4-mode page resolve slower than the 12-page
 * section containing it — the cascade read as lag rather than as order.
 */
test('SidebarNavList: page rows and mode rows share ONE 15ms row cascade', () => {
  // Both list containers compose the same variants — no second ladder.
  assert.match(LIST_SRC, /framerVariants\.spineRowStaggerContainer/);
  assert.match(LIST_SRC, /framerVariants\.spineRowStaggerItem/);
  assert.doesNotMatch(LIST_SRC, /spineModeStagger/);
  assert.doesNotMatch(MOTION_SRC, /spineModeStagger/);

  // 15ms × index, 120ms mount: an 8-row list resolves at 225ms.
  assert.match(MOTION_SRC, /spineRowStagger:\s*0\.015/);
  assert.match(MOTION_SRC, /spineRowMount:\s*0\.12/);

  // Travel is capped at 2px of y — the row itself never moves or scales.
  const itemBlock = MOTION_SRC.match(
    /spineRowStaggerItem:\s*\{[\s\S]*?\n {2}\},/,
  )?.[0];
  assert.ok(itemBlock, 'spineRowStaggerItem block missing');
  assert.match(itemBlock, /hidden:\s*\{\s*opacity:\s*0,\s*y:\s*2\s*\}/);
  assert.doesNotMatch(itemBlock, /\bx\s*:/);
  assert.doesNotMatch(itemBlock, /scale/);
});

/**
 * The container's identity is the SECTION, never the query or the filtered
 * array. Keying on either replays the whole cascade on every keystroke, under
 * the operator's cursor, in a list they are actively reading.
 */
test('SidebarNavList: drill cascade keys on the section, not the filter', () => {
  assert.match(LIST_SRC, /key=\{`drill-rows-\$\{section\.id\}`\}/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*navFilter/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*drillFilter/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*groupPages/);
  // Rows that newly match mid-type inherit `visible` instead of fading in solo.
  assert.match(LIST_SRC, /rowStaggerInitial[^=]*=\s*filterTouched\s*\?\s*false\s*:\s*'hidden'/);
  // Gate on TOUCHED, never on "a filter is active" — keying off the value
  // re-armed the cascade the moment the operator cleared the box, so
  // backspacing to empty re-faded the whole list. Clearing is still filtering.
  assert.doesNotMatch(LIST_SRC, /rowStaggerInitial[^=]*=\s*navFilter/);
  assert.doesNotMatch(LIST_SRC, /rowStaggerInitial[^=]*=\s*drillFilter/);
  // Touch flag syncs from the preserved query on SECTION enter (ref read) —
  // empty → cascade; non-empty → skip so root→drill keeps the narrowed list.
  assert.match(
    LIST_SRC,
    /setFilterTouched\(Boolean\(navFilterRef\.current\.trim\(\)\)\)[\s\S]{0,40}\}, \[drillId\]\)/,
  );
});

/**
 * Hover/press travel is CSS on the 14px glyph — never JS, never the row.
 *
 * A framer `whileHover` on a spine row re-renders React on every mousemove
 * across a 20-row list for 2px of travel a compositor transform gives free; a
 * row-level scale breaks the baseline every dense surface beside it aligns to;
 * and a weight shift on hover/active reflows text mid-pointer.
 */
test('SidebarNavList: icon-only CSS lift — no whileHover, no row scale, no weight shift', () => {
  assert.match(LIST_SRC, /SPINE_ICON_LIFT_CLASS/);
  assert.doesNotMatch(LIST_SRC, /whileHover|whileTap/);
  assert.doesNotMatch(LIST_SRC, /hover:scale|active:scale|group-hover:scale/);
  assert.doesNotMatch(LIST_SRC, /hover:font-|group-hover:font-/);
  // The house weight cap: nothing above 600 anywhere in the spine.
  // Built from parts so this assertion itself does not trip the weight-cap ratchet.
  assert.doesNotMatch(
    LIST_SRC,
    new RegExp(`font-${'bold'}|font-${'extrabold'}|font-${'black'}`),
  );
  // A page/mode row that carries the lift must own the `group` hook.
  assert.match(LIST_SRC, /ds-raw-button group flex w-full/);
  // Travel + the reduced-motion gate live in the SoT, not at the call site.
  assert.doesNotMatch(LIST_SRC, /group-hover:translate/);
  assert.match(ACCENT_SRC, /motion-safe:group-hover:translate-x-0\.5/);
  assert.match(ACCENT_SRC, /motion-safe:group-hover:-translate-y-px/);
  assert.match(ACCENT_SRC, /motion-safe:group-active:translate-x-px/);
});

/**
 * An active destination is a fill PLUS an inset hairline — the "seated chip"
 * grain, not a bare colour swatch.
 *
 * And `floor` fills at amber-700: amber-600 on white is ~2.9:1, below the WCAG
 * AA 4.5:1 floor for the 12px caption these rows use. Scan Stations is read
 * across a warehouse aisle; it is the last section that may ship that.
 */
test('spine accents: active rows carry an inset hairline; amber clears WCAG AA', () => {
  for (const [id, accent] of Object.entries(SPINE_SECTION_ACCENTS)) {
    assert.match(accent.activePage, /ring-1 ring-inset ring-/, `${id} activePage ring`);
    assert.match(accent.modeActive, /ring-1 ring-inset ring-/, `${id} modeActive ring`);
  }
  assert.match(SPINE_NEUTRAL_ACCENT.activePage, /ring-1 ring-inset ring-/);
  assert.match(SPINE_NEUTRAL_ACCENT.modeActive, /ring-1 ring-inset ring-/);
  assert.match(SPINE_SECTION_ACCENTS.floor.activePage, /bg-amber-700\b/);
  assert.doesNotMatch(SPINE_SECTION_ACCENTS.floor.activePage, /bg-amber-600\b/);
});

/**
 * The two registries are one declaration split in half, not two opinions.
 *
 * `MasterNav`'s `toPageNav` merges them as `{ ...page, icon, label }` — so for
 * any page that owns a `SIDEBAR_PAGE_NAV` entry, EVERY membership field
 * (`kind` / `mainGroup` / `stationGroup` / `stationSubgroup` / `domainGroup` /
 * `href` / `requires`) is read off the mode registry and the flat row's copy is
 * inert.
 * A disagreement therefore does not error and does not render twice: the mode
 * registry silently wins and the `APP_SIDEBAR_NAV` value becomes a comment that
 * lies.
 *
 * That is not hypothetical — `sourcing` once carried `kind: 'main'` /
 * `mainGroup: 'overview'` here while `SIDEBAR_PAGE_NAV` said `'stock'`, and the
 * spine rendered it under Stock for the whole time the handoff's "locked" map
 * claimed Overview. The per-registry tests above both passed throughout, because
 * neither one compared the two. This one does.
 */
test('APP_SIDEBAR_NAV and SIDEBAR_PAGE_NAV agree on every shared membership field', () => {
  const pageById = new Map(SIDEBAR_PAGE_NAV.map((p) => [p.id, p as Record<string, unknown>]));
  const FIELDS = [
    'href',
    'kind',
    'mainGroup',
    'stationGroup',
    'stationSubgroup',
    'domainGroup',
    'requires',
  ] as const;

  for (const item of APP_SIDEBAR_NAV) {
    const page = pageById.get(item.id);
    if (!page) continue; // modeless row — the flat item is used verbatim
    const flat = item as unknown as Record<string, unknown>;
    for (const field of FIELDS) {
      assert.equal(
        flat[field],
        page[field],
        `${item.id}.${field} drift — APP_SIDEBAR_NAV says ${JSON.stringify(flat[field])}, ` +
          `SIDEBAR_PAGE_NAV says ${JSON.stringify(page[field])}. toPageNav spreads ` +
          `...page, so SIDEBAR_PAGE_NAV wins and the APP_SIDEBAR_NAV value never renders.`,
      );
    }
  }
});

test('MasterNav merges the registries as { ...page } — the parity guard above is load-bearing', () => {
  // If this merge ever stops preferring `page`, the parity assertion's rationale
  // changes and both must be revisited together.
  assert.match(MASTER_SRC, /\{\s*\.\.\.page,\s*icon:\s*item\.icon,\s*label:\s*item\.label\s*\}/);
});

test('MasterNav: auto-drill on section change does not steal focus', () => {
  assert.match(MASTER_SRC, /spineSectionIdForPage/);
  assert.match(MASTER_SRC, /setDrillId\(activeSection\)/);
  assert.doesNotMatch(MASTER_SRC, /\.focus\s*\(/);
  assert.doesNotMatch(MASTER_SRC, /autoFocus/);
});
