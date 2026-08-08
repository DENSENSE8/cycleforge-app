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
import { SPINE_ACCENT, spineAccentFor } from '@/lib/nav/spine-section-accent';

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
/** The spine's own plane — load-bearing for the ascending selection fill. */
const COLUMN_SRC = code(sourceOf('../SidebarNavColumn.tsx'));
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
    'Operations Studio is a footer pin, not a root drill',
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
 * Operations Studio is a FOOTER PIN above Admin (2026-08-02), not a tenth root
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
test('Operations Studio is a footer pin above Admin; Catalog rides as its L2 mode', () => {
  const footerIds = APP_SIDEBAR_NAV.filter(
    (item) => (item.kind ?? 'bottom') === 'bottom',
  ).map((item) => item.id);
  assert.deepEqual(footerIds, ['studio', 'admin', 'settings'], 'footer band order');

  const studio = APP_SIDEBAR_NAV.find((item) => item.id === 'studio');
  assert.ok(studio);
  assert.equal(studio!.kind, 'bottom');
  assert.equal(studio!.label, 'Operations Studio');
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
 * Carrier labels are not a catalog/inventory print destination.
 * `/shipping/labels` is the ONE home for buying/printing postage labels.
 */
test('carrier Labels stays Outbound → Shipping, never Catalog/Inventory labels', () => {
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
  // Enter + back + L1 share PRIMARY_CHROME_ROW_FACE (h-7) with the scan bar.
  // Nested children also use h-7 (same density as primary chrome).
  assert.match(LIST_SRC, /PRIMARY_CHROME_ROW_FACE/);
  assert.match(LIST_SRC, /PRIMARY_CHROME_ROW_FACE[\s\S]*?activePage|activePage[\s\S]*?PRIMARY_CHROME_ROW_FACE/);
  assert.match(
    LIST_SRC,
    /grid[\s\S]*?PRIMARY_CHROME_ROW_FACE|PRIMARY_CHROME_ROW_FACE[\s\S]*?grid-cols-\[1rem_1fr_1rem\]/,
  );
  assert.match(LIST_SRC, /flex h-7 min-w-0 flex-1 items-center/, 'nested child rows stay h-7');
  // Sections stay BOX TO BOX — no `mt-1` gap (2026-08-03). What marks a
  // boundary is a HAIRLINE (2026-08-08), which arrived when the monochrome
  // pass deleted per-section hue and left nothing else doing the job. A gap
  // was rejected on measured geometry: 8px × 8 boundaries against a
  // scrollport that already runs 732px of map into a 685px port.
  assert.doesNotMatch(LIST_SRC, /index > 0 \? 'mt-1/);
  assert.match(LIST_SRC, /index > 0 \? 'border-t border-border-soft'/);
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
  // The body renders its branch DIRECTLY — no keyed wrapper, because there is
  // no crossfade left to key (2026-08-08). The three branches render
  // different elements, so React swaps them on one frame.
  assert.match(LIST_SRC, /\{searching \? renderSearchResults\(\) : renderMap\(\)\}/);
  assert.doesNotMatch(LIST_SRC, /<AnimatePresence/);
  // Results are keyboard-reachable from the box that produced them.
  assert.match(LIST_SRC, /handleFilterKeyDown/);
  assert.match(LIST_SRC, /ArrowDown/);
  assert.match(LIST_SRC, /ArrowUp/);
  // Empty state names the query back.
  assert.match(LIST_SRC, /No destination matches/);
});

/**
 * ONE type size for the whole spine — `role-nav` (13px), every altitude.
 *
 * The ladder has been rebuilt twice and this is the resolution. It began flat
 * at 12px with pages and modes differing only by WEIGHT (the thinnest signal
 * in the system), then went two-tier — `role-body` 14px destinations over
 * `role-caption` 12px modes — to give the spine a size hierarchy and lift it
 * off a 12px floor that sat below every peer navigator.
 *
 * Two-tier bought hierarchy at the cost of the map reading as a stack of
 * differently-sized parts, which is the opposite of what a calm navigator
 * wants. **13px everywhere** takes the peer-navigator size (VS Code 13,
 * Linear 13) and hands hierarchy to channels that cost no vertical space:
 * indent, the nesting rail, and one ink step. Weight remains the only type
 * variable, and it now encodes STATE (400 idle child / 500 parent + current)
 * rather than depth.
 *
 * `role-nav` is its own role rather than a reuse of the same-sized
 * `role-data`, which binds `tabular-nums` — correct for a qty column that
 * must not shimmy, wrong for prose.
 */
test('SidebarNavList: ONE type size for every altitude of the spine', () => {
  const navRows = LIST_SRC.match(/text-role-nav/g) ?? [];
  assert.ok(
    navRows.length >= 4,
    `expected ≥4 role-nav rows (page header · child row · drill title · ` +
      `search result), found ${navRows.length}`,
  );
  // The two-tier ladder is gone in BOTH directions — neither the 14px
  // destination nor the 12px mode may return, or the spine is two systems
  // again. Scoped to the ROW renderers on purpose: the empty-state lines
  // ("No matching pages") are prose, not rows, and `role-caption` is the
  // right role for them.
  const rowBlocks = [
    LIST_SRC.match(/const renderChildLikeRow[\s\S]*?\n {2}\};\n/)?.[0],
    LIST_SRC.match(/const renderPageHeader[\s\S]*?\n {2}\};\n/)?.[0],
    LIST_SRC.match(/const renderResultRow[\s\S]*?\n {2}\};\n/)?.[0],
    LIST_SRC.match(/const renderStationsDrill[\s\S]*?\n {2}\};\n/)?.[0],
  ];
  for (const [i, block] of rowBlocks.entries()) {
    assert.ok(block, `row renderer #${i} block missing`);
    assert.doesNotMatch(
      block,
      /text-role-body/,
      'a 14px row is the retired two-tier ladder — the spine is one size',
    );
    assert.doesNotMatch(
      block,
      /text-role-caption/,
      'a 12px row is the retired two-tier ladder — the spine is one size',
    );
  }
  // Weight carries STATE, not depth: 500 for a parent or the current row,
  // 400 for an idle child. Nothing above 500 — a spine row is not a heading.
  assert.match(LIST_SRC, /text-role-nav font-medium/);
  assert.match(LIST_SRC, /'font-medium' : 'font-normal'/);
  assert.doesNotMatch(
    LIST_SRC,
    /text-role-nav font-semibold/,
    'the spine tops out at 500 — 600 made the footer read as a different system',
  );
});

test('SidebarNavList: Scan Stations drill back header is the Vercel back+title row', () => {
  const drill = LIST_SRC.match(/const renderStationsDrill[\s\S]*?\n {2}\};\n/)?.[0];
  assert.ok(drill, 'renderStationsDrill block missing');
  assert.match(drill, /text-center text-role-nav/);
  assert.match(drill, /grid-cols-\[1rem_1fr_1rem\]/);
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
  // Pages and modes share ONE size (`role-nav`) — see the type-ladder test
  // above. What separates them here is structure, not type: a page draws a
  // disclosure or drill chevron and a mode never does.
  assert.match(LIST_SRC, /text-role-nav/);
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
  // Leaf L1 (no children) still navigates; station subgroups disclose only.
  assert.match(LIST_SRC, /onNavigate\(page\.id\)/);
  // Subgroup path: accordion disclosure only — open expands the nest; never
  // auto-navigates to the first bench. Close only when not owning the active page.
  assert.match(LIST_SRC, /openSubgroup\(subgroup\)/);
  assert.doesNotMatch(LIST_SRC, /openSubgroup\(subgroup\);\s*if \(!subgroupActive\) onNavigate\(firstMember\.id\)/);
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
  // Subordination is now carried ENTIRELY by indent + rail + one ink step —
  // size and colour both went away (2026-08-08), so the rail is load-bearing
  // rather than decorative and may not quietly go with them.
  //
  // The indent MECHANISM (2026-08-03, centered same day; re-centred 2026-08-08
  // when the glyph went 14px → 16px): the gutter is `ml-2` + `w-4`, matching
  // the parent's `px-2` and its 16px glyph, so the `w-px` lands on the icon's
  // centre without an arbitrary `ml-[Npx]`. If the glyph size changes again,
  // this width changes with it.
  assert.match(modeRow, /ml-2 flex w-4/);
  assert.match(modeRow, /w-px self-stretch/);
  assert.doesNotMatch(modeRow, /ml-4 border-l|ml-\[15px\]/);
  assert.match(
    modeRow,
    /bg-border-default.*bg-border-soft|bg-border-soft.*bg-border-default/s,
    'the rail must mark the active row — a uniform hairline says only "nested", not "here"',
  );
  assert.match(modeRow, /text-role-nav/);
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

/**
 * The spine is MONOCHROME — per-section hue is deleted (2026-08-08).
 *
 * The nine-hue map was born 2026-08-01, deleted 2026-08-02, restored
 * 2026-08-07, extended to idle rows hours later, and is now gone for good.
 * Every round argued about volume — how saturated, how many rows, which
 * shade — and every round the answer got quieter, which is the shape of an
 * idea that does not work rather than one that needs tuning.
 *
 * What settled it was seeing it rendered: with a section drilled open, EVERY
 * row in that section carried the section tint, so the tint marked nothing
 * and the one genuinely selected row became a slightly different shade of
 * the same colour as its four siblings. The change made "where am I" HARDER
 * to answer, which was the only question the colour was there to help with.
 *
 * This test therefore holds a different bar from either predecessor: not
 * "eight pinned hues" and not "every section has its own", but **no hue
 * anywhere in the module or its consumer**, enforced by a class-shape regex
 * rather than a hand-listed set — so a new colour cannot arrive under a name
 * the list has not heard of.
 */
const CHROMATIC_HUE_RE =
  /\b(?:bg|text|ring|border|from|to|via|fill|stroke|decoration|outline|shadow|accent|caret|divide)-(?:slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

test('spine accents: the spine is monochrome — no hue in the SoT or its consumers', () => {
  for (const [field, value] of Object.entries(SPINE_ACCENT)) {
    assert.doesNotMatch(value, CHROMATIC_HUE_RE, `SPINE_ACCENT.${field} carries a hue`);
  }
  // The whole module, not just the exported object — a hue parked in a local
  // const is one import away from being a treatment again.
  assert.doesNotMatch(code(ACCENT_SRC), CHROMATIC_HUE_RE);
  // …and the consumer, which is where a page-local fill would land.
  assert.doesNotMatch(code(LIST_SRC), CHROMATIC_HUE_RE);
  // The retired map must not come back under its own name.
  assert.doesNotMatch(ACCENT_SRC, /SPINE_SECTION_ACCENTS/);
});

/**
 * EXACTLY ONE row fills, and it is the row you are on.
 *
 * The fill has been narrowed twice. It first also meant "expanded", so
 * standing on Sales with Shipping open lit two rows. Dropping that left the
 * ANCESTOR case: `activePage` for `/products?view=manuals` IS Products, so
 * Products and Manuals both lit — a breadcrumb read, but still two answers to
 * a one-answer question.
 *
 * Both are closed now. A multi-child parent is never a destination (its click
 * discloses), and whenever it owns the active page its children are
 * force-open — so the genuinely-current child is always on screen carrying
 * the fill, and the parent adds nothing but a second lit row.
 *
 * The Scan Stations enter row is the ONE proxy fill and is not this case: it
 * list-REPLACES, so when the operator is on a bench the current row is not
 * rendered on the map at all and this row is its only representation.
 */
test('spine accents: exactly one row fills — never an ancestor, never merely expanded', () => {
  assert.match(
    LIST_SRC,
    /active: isPageActive && !hasChildren,/,
    'an L1 row fills only when it is itself the destination — a parent whose ' +
      'child is current must stay quiet',
  );
  assert.doesNotMatch(LIST_SRC, /active: isPageActive \|\| showChildren/);
  assert.doesNotMatch(
    LIST_SRC,
    /active: isPageActive,/,
    'bare isPageActive re-lights the ancestor of an active child page',
  );
  // A subgroup header never fills at all — it is a disclosure, and its active
  // station is always rendered directly beneath it.
  assert.match(LIST_SRC, /active: false,/);
  assert.doesNotMatch(LIST_SRC, /active: subgroupActive/);
  // The one sanctioned proxy survives, and only it.
  assert.equal(
    (LIST_SRC.match(/active: floorActive/g) ?? []).length,
    1,
    'the Scan Stations enter row is the only proxy fill in the spine',
  );
});

/**
 * The ink ladder — three steps, and the icon shares its label's value exactly.
 *
 * A glyph one step lighter than its own label makes a row read as two
 * objects; sharing the value makes it read as one mark. Every value is an
 * existing house token, so the themes flip on their own — this pass
 * introduced no new colour.
 */
test('spine accents: three ink steps, and every icon shares its label ink', () => {
  // Idle child sits one step quieter than an idle parent — that step IS the
  // hierarchy now that size and colour are both gone.
  assert.match(SPINE_ACCENT.idlePage, /text-text-muted/);
  assert.match(SPINE_ACCENT.childIdle, /text-text-soft/);
  assert.notEqual(SPINE_ACCENT.idlePage, SPINE_ACCENT.childIdle);
  // The current row goes to full contrast, both altitudes.
  assert.match(SPINE_ACCENT.activePage, /text-text-default/);
  assert.match(SPINE_ACCENT.childActive, /text-text-default/);
  // Icon ink === label ink at every state.
  assert.match(SPINE_ACCENT.idlePageIcon, /text-text-muted/);
  assert.match(SPINE_ACCENT.childIdleIcon, /text-text-soft/);
  assert.match(SPINE_ACCENT.activePageIcon, /text-text-default/);
  assert.match(SPINE_ACCENT.childActiveIcon, /text-text-default/);
  // Hover is a real third step, not a repeat of either neighbour — without it
  // a hovered row and the selected row are indistinguishable.
  assert.match(SPINE_ACCENT.idlePage, /hover:bg-surface-hover/);
  assert.match(SPINE_ACCENT.childIdle, /hover:bg-surface-hover/);
  // Flush and flat: the plane step is the depth, never a ring or a bevel.
  for (const [field, value] of Object.entries(SPINE_ACCENT)) {
    assert.doesNotMatch(value, /\bring-|\bshadow-(?!none\b)/, `SPINE_ACCENT.${field}`);
  }
});

test('SidebarNavList: every row resolves its treatment through the accent SoT', () => {
  assert.match(LIST_SRC, /spineAccentFor/);
  assert.match(LIST_SRC, /accent\.activePage/);
  // One treatment, every section — that IS the ruling, so the resolver must
  // answer identically for all of them and for the neutral rail.
  for (const section of SPINE_SECTIONS) {
    assert.equal(spineAccentFor(section.id), SPINE_ACCENT, String(section.id));
  }
  assert.equal(spineAccentFor(null), SPINE_ACCENT);
  assert.doesNotMatch(LIST_SRC, /bg-blue-600 text-white/);
});

/**
 * Repair's orange icon is deleted from nav — and this test exists because it
 * was ratified as "the ONE earned exception" the day before, so its absence
 * needs to be a decision on the record rather than something that looks like
 * an oversight.
 *
 * The cross-registry conflict it fixed is still fixed where it mattered:
 * `receiving-type-meta.ts`, `TicketChip` and the functional-hue table all
 * agree repair is orange. Those paint a RECORD. A nav row is not a record —
 * it is the doorway to one, and doorways are now uniformly quiet.
 */
test('spine accents: no per-station tint survives in nav — REPAIR_ICON_TINT is deleted', () => {
  assert.doesNotMatch(ACCENT_SRC, /REPAIR_ICON_TINT/);
  assert.doesNotMatch(LIST_SRC, /REPAIR_ICON_TINT/);
  // The prop that carried it is gone too — leaving the escape hatch mounted
  // is how a second bench talks its way into a hue next time.
  assert.doesNotMatch(LIST_SRC, /iconClassOverride/);
});

/**
 * D2/D3 ratified 2026-08-07: selection feedback stays a one-shot settle,
 * never a continuous/looping pulse. `motionRole.feedback.pulse` already
 * exists in the catalog for a DIFFERENT job (a value-change acknowledgement
 * flash) and is scoped to `['station', 'workbench']` regions only — it does
 * not reach the spine today, and this guard is what keeps that true even if
 * someone widens its regions later for an unrelated reason.
 */
/**
 * Selection is INSTANT — the wash settle is deleted (2026-08-08).
 *
 * `spineActiveWash` was a 150ms one-shot opacity settle on the selected row,
 * audited and deliberately kept the day before this — on the assumption the
 * row underneath filled with a saturated section hue, where a settle has
 * something to settle.
 *
 * The monochrome pass removed that fill. A selected row is now a plane step
 * of a few percent, and a fade between two nearly-identical neutrals is
 * imperceptible: it was paying a React render and an `AnimatePresence`
 * branch for something no operator can see, which is the opposite of the
 * craft it was defending.
 *
 * The spine's ONE surviving motion is the nest-expand cascade, where rows
 * genuinely mount and an instant five-row insert under the cursor is a
 * jarring frame. That is asserted by the row-cascade test below.
 */
test('spine accents: selection is instant — no wash settle preset, no consumer', () => {
  // Deleted from the catalog, not merely unused — an orphan preset is a
  // knip finding and an invitation to re-wire it.
  assert.doesNotMatch(MOTION_SRC, /^\s*spineActiveWash:\s*\{/m);
  assert.doesNotMatch(MOTION_SRC, /spineActiveWash:\s*0?\.\d+/);
  // And no consumer left behind in the spine.
  assert.doesNotMatch(LIST_SRC, /spineActiveWash/);
  assert.doesNotMatch(LIST_SRC, /activeWashPresence|activeWashTransition/);
  // The row header renders as a plain button — reintroducing a motion wrapper
  // around it is how the settle would come back.
  const pageHeader = LIST_SRC.match(/const renderPageHeader[\s\S]*?\n {2}\};\n/)?.[0];
  assert.ok(pageHeader, 'renderPageHeader block missing');
  assert.doesNotMatch(pageHeader, /<motion\./);
});

/**
 * The body swap is INSTANT — `spineBodySwap` is deleted, preset and all.
 *
 * It crossfaded the body between the map, the Scan Stations drill, and ranked
 * search results: opacity-only, 120ms, and still the wrong trade. It ran under
 * `AnimatePresence mode="wait"`, so the outgoing list had to finish fading
 * before the incoming one mounted — ~240ms round trip with an EMPTY column
 * visible in between. Entering a bench is the single most repeated navigation
 * in this app; that delay sat directly on it.
 */
test('SidebarNavList: the body swaps instantly — spineBodySwap is deleted, preset and consumer', () => {
  assert.doesNotMatch(LIST_SRC, /spineBodySwap/);
  assert.doesNotMatch(MOTION_SRC, /^\s*spineBodySwap:\s*[{0-9]/m);
  // The older renames must not come back either.
  assert.doesNotMatch(MOTION_SRC, /spineDrill:/);
  assert.doesNotMatch(MOTION_SRC, /spineDrillFilter/);
  assert.doesNotMatch(LIST_SRC, /x:\s*drillId/);
  assert.doesNotMatch(LIST_SRC, /x:\s*-?12/);
});

/**
 * A nest opens INSTANTLY — there is no animation on this interaction at all.
 *
 * Three answers, and the sequence is the useful record. Modes staggered at
 * 40ms while pages did not stagger at all, so a 4-mode page resolved slower
 * than the 12-page section containing it; that was unified onto one 15ms
 * ladder. The unified cascade was internally consistent and still wrong for
 * the job — at 15ms × index with a y-offset, a five-row nest is a wave
 * travelling down-and-right, so a nav dropdown announced its contents one at
 * a time instead of disclosing them. Replacing it with a single height
 * expand fixed the sweep and kept the underlying mistake: this is a
 * navigator on a scan bench, the operator clicking a nest already knows what
 * is in it, and any duration is time between the click and the row they were
 * reaching for.
 *
 * So the nest is a plain `<ul>`. The chevron's CSS rotate is the one thing
 * still moving, and it is chrome confirming the click rather than something
 * sitting between the operator and a destination.
 */
test('SidebarNavList: a nest opens instantly — no cascade, no height expand, no motion at all', () => {
  assert.match(LIST_SRC, /const renderNest/);
  const nest = LIST_SRC.match(/const renderNest[\s\S]*?\n {2}\);\n/)?.[0];
  assert.ok(nest, 'renderNest block missing');
  // A plain list — the moment any of these return, so does the delay.
  assert.doesNotMatch(nest, /<motion\./);
  assert.doesNotMatch(nest, /variants=|initial=|animate=|transition=/);
  assert.match(nest, /<ul key=\{nestKey\}/);
  // Neither retired treatment may come back on this surface.
  assert.doesNotMatch(LIST_SRC, /framerVariants/);
  assert.doesNotMatch(LIST_SRC, /spineRowStagger/);
  assert.doesNotMatch(LIST_SRC, /spineModeStagger/);
  assert.doesNotMatch(MOTION_SRC, /spineModeStagger/);
  assert.doesNotMatch(
    LIST_SRC,
    /collapseHeight|stationCollapse/,
    'the one-block height expand is retired too — the nest is instant',
  );
  // There is no motion in this component AT ALL — not a preset, not a hook,
  // not the barrel. That is the strongest form this assertion can take, and
  // it is cheap: one import line is the whole surface to guard.
  assert.doesNotMatch(LIST_SRC, /@\/design-system\/motion/);
  assert.doesNotMatch(LIST_SRC, /motion-framer/);
  assert.doesNotMatch(LIST_SRC, /framerPresence|framerTransition|framerVariants/);
  assert.doesNotMatch(LIST_SRC, /useMotionPresence|useMotionTransition/);
  assert.doesNotMatch(LIST_SRC, /<motion\.|<AnimatePresence/);
});

/**
 * The nest's identity is the SECTION, never the query or the filtered array.
 * This mattered while the nest animated (keying on either replayed the open
 * on every keystroke); it is kept now because a key that churns still
 * remounts the subtree and throws away scroll and focus for free.
 */
test('SidebarNavList: the nest keys on its section, never on a keystroke', () => {
  assert.doesNotMatch(LIST_SRC, /drill-rows-/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*navFilter/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*drillFilter/);
  assert.doesNotMatch(LIST_SRC, /key=\{[^}]*groupPages/);
  assert.doesNotMatch(LIST_SRC, /rowStaggerInitial|filterTouched/);
  assert.match(LIST_SRC, /nest-\$\{page\.id\}/);
  assert.match(LIST_SRC, /nest-subgroup-\$\{subgroup\}/);
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
  // The chevron ROTATES but does not TRANSITION (2026-08-08). It was the last
  // moving thing in the spine — 150ms of CSS on the control the operator had
  // just committed to, confirming a click whose result (the nest) was already
  // on screen. It snaps now, so there is no transform transition here at all,
  // `motion-safe:` guarded or otherwise.
  assert.doesNotMatch(LIST_SRC, /transition-transform/);
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
});

/**
 * MasterNav map chrome is flush (2026-08-05) — peer of GlobalHeader /
 * HeaderChromeMenu / scan-dock rails. Column = the card: zero outer gutter on
 * the scrollport and footer pins, square destination washes. Soft `rounded-lg`
 * / `rounded-md` chips + host `p-1` gutters must not come back.
 */
test('SidebarNavList: flush boxed chrome — p-0 hosts, rounded-none rows', () => {
  assert.match(LIST_SRC, /data-spine-scrollport[^>]*overflow-y-auto p-0/);
  assert.match(LIST_SRC, /border-t border-border-soft p-0/);
  assert.doesNotMatch(LIST_SRC, /overflow-y-auto p-1/);
  assert.doesNotMatch(LIST_SRC, /border-t border-border-soft p-1/);

  const pageHeader = LIST_SRC.match(
    /const renderPageHeader[\s\S]*?\n {2}\};\n/,
  )?.[0];
  assert.ok(pageHeader, 'renderPageHeader block missing');
  assert.match(pageHeader, /rounded-none/);
  assert.doesNotMatch(pageHeader, /rounded-lg|rounded-md/);

  const childRow = LIST_SRC.match(
    /const renderChildLikeRow[\s\S]*?\n {2}\};\n/,
  )?.[0];
  assert.ok(childRow, 'renderChildLikeRow block missing');
  assert.match(childRow, /rounded-none/);
  assert.doesNotMatch(childRow, /rounded-lg|rounded-md/);

  // Search-result + drill-back rows also stay square.
  assert.doesNotMatch(LIST_SRC, /rounded-lg/);
  assert.doesNotMatch(LIST_SRC, /rounded-md/);
});

/**
 * The fill ASCENDS toward the work surface — three planes, all tokens.
 *
 * The ladder used to run the other way: a white spine with a `surface-sunken`
 * selected wash. It flipped 2026-08-08 when the spine moved one plane DOWN
 * (`surface-canvas`), so the row you are standing on now rises to `surface-card`
 * — the same white as the surface it opens — rather than pressing into the
 * column. Darkening from a canvas ground would have needed `surface-strong`,
 * which at 28px reads as a pressed button rather than a location.
 *
 * Same direction Linear uses (its dark sidebar selects LIGHTER), inverted here
 * only because this theme is light. No inverse chip, no ring, no bevel — the
 * plane step is the whole depth story.
 */
test('spine accents: the selected row rises to the work surface, hover sits between', () => {
  for (const [field, value] of Object.entries(SPINE_ACCENT)) {
    assert.doesNotMatch(value, /surface-inverse|text-inverse/, `no inverse on ${field}`);
    assert.doesNotMatch(value, /bg-surface-strong\b/, `no strong chip on ${field}`);
  }
  // Current row === the work surface's own white, both altitudes, one value.
  for (const field of ['activePage', 'childActive'] as const) {
    assert.match(SPINE_ACCENT[field], /bg-surface-card\b/, field);
    assert.match(SPINE_ACCENT[field], /text-text-default\b/, `${field} ink`);
    assert.doesNotMatch(SPINE_ACCENT[field], /ring-/, `${field} has no hard ring`);
  }
  assert.equal(SPINE_ACCENT.activePage, SPINE_ACCENT.childActive);
  // Hover is the middle plane — separable from both neighbours.
  for (const field of ['idlePage', 'childIdle'] as const) {
    assert.match(SPINE_ACCENT[field], /hover:bg-surface-hover/, `${field} hover wash`);
  }
  assert.notEqual(SPINE_ACCENT.childActive, SPINE_ACCENT.childIdle);
  // The spine's own ground is the plane BELOW the work surface — without this
  // the ascending fill has nothing to ascend from and the whole ladder reads
  // as white-on-white.
  assert.match(COLUMN_SRC, /appCanvasClass/);
  assert.doesNotMatch(COLUMN_SRC, /appChromeClass/);
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
