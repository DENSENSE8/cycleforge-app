/**
 * Source guard: the spine body is ONE FLAT MAP (2026-08-02). Sections
 * (Live Ops / Scan Stations / Inbound / Catalog / Inventory /
 * Outbound / Sales / Support) contribute a `border-t` and an accessible
 * name — never a header row, which would duplicate the page name beneath it.
 * The drill they used to open is deleted. Home is top-pinned (house glyph +
 * Home label) above Search; **Workflow Studio is FOOTER-pinned above Admin**.
 * A multi-mode page draws its children only while it is the ACTIVE page (the
 * count chip is shown regardless); a pinned row never draws children at all.
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
import { SPINE_NEUTRAL_ACCENT, spineAccentFor } from '@/lib/nav/spine-section-accent';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** The locked root order (operator 2026-08-03). */
const SPINE_ORDER = [
  'floor',
  'fulfillment',
  'sales',
  'inbound',
  'monitor',
  'support',
  'sourcing',
  'catalog',
  'inventory',
] as const;

/** Flat L1 order inside each domain drill. */
const DOMAIN_FLAT_ORDER: Record<DomainGroupId, readonly string[]> = {
  fulfillment: ['outbound'],
  sales: ['sales'],
  inbound: ['incoming'],
  support: ['support'],
  sourcing: ['sourcing'],
  catalog: ['products'],
  inventory: ['inventory'],
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

const ALLOWED_MAIN: ReadonlySet<MainGroupId> = new Set(['monitor']);
const ALLOWED_DOMAIN: ReadonlySet<string> = new Set(DOMAIN_GROUPS.map((g) => g.id));

const LIST_SRC = code(sourceOf('./SidebarNavList.tsx'));
const SPINE_TOP_PINS = code(sourceOf('./SpineTopPins.tsx'));
const HEADER = code(sourceOf('../../layout/GlobalHeader.tsx'));
const HEADER_ACTIONS_SRC = code(sourceOf('../../layout/GlobalHeaderActions.tsx'));
const MASTER_SRC = code(sourceOf('./MasterNav.tsx'));
const MOTION_SRC = code(
  sourceOf('../../../design-system/foundations/motion-framer.ts'),
);
const ACCENT_SRC = code(sourceOf('../../../lib/nav/spine-section-accent.ts'));
const VIEW_SRC = code(sourceOf('./MasterNavView.tsx'));
const SEARCH_BAR_SRC = code(sourceOf('../tech/TechRailSearchBar.tsx'));

test('MAIN_GROUPS is Operations alone — Studio left for the footer', () => {
  assert.deepEqual(
    MAIN_GROUPS.map((g) => g.id),
    ['monitor'],
  );
  assert.deepEqual(
    MAIN_GROUPS.map((g) => g.label),
    ['Operations'],
  );
  assert.equal(MAIN_GROUPS[0]!.icon, ChartPie, 'monitor section icon is ChartPie');
});

test('DOMAIN_GROUPS is Shipping → Sales → Inbound → Support → Sourcing → Products → Inventory', () => {
  assert.deepEqual(
    DOMAIN_GROUPS.map((g) => g.id),
    ['fulfillment', 'sales', 'inbound', 'support', 'sourcing', 'catalog', 'inventory'],
  );
  assert.deepEqual(
    DOMAIN_GROUPS.map((g) => g.label),
    ['Shipping', 'Sales', 'Inbound', 'Support', 'Sourcing', 'Products', 'Inventory'],
  );
  for (const g of DOMAIN_GROUPS) {
    assert.equal(typeof g.icon, 'function', `${g.id} must declare a section icon`);
  }
});

test('SPINE_SECTIONS is Scan Stations → Shipping → Sales → Inbound → Operations → Support → Sourcing → Products → Inventory', () => {
  assert.deepEqual(SPINE_SECTIONS.map((d) => d.id), [...SPINE_ORDER]);
  assert.deepEqual(
    SPINE_SECTIONS.map((d) => d.label),
    [
      'Scan Stations',
      'Shipping',
      'Sales',
      'Inbound',
      'Operations',
      'Support',
      'Sourcing',
      'Products',
      'Inventory',
    ],
  );
  assert.equal(
    SPINE_SECTIONS.some((d) => String(d.id) === 'studio'),
    false,
    'Workflow Studio is a footer pin, not a root drill',
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
  assert.equal(spineSectionIdForPage({ kind: 'station', stationGroup: 'floor' }), 'floor');
  for (const g of DOMAIN_GROUPS) {
    assert.equal(spineSectionIdForPage({ kind: 'domain', domainGroup: g.id }), g.id);
  }
  assert.equal(spineSectionIdForPage({ kind: 'top' }), null);
  assert.equal(spineSectionIdForPage({ kind: 'bottom' }), null);
  assert.equal(spineSectionIdForPage(null), null);
});

test('Home then Search then Media then Plans then Chat are kind top', () => {
  const topIds = APP_SIDEBAR_NAV.filter((item) => item.kind === 'top').map((item) => item.id);
  assert.deepEqual(topIds, ['home', 'search', 'ops-photos', 'plans-live', 'ai-chat']);
  const home = APP_SIDEBAR_NAV.find((item) => item.id === 'home');
  assert.equal(home?.kind, 'top');
  assert.equal(home?.label, 'Home');
  assert.equal(home?.icon, Home);
  const plans = APP_SIDEBAR_NAV.find((item) => item.id === 'plans-live');
  assert.equal(plans?.kind, 'top');
  assert.equal(plans?.label, 'Plans');
  assert.equal(plans?.href, '/?mode=forge&view=live');
  assert.equal(plans?.requires, 'operations.plans.view');
  const aiChat = APP_SIDEBAR_NAV.find((item) => item.id === 'ai-chat');
  assert.equal(aiChat?.kind, 'top');
  assert.equal(aiChat?.label, 'Chat');
});

test('every APP_SIDEBAR_NAV main declares mainGroup monitor', () => {
  const mains = APP_SIDEBAR_NAV.filter((item) => item.kind === 'main');
  assert.ok(mains.length >= 1, `expected ≥1 main row, got ${mains.length}`);
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

test('Monitor mains are Operations only', () => {
  const monitorIds = APP_SIDEBAR_NAV.filter(
    (item) => item.kind === 'main' && item.mainGroup === 'monitor',
  ).map((item) => item.id);
  assert.deepEqual(monitorIds, ['operations']);
});

/**
 * Workflow Studio is a FOOTER PIN above Admin (2026-08-02), not a tenth root
 * drill: defining the operation is a standing-back act, not one of the places an
 * operator browses through in a shift.
 *
 * The reachability half is the load-bearing part. `renderRow` computes
 * `showChildren = !opts?.pinned && modeCount > 1`, so a pinned row NEVER draws
 * children — moving Studio to the footer as a pair of flat rows would have put
 * `/studio/catalog` on the spine twice or nowhere. It survives as an L2 mode, so
 * ⌘K, the spine's flat search (`buildNavDestinations` emits modes) and the
 * GlobalHeader Mode switcher all still name it.
 */
test('Workflow Studio is a footer pin above Admin; Catalog rides as its L2 mode', () => {
  const footerIds = APP_SIDEBAR_NAV.filter(
    (item) => (item.kind ?? 'bottom') === 'bottom',
  ).map((item) => item.id);
  assert.deepEqual(footerIds, ['studio', 'admin', 'settings'], 'footer band order');

  const studio = APP_SIDEBAR_NAV.find((item) => item.id === 'studio');
  assert.ok(studio);
  assert.equal(studio!.kind, 'bottom');
  assert.equal(studio!.label, 'Workflow Studio');
  assert.equal(studio!.icon, Workflow);
  assert.equal(studio!.href, '/studio');
  assert.equal(
    (studio as { mainGroup?: string }).mainGroup,
    undefined,
    'a footer pin belongs to no section',
  );

  // The second flat row is gone — not relocated into the footer beside its parent.
  assert.equal(
    APP_SIDEBAR_NAV.some((item) => item.id === 'studio-catalog'),
    false,
    'studio-catalog must not own a spine row',
  );

  const page = SIDEBAR_PAGE_NAV.find((p) => p.id === 'studio');
  assert.ok(page, 'studio needs a mode registry — it is the only thing naming /studio/catalog');
  assert.deepEqual(page!.children?.map((m) => m.id), ['graph', 'catalog']);
  assert.equal(page!.children?.find((m) => m.id === 'catalog')?.to().pathname, '/studio/catalog');
  assert.equal(page!.resolveChild?.({ pathname: '/studio/catalog', params: new URLSearchParams() }), 'catalog');
  assert.equal(page!.resolveChild?.({ pathname: '/studio', params: new URLSearchParams() }), 'graph');
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
  assert.equal(products.label, 'Products', 'Catalog section ships as Products on the spine');
  assert.equal(products.href, '/products');

  const page = SIDEBAR_PAGE_NAV.find((p) => p.id === 'products');
  assert.ok(page);
  // Reference (not "Products") so browse mode and page label differ.
  const catalogMode = page!.children?.find((m) => m.id === 'catalog');
  assert.ok(catalogMode, 'products keeps the stable `catalog` mode id');
  assert.equal(catalogMode!.label, 'Reference');
  assert.equal(page!.label, 'Products');
});

/**
 * Carrier postage is not a print destination and never merges into a label
 * workspace. `/shipping/labels` is the ONE home for buying postage.
 */
test('carrier Postage stays Outbound → Shipping, never Catalog/Inventory labels', () => {
  const outbound = APP_SIDEBAR_NAV.find((item) => item.id === 'outbound');
  assert.ok(outbound && outbound.kind === 'domain');
  assert.equal(outbound.domainGroup, 'fulfillment');
  assert.ok(outbound.href.startsWith('/shipping/'), 'Shipping L1 lands on a /shipping route');

  const products = SIDEBAR_PAGE_NAV.find((p) => p.id === 'products');
  for (const mode of products?.children ?? []) {
    assert.equal(
      mode.to().pathname.startsWith('/shipping'),
      false,
      `Catalog child ${mode.id} must not point at a carrier route`,
    );
  }
  const inventory = SIDEBAR_PAGE_NAV.find((p) => p.id === 'inventory');
  for (const mode of inventory?.children ?? []) {
    assert.equal(
      mode.to().pathname.startsWith('/shipping'),
      false,
      `Inventory child ${mode.id} must not point at a carrier route`,
    );
  }
});

/**
 * D10 — Review splits by JOB, and exactly ONE shape was picked: Packing Review
 * is a mode on Manage Shipping, not a standalone L1 beside it. Shipping both
 * would give packing QA two nav homes, which is the duplication the split exists
 * to remove.
 */
test('Review splits: packing → Outbound child, pairing / catalog-link → Catalog', () => {
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
  const packingReview = outbound?.children?.find((m) => m.id === 'review');
  assert.ok(packingReview, 'Manage Shipping is missing the Packing Review mode');
  assert.equal(packingReview!.label, 'Packing Review');
  assert.equal(packingReview!.requires, 'packing.review');
  // Packing is the bare-URL lane: the mode names NO `?mode=` value at all, so it
  // can only ever land there (`/review` constructs from its param spec, so a
  // `{ mode: null }` clear would be dead weight — see route-mode-registry.guard).
  assert.equal(packingReview!.to().pathname, '/review');
  assert.equal(packingReview!.to().params?.mode, undefined);

  const products = SIDEBAR_PAGE_NAV.find((p) => p.id === 'products');
  const pairing = products?.children?.find((m) => m.id === 'pairing');
  const catalogLink = products?.children?.find((m) => m.id === 'catalog-link');
  assert.ok(pairing, 'Catalog owns Pairing');
  assert.equal(pairing!.to().pathname, '/products');
  assert.ok(catalogLink, 'Catalog absorbed Review catalog-link');
  assert.equal(catalogLink!.to().pathname, '/review');
  assert.equal(catalogLink!.to().params?.mode, 'catalog-link');

  // Neither Review lane may reappear on an Outbound child.
  for (const mode of outbound?.children ?? []) {
    if (mode.id === 'review') continue;
    assert.equal(
      mode.to().pathname.startsWith('/review'),
      false,
      `Outbound child ${mode.id} must not target the Review station`,
    );
  }
});

test('Inventory owns Locations as an L2 child; Sourcing is its own spine section', () => {
  assert.equal(
    APP_SIDEBAR_NAV.find((item) => item.id === 'warehouse'),
    undefined,
    'Locations is no longer a spine L1',
  );
  const inventory = APP_SIDEBAR_NAV.find((item) => item.id === 'inventory');
  assert.ok(inventory && inventory.kind === 'domain');
  assert.equal(inventory.domainGroup, 'inventory');

  const page = SIDEBAR_PAGE_NAV.find((p) => p.id === 'inventory');
  assert.ok(page?.children?.some((m) => m.id === 'locations'), 'Inventory lost Locations L2');
  const locations = page?.children?.find((m) => m.id === 'locations');
  assert.equal(locations?.to().pathname, '/inventory/locations');

  const sourcing = APP_SIDEBAR_NAV.find((item) => item.id === 'sourcing');
  assert.ok(sourcing && sourcing.kind === 'domain');
  assert.equal(sourcing.domainGroup, 'sourcing', 'Sourcing is its own spine section');
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

/**
 * The footer renders in ARRAY ORDER (`bottomPages.map`), so placement here is
 * placement on screen — there is no separate footer ordering registry to keep in
 * sync, and none should be added.
 */
test('APP_SIDEBAR_NAV rows are grouped: top → sections → footer', () => {
  const rank = (kind: string | undefined) =>
    kind === 'top' ? 0 : (kind ?? 'bottom') === 'bottom' ? 2 : 1;
  const ranks = APP_SIDEBAR_NAV.map((item) => rank(item.kind));
  for (let i = 1; i < ranks.length; i++) {
    assert.ok(
      ranks[i]! >= ranks[i - 1]!,
      `row order regresses at ${APP_SIDEBAR_NAV[i]!.id} — top pins, then section ` +
        `rows, then footer pins, in array order`,
    );
  }
});

test('SidebarNavList: the flat map is built from SPINE_SECTIONS; no label twins', () => {
  assert.match(LIST_SRC, /SPINE_SECTIONS/);
  assert.match(LIST_SRC, /spineSectionIdForPage/);
  assert.match(LIST_SRC, /TechRailSearchBar/);
  assert.match(LIST_SRC, /navFilter/);
  // The root map renders the WHOLE section list — narrowing is the search
  // body's job now, so the local section matcher is gone rather than merely
  // unused. See "a query flattens the body to ranked destinations".
  assert.doesNotMatch(LIST_SRC, /sectionMatchesNavFilter|pageMatchesDrillFilter/);
  assert.doesNotMatch(LIST_SRC, /['"]Overview['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Library['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Analytics Monitor['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Live Ops['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Outbound['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Operations['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Products['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Shipping['"]/);
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
  assert.match(LIST_SRC, /role=["']group["']/);
});

/**
 * Scan Stations is the ONE Vercel-style list-replace drill (2026-08-03).
 * Domains stay on the flat map — restoring an all-sections drill would bring
 * back `Catalog › Catalog`. Floor alone earns Back + ChevronsRight (») because
 * it holds multiple categories — a single › would collide with disclosure.
 */
test('SidebarNavList: Scan Stations is the only Vercel drill; domains stay flat', () => {
  // No all-sections drill state (the deleted shape).
  for (const src of [LIST_SRC, MASTER_SRC, VIEW_SRC]) {
    assert.doesNotMatch(src, /\bdrillId\b|\bonDrillChange\b|\bsetDrillId\b|\brenderDrill\b|\brenderRoot\b/);
  }
  // Floor-only drill plumbing.
  assert.match(LIST_SRC, /stationsDrillOpen/);
  assert.match(LIST_SRC, /onStationsDrillChange/);
  assert.match(LIST_SRC, /renderStationsEnterRow/);
  assert.match(LIST_SRC, /renderStationsDrill/);
  assert.match(LIST_SRC, /ChevronsRight/);
  assert.doesNotMatch(LIST_SRC, /\bChevronRight\b/);
  assert.match(LIST_SRC, /ChevronLeft/);
  assert.match(LIST_SRC, /Back to pages/);
  assert.match(LIST_SRC, /Open \$\{section\.label\}/);
  // Enter row shares renderPageHeader chrome (h-9) + drill trailing — no navigate.
  const enterRow = LIST_SRC.match(/const renderStationsEnterRow[\s\S]*?\n {2}\};\n/)?.[0];
  assert.ok(enterRow, 'renderStationsEnterRow block missing');
  assert.doesNotMatch(enterRow, /onNavigate/);
  assert.match(enterRow, /renderPageHeader/);
  assert.match(enterRow, /drill:\s*true/);
  assert.doesNotMatch(enterRow, /text-role-eyebrow/);
  // Enter + back + every L1 page header share one fixed row height.
  assert.match(LIST_SRC, /flex h-9 w-full items-center/);
  assert.match(LIST_SRC, /grid h-9 w-full grid-cols-\[1\.25rem_1fr_1\.25rem\]/);
  // Sections are spaced, not ruled.
  assert.match(LIST_SRC, /index > 0 && 'mt-1'/);
  assert.doesNotMatch(LIST_SRC, /index > 0 && 'mt-1 border-t/);
});

/**
 * Hollow domains are forbidden at BOTH altitudes: a section with no visible page
 * renders nothing on the root map, and a page whose every mode was
 * permission-filtered is dropped entirely rather than shown as a dead header
 * that opens onto a denial state.
 */
test('SidebarNavList: a section with no visible page renders nothing', () => {
  // Hollow stays forbidden through the flatten: a section whose every page was
  // permission-filtered contributes no rows AND no divider.
  assert.match(LIST_SRC, /\.filter\(\(g\) => g\.pages\.length > 0\)/);
  assert.match(MASTER_SRC, /isSidebarPageReachable/);
  // A modeless page is always reachable; only "declared modes, all filtered" drops.
  assert.equal(isSidebarPageReachable({ children: undefined } as never), true);
  assert.equal(isSidebarPageReachable({ children: [] } as never), false);
  assert.equal(isSidebarPageReachable({ children: [{ id: 'x' }] } as never), true);
});

test('SidebarNavList: top pins are band icons, not rows; footer filter above Settings/Admin', () => {
  // Home / Search / Media / Plans / Chat stopped being spine ROWS on
  // 2026-08-03: they cost the map vertical space as rows. They are icons in
  // the spine's own 40px top band now (`SpineTopPins`), where the height is
  // already reserved by the header seam so they cost the map nothing. They
  // remain `kind: 'top'` in the registry — ⌘K and the flat search still rank
  // them — so what must never come back is the ROW, not the entry.
  assert.doesNotMatch(LIST_SRC, /kind === ['"]top['"]/);
  assert.doesNotMatch(LIST_SRC, /renderRow\(page, ['"]top['"]/);
  assert.match(SPINE_TOP_PINS, /kind === ['"]top['"]/);
  assert.match(SPINE_TOP_PINS, /export function TopDestinationPins/);
  assert.match(SPINE_TOP_PINS, /export function SpineTopPins/);
  // ONE resident home while the spine is open: the band inside MasterNavView.
  // Collapsed cold-load reachability is a gated peek on the toggle
  // (`SidebarCollapseControl` + `TopDestinationPins layout="cluster"`) — never
  // a permanent second door in GlobalHeader / GlobalHeaderActions.
  assert.match(VIEW_SRC, /SpineTopPins/);
  assert.doesNotMatch(HEADER, /<SpineTopPins|<TopDestinationPins/);
  assert.doesNotMatch(HEADER_ACTIONS_SRC, /HeaderTopPins|SpineTopPins|TopDestinationPins/);
  const COLLAPSE = code(sourceOf('../../layout/SidebarCollapseControl.tsx'));
  assert.match(COLLAPSE, /sidebarCollapsed/);
  assert.match(COLLAPSE, /TopDestinationPins/);
  assert.match(COLLAPSE, /layout="cluster"/);
  assert.match(COLLAPSE, /useRailHoverPreview/);
  assert.match(HEADER, /SidebarCollapseControl/);
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

/**
 * The filter band is a ROW (~33px), shared by MasterNav spine and station
 * recent rails. `density` defaults to `row`; the taller `default` /
 * `inset-field` dock is an escape hatch only. The band owns its whole padding
 * story — never a host `className` with raw padding, because `inset-field` is a
 * Tier-2 intent and both survive `cn()` with the intent winning in CSS order.
 *
 * The 32px `SearchField size="compact"` control is untouched either way. The
 * 12px horizontal inset is shared so the search glyph keeps the nav rows'
 * glyph column.
 */
test('spine + station rail search band is row-dense by default', () => {
  assert.match(SEARCH_BAR_SRC, /density\?: 'default' \| 'row'/);
  assert.match(SEARCH_BAR_SRC, /density === 'row'\s*\?\s*'px-3'\s*:\s*'inset-field'/);
  // Rail footers must not inherit spreadsheet `--cf-density` zoom — they share
  // height with context-rail siblings that sit outside the zoom host.
  assert.match(SEARCH_BAR_SRC, /--cf-density['"]?:\s*['"]1['"]/);
  assert.match(SEARCH_BAR_SRC, /density = 'row'/, 'row is the shared default');
  // The band owns its whole padding story — the host names a density and never
  // reaches in with a className.
  const mount = LIST_SRC.match(/<TechRailSearchBar[\s\S]*?\/>/)?.[0];
  assert.ok(mount, 'SidebarNavList must mount TechRailSearchBar');
  assert.match(mount, /density="row"/);
  assert.doesNotMatch(mount, /className/);
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
  // replaying the crossfade on every keystroke. Three KINDS of body: map,
  // Scan Stations drill, or ranked results.
  assert.match(
    LIST_SRC,
    /key=\{searching \? ['"]search['"] : stationsDrillOpen \? ['"]stations-drill['"] : ['"]map['"]\}/,
  );
  // Results are keyboard-reachable from the box that produced them.
  assert.match(LIST_SRC, /handleFilterKeyDown/);
  assert.match(LIST_SRC, /ArrowDown/);
  assert.match(LIST_SRC, /ArrowUp/);
  // Empty state names the query back.
  assert.match(LIST_SRC, /No destination matches/);
});

test('SidebarNavList: destinations sit one step above modes in the type ladder', () => {
  // The spine had NO size hierarchy — every row was `role-caption` (12px) and
  // pages differed from modes only by weight, which is the thinnest signal in
  // the system. 12px also sat below every peer navigator (VS Code 13, Linear
  // 13, Notion 14, Slack 15, Vercel 14).
  //
  // One size for "a destination" — section drills, L1 pages, the drill title
  // and search results all `role-body` (14px). Modes stay `role-caption`, so
  // they finally read as the nested tier rather than as a lighter sibling.
  //
  // The count dropped 4 → 2 when the drill went: the section-button row and the
  // drill title were two of the four, and both are deleted rather than restyled.
  // What survives is the page/subgroup header and the search-result row.
  const destinationRows = LIST_SRC.match(/text-role-body font-semibold/g) ?? [];
  assert.ok(
    destinationRows.length >= 2,
    `expected ≥2 role-body destination rows (page header · search result), ` +
      `found ${destinationRows.length}`,
  );
  // Modes must NOT be bumped with them — that would flatten the ladder again.
  assert.match(LIST_SRC, /text-role-caption font-medium/);
  // The third rung of this ladder used to be the count badge, pinned at
  // `role-micro` so it could not compete with the label it annotated. The badge
  // was deleted 2026-08-03 (see the no-badge test below), so the rung is gone
  // rather than resized — there is no longer a third kind of text in a spine
  // row. Its absence is asserted there; re-pinning it here would resurrect it.
});

test('SidebarNavList: Scan Stations drill back header is the Vercel back+title row', () => {
  const drill = LIST_SRC.match(/const renderStationsDrill[\s\S]*?\n {2}\};\n/)?.[0];
  assert.ok(drill, 'renderStationsDrill block missing');
  assert.match(drill, /text-center text-role-body/);
  assert.match(drill, /grid-cols-\[1\.25rem_1fr_1\.25rem\]/);
  assert.match(drill, /Back to pages/);
  assert.match(drill, /ChevronLeft/);
  // Domains must not grow a twin back header.
  assert.equal(
    (LIST_SRC.match(/Back to pages/g) ?? []).length,
    1,
    'only Scan Stations owns a Back header',
  );
});

test('SidebarNavList: pages lead, modes nest; multi-child L1 is accordion expand-only', () => {
  // Pages and modes no longer share a size — see "destinations sit one step
  // above modes". Destinations are role-body; modes stay role-caption/medium.
  assert.match(LIST_SRC, /text-role-body font-semibold/);
  assert.match(LIST_SRC, /text-role-caption font-medium/);
  assert.doesNotMatch(
    LIST_SRC,
    /text-role-caption font-semibold/,
    'a semibold caption row is the old flat ladder — destinations are role-body',
  );
  assert.doesNotMatch(LIST_SRC, /text-role-eyebrow font-semibold/);
  // Every in-place nest draws the disclosure chevron (Receiving · Locations /
  // Catalog / …). Scan Stations uses a separate `drill` trailing (ChevronsRight)
  // so enter does not look like disclose.
  const pageHeader = LIST_SRC.match(/const renderPageHeader[\s\S]*?\n {2}\};\n/)?.[0];
  assert.ok(pageHeader, 'renderPageHeader block missing');
  assert.match(pageHeader, /disclosure\?:/);
  assert.match(pageHeader, /opts\.disclosure/);
  assert.match(pageHeader, /ChevronDown/);
  assert.doesNotMatch(pageHeader, /\bChevronRight\b/);
  assert.match(pageHeader, /drill\?:/);
  assert.match(pageHeader, /opts\.drill/);
  assert.match(pageHeader, /ChevronsRight/);
  assert.doesNotMatch(LIST_SRC, /onToggleRow/);
  // Multi-child L1: accordion disclose only — never navigate from the parent.
  assert.match(LIST_SRC, /expandedPages/);
  assert.match(LIST_SRC, /openPage\(page\.id\)/);
  assert.match(LIST_SRC, /closePage\(page\.id\)/);
  assert.match(
    LIST_SRC,
    /hasChildren && \(isPageActive \|\| expandedPages\.has\(page\.id\)\)/,
  );
  assert.match(
    LIST_SRC,
    /disclosure: hasChildren \? \{ expanded: showChildren \} : undefined/,
  );
  // Leaf L1 (no children) still navigates; Receiving subgroup may still land
  // on its first bench when opening.
  assert.match(LIST_SRC, /onNavigate\(page\.id\)/);
  // Receiving path: accordion disclosure — open navigates to the first bench
  // (closes any other page nest); close only when not owning the active page.
  assert.match(LIST_SRC, /openSubgroup\(subgroup\)/);
  assert.match(LIST_SRC, /closeSubgroup\(subgroup\)/);
  assert.match(LIST_SRC, /disclosure: \{ expanded: subgroupExpanded \}/);
  assert.match(LIST_SRC, /spineAccentFor/);
  assert.match(LIST_SRC, /accent\.childActive/);
});

/**
 * EVERY spine row carries its glyph — and every one of them at the SAME light
 * page stroke (2026-08-02).
 *
 * This half-reverses the Nav chrome law's "L2 modes keep glyphs with a heavier
 * stroke". The glyph stays, because a child row is the switch between one
 * page's siblings (Reference ⇄ Manuals ⇄ Labels) and the GlobalHeader Mode menu
 * draws that same switch with the same icon set — two doors onto one
 * destination must not disagree about whether it has a face. What goes is the
 * heavier WEIGHT: a child glyph at 2.25 out-draws its own parent at 1.5, which
 * inverts the ladder it was meant to express. Hierarchy is the indent, the
 * caption/medium type, and the muted ink.
 */
test('SidebarNavList: child rows keep their glyph, at the parent-light page stroke', () => {
  const modeRow = LIST_SRC.match(
    /const renderChildLikeRow[\s\S]*?\n {2}\};\n/,
  )?.[0];
  assert.ok(modeRow, 'renderChildLikeRow block missing');
  assert.match(modeRow, /<RowIcon/);
  assert.match(modeRow, /navIconStrokeClass\(\s*'page'/);
  // The indent + type ladder is what carries subordination now, so neither may
  // quietly go away in place of the stroke that used to do it.
  //
  // The indent MECHANISM (2026-08-03, centered same day): a nesting rail
  // gutter (`ml-2` + `w-3.5`) centres a `w-px` under the parent glyph
  // (`px-2` + half of `w-3.5` = 15px) without an arbitrary `ml-[15px]`.
  assert.match(modeRow, /ml-2 flex w-3\.5/);
  assert.match(modeRow, /w-px self-stretch/);
  assert.doesNotMatch(modeRow, /ml-4 border-l|ml-\[15px\]/);
  assert.match(
    modeRow,
    /bg-border-default.*bg-border-soft|bg-border-soft.*bg-border-default/s,
    'the rail must mark the active row — a uniform hairline says only "nested", not "here"',
  );
  assert.match(modeRow, /text-role-caption font-medium/);
  assert.match(modeRow, /accent\.childActiveIcon/);
  assert.match(modeRow, /accent\.childIdleIcon/);
  // Nothing in the spine asks for the heavier L2 weight — it belongs to the
  // GlobalHeader Mode switcher and HorizontalButtonSlider, where the glyph is
  // the whole control rather than a label's companion.
  assert.doesNotMatch(LIST_SRC, /navIconStrokeClass\(\s*'mode'/);
});

/**
 * No badges in the spine — and the cardinality lands in the accessible name.
 *
 * The trailing count was deleted 2026-08-03. It carried *structural
 * cardinality* (how many child pages a page has — immutable, learned once) in
 * the one shape every product on the operator's screen uses for **unread work**,
 * so it collected attention it could never repay.
 *
 * Two halves, and the second is why this is a test rather than a deletion:
 * removing the badge must not remove the FACT. A screen-reader user has no
 * cheap way to discover that "Catalog" leads to seven pages, so the count moves
 * into `aria-label` — where it competes with nothing.
 *
 * The vacated slot must also stay empty. `source-of-truth.md` → *Per-staff queue
 * depths* keeps live depths in `InboxQueueLinks`, and the spine's registry is
 * safe to re-rank on every keystroke only because it does no I/O. A depth badge
 * here would quietly buy that cost back.
 */
test('SidebarNavList: no trailing count badge; cardinality moves to the accessible name', () => {
  const header = LIST_SRC.match(/const renderPageHeader[\s\S]*?\n {2}\};\n/)?.[0];
  assert.ok(header, 'renderPageHeader block missing');

  assert.doesNotMatch(header, /opts\.count/, 'the trailing count badge is deleted, not hidden');
  assert.doesNotMatch(
    header,
    /tabular-nums/,
    'a right-aligned numeral in a nav row reads as a notification badge',
  );
  // The slot is gone entirely — not repurposed. A live queue depth here is a
  // separate ruling with a real per-render I/O cost; it must not arrive as a
  // side effect of a presentation change.
  assert.doesNotMatch(header, /count|badge|depth/i);

  // …but the fact survives, on both row kinds that have children.
  assert.match(LIST_SRC, /ariaLabel: hasChildren \? `\$\{page\.label\} — \$\{childCount\} pages`/);
  assert.match(LIST_SRC, /\$\{members\.length\} stations/);
});

test('SidebarNavList: idle page/section rows use default ink (type comfort); icons stay muted', () => {
  assert.match(LIST_SRC, /idlePageIcon/);
  assert.match(ACCENT_SRC, /text-text-default hover:bg-surface-hover/);
  assert.match(ACCENT_SRC, /idlePageIcon: 'text-text-muted'/);
  assert.doesNotMatch(LIST_SRC, /text-text-muted hover:bg-surface-hover hover:text-text-default/);
});

/**
 * The spine is NEUTRAL — the eight section hues are deleted (2026-08-02).
 *
 * This assertion is the inverse of the one it replaces, and deliberately
 * stronger: the old test pinned eight specific hues, so it could only fail if
 * someone changed a colour. This one fails the moment anyone re-adds ANY colour,
 * including a ninth section's.
 *
 * Colour was never what identified a section — the label and the row's position
 * in `SPINE_SECTIONS` were — and the ⌘K palette groups by labelled bands, so
 * nothing had to be built to replace it.
 */
const CHROMATIC_HUE_RE =
  /\b(?:bg|text|ring|border|from|to|via|fill|stroke|decoration|outline|shadow|accent|caret|divide)-(?:slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

test('spine accents: no chromatic hue survives anywhere in the accent SoT', () => {
  assert.doesNotMatch(
    code(ACCENT_SRC),
    CHROMATIC_HUE_RE,
    'the spine accent SoT is neutral — resolve fills from surface/text tokens, never a Tailwind hue',
  );
  for (const [field, value] of Object.entries(SPINE_NEUTRAL_ACCENT)) {
    assert.doesNotMatch(value, CHROMATIC_HUE_RE, `SPINE_NEUTRAL_ACCENT.${field} carries a hue`);
  }
  // Deleted outright, not left standing beside the neutral one.
  assert.doesNotMatch(ACCENT_SRC, /SPINE_SECTION_ACCENTS/);
});

test('SidebarNavList: every row resolves its treatment through the accent SoT', () => {
  assert.match(LIST_SRC, /spineAccentFor/);
  assert.match(LIST_SRC, /accent\.activePage/);
  // One answer for every section — the seam stays so a future NON-colour
  // per-section distinction has somewhere to live.
  for (const section of SPINE_SECTIONS) {
    assert.equal(spineAccentFor(section.id), SPINE_NEUTRAL_ACCENT, String(section.id));
  }
  assert.equal(spineAccentFor(null), SPINE_NEUTRAL_ACCENT);
  // No page-local fill beside the SoT — the bug the accent module exists to stop.
  assert.doesNotMatch(LIST_SRC, /bg-blue-600 text-white/);
  assert.doesNotMatch(code(LIST_SRC), CHROMATIC_HUE_RE);
});

test('SidebarNavList: body swap uses the named spineBodySwap SoT (opacity-only; no inline x slide)', () => {
  assert.match(LIST_SRC, /framerPresence\.spineBodySwap/);
  assert.match(LIST_SRC, /framerTransition\.spineBodySwap/);
  assert.match(LIST_SRC, /useMotionPresence/);
  assert.match(LIST_SRC, /framerPresence\.spineActiveWash/);
  assert.match(LIST_SRC, /framerVariants\.spineRowStaggerContainer/);
  // Renamed from `spineDrill` with the drill's deletion — a preset named for a
  // surface that no longer exists is a comment that lies. Deleted rather than
  // left dead: the body still swaps between two KINDS of list at the same
  // physics, so there is a real consumer, just not the one it was named for.
  assert.doesNotMatch(MOTION_SRC, /spineDrill:/);
  assert.doesNotMatch(MOTION_SRC, /spineDrillFilter/);
  assert.doesNotMatch(LIST_SRC, /framerPresence\.spineDrillFilter/);
  assert.doesNotMatch(LIST_SRC, /x:\s*drillId/);
  assert.doesNotMatch(LIST_SRC, /x:\s*-?12/);
  const presenceMatches = [
    ...MOTION_SRC.matchAll(/spineBodySwap:\s*\{[\s\S]*?\n\s*\},?/g),
  ];
  assert.ok(presenceMatches.length >= 1, 'spineBodySwap blocks missing');
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
test('SidebarNavList: the nest cascade always plays on open', () => {
  // Every in-place dropdown (L1 children · Receiving) mounts through
  // `renderStaggeredNest` — always `initial="hidden"` so open gets the 15ms
  // stagger. Search replaces the whole body, so there is no mid-type remount.
  assert.doesNotMatch(LIST_SRC, /drill-rows-/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*navFilter/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*drillFilter/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*groupPages/);
  assert.doesNotMatch(LIST_SRC, /rowStaggerInitial|filterTouched/);
  assert.match(LIST_SRC, /const renderStaggeredNest/);
  assert.match(LIST_SRC, /initial=["']hidden["']/);
  assert.match(LIST_SRC, /nest-\$\{page\.id\}/);
  assert.match(LIST_SRC, /nest-subgroup-\$\{subgroup\}/);
  assert.match(LIST_SRC, /framerVariants\.spineRowStaggerContainer/);
  assert.match(LIST_SRC, /framerVariants\.spineRowStaggerItem/);
});

/**
 * Nothing in the spine TRAVELS — and nothing ever animates from JS.
 *
 * The 14px glyph carried a 2px `motion-safe:` CSS lift until 2026-08-02. It was
 * correctly built (the framer `MotionConfig` floor cannot see a Tailwind
 * transform, so the gate was doing real work) and it is deleted anyway, on its
 * own merit: a structural anchor in a 20-row column should not move under the
 * pointer, and the neutral wash that landed with the de-chroming answers hover
 * on its own. Two answers to one question is one too many.
 *
 * The three older bans survive unchanged, because they are about COST, not
 * taste: a framer `whileHover` here re-renders React on every mousemove across
 * the list; a row-level `scale` breaks the baseline every dense surface beside
 * it aligns to; a hover weight shift reflows text mid-pointer.
 */
test('SidebarNavList: no transform travel at all — no whileHover, no row scale, no weight shift', () => {
  assert.doesNotMatch(LIST_SRC, /SPINE_ICON_LIFT_CLASS/);
  assert.doesNotMatch(ACCENT_SRC, /SPINE_ICON_LIFT_CLASS/);
  // Deleted at BOTH ends — an exported constant with a live importer is
  // invisible to knip, so only this assertion can see a half-finished removal.
  //
  // `translate-` and `scale-` stay banned outright: both move a ROW, and a
  // structural anchor in a 20-row column must not travel under the pointer.
  // `rotate-` is allowed for disclosure chevrons (Receiving / Locations nests)
  // facing their own state — not travel. Scan Stations uses ChevronsRight enter
  // instead of a rotated disclosure.
  assert.doesNotMatch(LIST_SRC, /translate-|scale-/);
  assert.doesNotMatch(ACCENT_SRC, /translate-|scale-|rotate-/);
  const rotations = LIST_SRC.match(/[\w:-]*rotate-[\w[\]-]+/g) ?? [];
  assert.deepEqual(
    rotations,
    ['-rotate-90'],
    'the only rotation in the spine is the nest disclosure chevron',
  );
  assert.match(LIST_SRC, /motion-safe:transition-transform/);
  assert.doesNotMatch(LIST_SRC, /whileHover|whileTap/);
  assert.doesNotMatch(LIST_SRC, /hover:scale|active:scale|group-hover:scale/);
  assert.doesNotMatch(LIST_SRC, /hover:font-|group-hover:font-/);
  // The house weight cap: nothing above 600 anywhere in the spine.
  // Built from parts so this assertion itself does not trip the weight-cap ratchet.
  assert.doesNotMatch(
    LIST_SRC,
    new RegExp(`font-${'bold'}|font-${'extrabold'}|font-${'black'}`),
  );
  // Hover is a colour change and nothing else.
  assert.match(LIST_SRC, /transition-colors duration-150/);
  assert.doesNotMatch(LIST_SRC, /transition-all/);
  // A bare (unguarded) transform transition would slip past the reduced-motion
  // floor; only the `motion-safe:` form is legal.
  assert.doesNotMatch(LIST_SRC, /(?<!motion-safe:)transition-transform/);
});

/**
 * The neutral ladder has TWO soft rungs on a white spine (2026-08-03): hover
 * wash (`surface-hover`) vs one shared sunken selected wash — no inverse fill,
 * no `surface-strong` chip, no inset hairline. Cloudflare's Account-home row is
 * the target grain.
 */
test('spine accents: selected and expanded share one soft sunken wash', () => {
  // No inverse destination chip — that read as a different kind of chrome.
  for (const [field, value] of Object.entries(SPINE_NEUTRAL_ACCENT)) {
    assert.doesNotMatch(value, /surface-inverse|text-inverse/, `no inverse on ${field}`);
    assert.doesNotMatch(value, /bg-surface-strong\b/, `no strong chip on ${field}`);
  }
  // Soft selected wash — active page, child, and expanded section share it.
  for (const field of ['activePage', 'childActive', 'sectionActive'] as const) {
    assert.match(SPINE_NEUTRAL_ACCENT[field], /bg-surface-sunken\b/, field);
    assert.match(SPINE_NEUTRAL_ACCENT[field], /text-text-default\b/, `${field} ink`);
    assert.doesNotMatch(SPINE_NEUTRAL_ACCENT[field], /ring-/, `${field} has no hard ring`);
  }
  assert.equal(SPINE_NEUTRAL_ACCENT.activePage, SPINE_NEUTRAL_ACCENT.childActive);
  assert.equal(SPINE_NEUTRAL_ACCENT.activePage, SPINE_NEUTRAL_ACCENT.sectionActive);
  // Hover is softer than selected so the two washes stay separable.
  for (const field of ['idlePage', 'childIdle', 'sectionIdle'] as const) {
    assert.match(SPINE_NEUTRAL_ACCENT[field], /hover:bg-surface-hover/, `${field} hover wash`);
  }
  assert.notEqual(SPINE_NEUTRAL_ACCENT.childActive, SPINE_NEUTRAL_ACCENT.childIdle);
  // Scan Stations enter shares page chrome (`active: floorActive` → activePage).
  assert.match(LIST_SRC, /active: floorActive/);
  assert.match(LIST_SRC, /drill:\s*true/);
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

/**
 * Scan Stations auto-enters its drill on cross-section navigation onto a floor
 * bench. Manual Back leaves the root map without stealing focus. Domains never
 * get this effect.
 */
test('MasterNav: Scan Stations drill auto-enters floor; never steals focus', () => {
  assert.match(MASTER_SRC, /stationsDrillOpen/);
  assert.match(MASTER_SRC, /setStationsDrillOpen/);
  assert.match(MASTER_SRC, /prevSectionRef/);
  assert.match(MASTER_SRC, /activeSection === ['"]floor['"]/);
  assert.doesNotMatch(MASTER_SRC, /\bdrillId\b|\bsetDrillId\b/);
  assert.doesNotMatch(MASTER_SRC, /\.focus\s*\(/);
  assert.doesNotMatch(MASTER_SRC, /autoFocus/);
});
