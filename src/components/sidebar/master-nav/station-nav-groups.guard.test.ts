/**
 * Source guard: Scan Stations is the ONLY station group, and it stays
 * scan-first. Every `kind: 'station'` row is `stationGroup: 'floor'`, pipeline-
 * ordered (Receiving subgroup → Testing → Packing → Scan out), and the Receiving
 * page-style header comes from STATION_SUBGROUPS.
 *
 * The retired `desk` group is the point of this file now. "Everything
 * pointer-driven" is not a place, so it accumulated Incoming, Review, Support,
 * Shipping, Dashboard, Stock and Products behind one unpredictable label; those
 * pages are domain rows (`kind: 'domain'`) as of 2026-08-01. The inverse must
 * also hold: a scan bench must NEVER be moved into a domain drill — an operator
 * standing at the dock cannot be asked which business domain their scanner
 * belongs to.
 *
 * SoT: STATION_GROUPS + STATION_SUBGROUPS + SPINE_SECTIONS + APP_SIDEBAR_NAV /
 *      SIDEBAR_PAGE_NAV
 * Display law: .claude/rules/display/workbench.md (section drills)
 *
 * Run: node --test --import tsx \
 *        src/components/sidebar/master-nav/station-nav-groups.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  APP_SIDEBAR_NAV,
  SIDEBAR_PAGE_NAV,
  STATION_GROUPS,
  STATION_SUBGROUPS,
  getSidebarPageNav,
  spineSectionIdForPage,
  stationSubgroupMembers,
  type StationGroupId,
} from '@/lib/sidebar-navigation';
import { ScanBarcode } from '@/components/Icons';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const FLOOR_PIPELINE = [
  'triage',
  'receive',
  'pickup',
  'repair',
  'tech',
  'packer',
  'scan-out',
] as const;
const RECEIVING_SUBGROUP = ['triage', 'receive', 'pickup', 'repair'] as const;
const ALLOWED: ReadonlySet<StationGroupId> = new Set(['floor']);

const LIST_SRC = code(sourceOf('./SidebarNavList.tsx'));

test('STATION_GROUPS is Scan Stations only — the desk twin stays retired', () => {
  assert.deepEqual(
    STATION_GROUPS.map((g) => g.id),
    ['floor'],
  );
  assert.deepEqual(
    STATION_GROUPS.map((g) => g.label),
    ['Scan Stations'],
  );
  assert.equal(STATION_GROUPS[0]!.icon, ScanBarcode, 'floor section icon is ScanBarcode');
});

test('every APP_SIDEBAR_NAV station declares stationGroup floor', () => {
  const stations = APP_SIDEBAR_NAV.filter((item) => item.kind === 'station');
  assert.equal(stations.length, FLOOR_PIPELINE.length, 'only the scan benches are stations');
  for (const item of stations) {
    assert.equal(item.kind, 'station');
    assert.ok(
      ALLOWED.has(item.stationGroup),
      `${item.id} has invalid stationGroup ${String((item as { stationGroup?: string }).stationGroup)}`,
    );
  }
});

test('every SIDEBAR_PAGE_NAV station in APP declares matching stationGroup', () => {
  const byId = new Map(
    APP_SIDEBAR_NAV.filter((i) => i.kind === 'station').map((i) => [i.id, i]),
  );
  for (const page of SIDEBAR_PAGE_NAV) {
    if (page.kind !== 'station') continue;
    const flat = byId.get(page.id);
    // Legacy `receiving` family entry stays in SIDEBAR_PAGE_NAV for mode
    // resolution / deep-links but is not an APP L1 row.
    if (!flat) {
      assert.equal(page.id, 'receiving', `${page.id} missing from APP_SIDEBAR_NAV stations`);
      continue;
    }
    assert.equal(
      page.stationGroup,
      flat.stationGroup,
      `${page.id} stationGroup drift vs APP_SIDEBAR_NAV`,
    );
  }
});

test('Scan Stations appear in pipeline order in APP_SIDEBAR_NAV', () => {
  const floorIds = APP_SIDEBAR_NAV.filter(
    (item) => item.kind === 'station' && item.stationGroup === 'floor',
  ).map((item) => item.id);
  assert.deepEqual(floorIds, [...FLOOR_PIPELINE]);
});

/**
 * D-rulings: Arrival / Unbox / Local Pickup / Repair Service / Testing / Packing
 * / Scan out stay on the floor. Moving any of them under Inbound or Fulfillment
 * is an instant fail — a scanner bench answers to its input model, not to the
 * domain of the records it happens to touch.
 */
test('no scan bench leaks into a domain drill', () => {
  for (const id of FLOOR_PIPELINE) {
    const item = APP_SIDEBAR_NAV.find((i) => i.id === id);
    assert.ok(item, `${id} missing from APP_SIDEBAR_NAV`);
    assert.equal(item!.kind, 'station', `${id} must stay kind station`);
    assert.equal(
      spineSectionIdForPage(item),
      'floor',
      `${id} must resolve to the Scan Stations drill`,
    );
  }
  // Scan out is a floor bench; carrier Labels is Fulfillment. Different jobs,
  // different sections, same `/shipping` route family.
  const scanOut = APP_SIDEBAR_NAV.find((i) => i.id === 'scan-out');
  const outbound = APP_SIDEBAR_NAV.find((i) => i.id === 'outbound');
  assert.equal(spineSectionIdForPage(scanOut), 'floor');
  assert.equal(spineSectionIdForPage(outbound), 'fulfillment');
});

test('Receiving subgroup covers Arrival → Unbox → Local Pickup → Repair Service', () => {
  assert.deepEqual(
    STATION_SUBGROUPS.map((g) => g.id),
    ['receiving'],
  );
  assert.equal(STATION_SUBGROUPS[0]?.label, 'Receiving');
  assert.equal(typeof STATION_SUBGROUPS[0]?.icon, 'function');
  for (const id of RECEIVING_SUBGROUP) {
    const app = APP_SIDEBAR_NAV.find((i) => i.id === id);
    assert.ok(app && app.kind === 'station');
    assert.equal(app.stationSubgroup, 'receiving', `${id} missing stationSubgroup`);
    const page = SIDEBAR_PAGE_NAV.find((p) => p.id === id);
    assert.ok(page && page.kind === 'station');
    assert.equal(page.stationSubgroup, 'receiving', `${id} PAGE missing stationSubgroup`);
  }
  const repair = APP_SIDEBAR_NAV.find((i) => i.id === 'repair');
  assert.equal(repair?.label, 'Repair Service');
});

test('stationSubgroupMembers is the Receiving display SoT (excludes Incoming + legacy family)', () => {
  const members = stationSubgroupMembers('receiving');
  assert.deepEqual(
    members.map((m) => m.id),
    [...RECEIVING_SUBGROUP],
    'Receiving peers must be first-class APP stations only',
  );
  assert.equal(
    members.some((m) => m.id === 'incoming'),
    false,
    'Incoming is Inbound domain — not a Receiving station peer',
  );
  assert.equal(
    members.some((m) => m.id === 'receiving'),
    false,
    'legacy receiving family entry must not appear as a display member',
  );
  const incoming = getSidebarPageNav('incoming');
  assert.ok(incoming && incoming.kind === 'domain');
  assert.equal(incoming.domainGroup, 'inbound');
  // Legacy entry may still resolve deep-links, but is not the display source.
  assert.ok(getSidebarPageNav('receiving')?.children?.some((c) => c.id === 'incoming'));
});

test('Scan out is floor modeless; Fulfillment Shipping owns the carrier modes', () => {
  const scanOut = APP_SIDEBAR_NAV.find((i) => i.id === 'scan-out');
  assert.ok(scanOut && scanOut.kind === 'station');
  assert.equal(scanOut.stationGroup, 'floor');
  assert.equal(getSidebarPageNavModes('scan-out'), undefined);

  const outbound = SIDEBAR_PAGE_NAV.find((p) => p.id === 'outbound');
  assert.ok(outbound && outbound.kind === 'domain');
  assert.equal(outbound.domainGroup, 'fulfillment');
  for (const id of ['labels', 'fba']) {
    assert.ok(
      outbound.children?.some((m) => m.id === id),
      `Shipping lost its ${id} carrier mode`,
    );
  }
  assert.ok(
    !outbound.children?.some((m) => m.id === 'ready'),
    'Ready is an FBA stage tab, not a Shipping L2 child',
  );
});

function getSidebarPageNavModes(id: string) {
  return SIDEBAR_PAGE_NAV.find((p) => p.id === id)?.children;
}

test('SidebarNavList imports SPINE_SECTIONS and does not twin section labels', () => {
  assert.match(LIST_SRC, /SPINE_SECTIONS/);
  assert.doesNotMatch(LIST_SRC, /['"]Scan Stations['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Floor['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Desk['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Triage Desk['"]/);
  assert.match(LIST_SRC, /role=["']group["']/);
});

test('The flat map reads stationSubgroupMembers — Receiving header comes from SoT only', () => {
  // Free-form uppercase eyebrow twins remain banned; Receiving page-style header
  // reads getStationSubgroupDef (label + icon; no hardcoded "Receiving" string).
  assert.doesNotMatch(LIST_SRC, /text-role-micro uppercase tracking-widest text-text-faint/);
  assert.doesNotMatch(LIST_SRC, /text-role-micro font-semibold text-text-faint/);
  // Eyebrow voice is gone from the list entirely (2026-08-03 polish): Scan
  // Stations uses the same body/semibold chrome as Locations. The ban this
  // replaces was on free-form eyebrow TWINS, and that half is unchanged: no
  // hardcoded section or subgroup name may appear in this file.
  assert.doesNotMatch(
    LIST_SRC,
    /text-role-eyebrow uppercase tracking-widest text-text-soft/,
    'no eyebrow voice in the list — section header matches page-row type',
  );
  assert.match(LIST_SRC, /renderStationsEnterRow|renderStationsDrill/);
  assert.match(LIST_SRC, /\{section\.label\}/);
  assert.doesNotMatch(LIST_SRC, /['"]Receiving['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Scan Stations['"]/);
  assert.match(LIST_SRC, /getStationSubgroupDef/);
  assert.match(LIST_SRC, /stationSubgroupMembers/);
  assert.match(LIST_SRC, /stationSubgroup/);
  assert.doesNotMatch(
    LIST_SRC,
    /function\s+subgroupDef/,
    'local subgroupDef twin is retired — use getStationSubgroupDef',
  );
  assert.match(LIST_SRC, /renderPageHeader/);
  // Receiving discloses inside the Scan Stations drill — accordion open.
  assert.match(LIST_SRC, /openSubgroup/);
  assert.match(LIST_SRC, /closeSubgroup/);
  assert.match(LIST_SRC, /expandedSubgroups/);
  assert.match(LIST_SRC, /disclosure: \{ expanded: subgroupExpanded \}/);
  // All-sections drill state stays retired; floor uses stationsDrillOpen.
  assert.doesNotMatch(LIST_SRC, /\bonDrillChange\b|\bdrillId\b/);
  assert.match(LIST_SRC, /stationsDrillOpen/);
});

/**
 * The flatten INVERTED this one, and the reason is worth keeping.
 *
 * Inside a drill only one section was ever on screen, so a rule between its
 * nests was noise — that is what the old assertion banned. Flat, spacing
 * between SECTIONS is the only thing left saying the root axis is deliberately
 * mixed (Scan Stations is an INPUT MODEL among business DOMAINS), because the
 * section labels that used to say it are gone. Horizontal hairlines between
 * those blocks were retired 2026-08-03 — soft `mt-1` only, below the top pins.
 */
test('the flat map spaces sections without horizontal hairlines', () => {
  assert.match(LIST_SRC, /index > 0 && 'mt-1'/);
  assert.doesNotMatch(LIST_SRC, /index > 0 && 'mt-1 border-t border-border-soft/);
  // Peer L1 rows may take a soft gap; subgroup children must stay flush so the
  // nesting rail does not break into horizontal ticks.
  assert.doesNotMatch(LIST_SRC, /expanded && 'space-y-/);
  // Footer search / staff chrome may keep a top rule — the map itself must not.
  assert.doesNotMatch(
    LIST_SRC.match(/const renderMap[\s\S]*?\n {2}\};\n/)?.[0] ?? '',
    /border-t border-border-soft/,
  );
});
