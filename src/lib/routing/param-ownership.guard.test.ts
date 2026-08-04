/**
 * Guards rule 3 of the isolation contract — **a param is owned by exactly one
 * route** — and ratchets down the raw `searchParams.get()` reads that bypass a
 * spec entirely.
 *
 * This is the enforcement that the old denylists never had. `MODE_SCOPED_PARAMS`
 * was a list someone had to remember to extend; every param added to a receiving
 * surface between the last edit and the next bug was a silent leak. Here, a new
 * param that no spec declares fails the build.
 *
 * Both allowlists below **only shrink** — same ratchet discipline as the DS
 * guards in `npm run verify`. Never add an entry to land a change.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import {
  AMBIENT_PARAMS,
  SHARED_OWNED_KEYS,
  declaredKeys,
} from './route-params';
import { RECEIVING_ROUTE_PARAMS } from './receiving-routes';
import { OUTBOUND_ROUTE_PARAMS } from './outbound-routes';
import { QUERY_MODE_ROUTE_PARAMS } from './query-mode-routes';

const SRC_ROOT = join(process.cwd(), 'src');

/** Every migrated family the guard governs. */
const ALL_SPECS = [
  ...RECEIVING_ROUTE_PARAMS,
  ...OUTBOUND_ROUTE_PARAMS,
  ...QUERY_MODE_ROUTE_PARAMS,
];

/**
 * The governed surfaces — every family with declared param specs. An entry is a
 * directory OR a single file, because a surface's params are not all read under
 * one tree: every sidebar panel is a top-level file in `components/sidebar/`, so
 * a directory-only list cannot see the one component that writes the mode URL.
 * That is the half of a surface where the leak actually lives.
 */
const OWNED_TREES = [
  'components/receiving',
  'components/sidebar/receiving',
  'app/unbox',
  'app/triage',
  'app/incoming',
  'app/pickup',
  'app/repair',
  'app/receiving',
  'components/outbound',
  'components/fba',
  'app/shipping',
  'components/support',
  'components/sidebar/SupportSidebarPanel.tsx',
  'components/sidebar/support',
  'app/support',
  'components/products',
  'components/sidebar/ProductsSidebarPanel.tsx',
  'app/products',
  'components/dashboard',
  'components/sidebar/DashboardOrdersContextPanel.tsx',
  // Shipped / unshipped boards mount on `/shipping/orders` and own most of its URL
  // writes — without these trees the ownership guard was blind to every
  // `shippedFilter` / `ostatus` / `stage` read (caught only by the hand-off sweep).
  'components/shipped',
  'components/unshipped',
  'app/dashboard',
  'app/search',
  'components/search',
  'components/sourcing',
  'components/sidebar/SourcingSidebarPanel.tsx',
  'app/sourcing',
  'components/tech',
  'components/sidebar/TechSidebarPanel.tsx',
  'app/test',
  'app/tech',
  'components/walk-in',
  'components/sidebar/WalkInSidebarPanel.tsx',
  'app/walk-in',
  'components/inventory',
  'components/sidebar/InventorySidebarPanel.tsx',
  'app/inventory',
  'app/review',
  'features/review',
  'app/pack',
  'app/packer',
  'components/packer',
  'components/sidebar/PackerSidebarPanel.tsx',
  'app/warehouse',
  'components/warehouse',
  'components/sidebar/WarehouseSidebarPanel.tsx',
];

/**
 * Params read in the receiving tree that no spec declares. **Shrink only.**
 *
 * `mode` — the legacy `?mode=` shell on bare `/receiving`. Every read here is a
 * `?? 'receive'` fallback, and a graduated route drops the param at the boundary
 * so those reads already see `null`. Dies with the `/receiving` sunset (Slice 4).
 */
/**
 * Params read in a governed tree that no spec declares. **Shrink only.**
 *
 * Currently empty, and that is the point: `mode` was the last entry, and it left
 * when `/support` and `/dashboard` declared it. An addition here is a claim that
 * a param is read but owned by nobody — which is how the leak class starts.
 */
const UNDECLARED_READS: Readonly<Record<string, string>> = {};

/**
 * Param-name constants that are deliberately NOT declared by any spec, with the
 * reason. **Shrink only** — an entry here is a claim that the key is unreachable
 * on every spec-backed route, which is a much narrower claim than it looks.
 */
const UNDECLARED_PARAM_CONSTANTS: Readonly<Record<string, string>> = {
  focusShippedSearch: 'Not a URL param the app reads — `utils/events.ts` sets it on an outgoing href for a one-shot focus handoff; no `searchParams.get` reads it back.',
};

/**
 * Every `X_PARAM = 'key'` constant in `src`, so the guard can check the keys that
 * are read through a CONSTANT rather than a string literal.
 *
 * This exists because the literal-only {@link GET_CALL} regex has a structural
 * blind spot, and it cost two real defects (both found 2026-07-29, both fixed):
 * `RouteShell`'s `?pane=` and the station-table contract's `?layout=` /
 * `?density=` / `?weekOffset=`. All four are read as
 * `searchParams.get(SOME_CONSTANT)` from shared modules that live outside every
 * surface tree, so no `OWNED_TREES` entry and no literal grep could ever see
 * them — while the routes that mount `useSurfaceParamHygiene()` dropped them on
 * arrival. The mobile pane toggle snapped back to History, and applying a saved
 * view reverted instantly.
 *
 * A guard that cannot fail is worse than no guard: this one closes the class by
 * asserting the DECLARATION side, which is decidable, instead of trying to
 * resolve every dynamic read.
 *
 * **Known limit — it checks "some spec declares this key", not "the route that
 * reads it declares it".** Resolving which routes render a given shared module
 * would need an import graph. So a key declared by one route but read on a
 * different, spec-backed route still slips through. Station `SCOPE_PARAM` is the
 * live example: `?scope=` is declared only by `/` (Home), and if
 * `useStationStaffScope` ever gained a consumer on `/test` the value would be
 * dropped there with this guard still green. It stays safe today only because
 * that hook has zero consumers and both it and `parseScope` already sit in
 * `knip-baseline.json` as dead exports. When Pack or a station table starts
 * reading scope for real, declare it on that route.
 */
const PARAM_CONSTANT_DECL =
  /^\s*(?:export\s+)?const\s+[A-Z][A-Z0-9_]*_PARAM(?:S)?\s*(?::[^=]*)?=\s*'([a-zA-Z_][a-zA-Z0-9_]*)'/gm;

/** True for a source file the guard should read (not a test/spec sibling). */
function isGoverned(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.(test|spec)\.tsx?$/.test(path);
}

/**
 * Every governed source file under `target`, which may be a directory or a
 * single file. A missing path throws rather than resolving to zero files — a
 * silently-empty tree is a guard that passes because it looked nowhere, which is
 * indistinguishable from a clean surface.
 */
function walk(target: string, out: string[] = []): string[] {
  const stat = statSync(target); // throws on a stale OWNED_TREES entry — deliberate
  if (!stat.isDirectory()) {
    if (isGoverned(target)) out.push(target);
    return out;
  }
  for (const entry of readdirSync(target)) {
    const full = join(target, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!isGoverned(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Every `.get('key')` read in a file, whatever the receiver is named. */
const GET_CALL = /\.get\('([a-zA-Z_][a-zA-Z0-9_]*)'\)/g;

test('rule 3 — a param is owned by exactly one route', () => {
  const owners = new Map<string, string[]>();
  for (const spec of ALL_SPECS) {
    for (const key of Object.keys(spec.owns)) {
      owners.set(key, [...(owners.get(key) ?? []), spec.route]);
    }
  }

  const undeclaredCollisions = [...owners.entries()]
    .filter(([key, routes]) => routes.length > 1 && !(key in SHARED_OWNED_KEYS))
    .map(([key, routes]) => `?${key}= is owned by ${routes.join(' and ')}`);

  assert.deepEqual(
    undeclaredCollisions,
    [],
    'Two routes own the same param. Either give one of them its own key, or ' +
      'declare the sharing in SHARED_OWNED_KEYS with the reason it is one question.',
  );
});

test('SHARED_OWNED_KEYS only lists keys that are actually shared (it shrinks)', () => {
  const shareCount = new Map<string, number>();
  for (const spec of ALL_SPECS) {
    for (const key of Object.keys(spec.owns)) {
      shareCount.set(key, (shareCount.get(key) ?? 0) + 1);
    }
  }
  const stale = Object.keys(SHARED_OWNED_KEYS).filter((key) => (shareCount.get(key) ?? 0) < 2);
  assert.deepEqual(
    stale,
    [],
    'These keys no longer have two owners — drop them from SHARED_OWNED_KEYS.',
  );
});

/**
 * Routes whose `?sort=` vocabulary BAKES the direction into the value
 * (`zoho_newest` / `zoho_oldest`, `priority` / `newest`), so a separate `?dir=`
 * would be a param with no reader. Every other route that owns `sort` can
 * receive a grid COLUMN key, where direction is a second, independent axis.
 *
 * **This list only shrinks** — same ratchet discipline as the DS guards. A
 * route earns removal by growing a column sort and declaring `dir`; never add
 * an entry to land a change.
 */
const SORT_WITHOUT_DIRECTION: Readonly<Record<string, string>> = {
  '/unbox': 'History tab ORDER BY — `unboxed_newest` / `scanned_newest`, both directional values.',
  '/incoming': 'Server ORDER BY — Pipeline (`zoho_newest`…) and Docked (`scanned_newest` / `unboxed_newest`); directional values, no separate `?dir=`.',
  '/shipping/labels': 'SHIPPING_COMMON display sort — `priority` / `newest`.',
  '/shipping/fba': 'SHIPPING_COMMON display sort — `priority` / `newest`.',
  '/shipping/scan-out': 'SHIPPING_COMMON display sort — `priority` / `newest`.',
  '/products': 'Pairing backlog ordering — `volume` / `confidence` / `count` / `title`, a rank choice rather than a sortable column.',
};

/**
 * `?dir=` is meaningless without `?sort=`, and `?sort=` without `?dir=` is
 * WORSE than meaningless — the boundary parse strips the undeclared half, so
 * the surface silently pins itself to the sort's default direction.
 *
 * `SHARED_OWNED_KEYS.dir` has documented this pairing since the 2026-06 bug,
 * but nothing enforced it: `/dashboard` shipped `sort` without `dir`, which
 * made every Pending column sort permanently ascending (the header wrote
 * `dir=desc`, hygiene deleted it on the next pass, and `parseQueueDisplaySortDir`
 * resolved the now-missing param back to the default). A prose invariant is a
 * recipe; this is the enforcement.
 */
test('a route that owns ?sort= also owns ?dir= (direction is never orphaned)', () => {
  const orphaned = ALL_SPECS.filter(
    (spec) =>
      'sort' in spec.owns && !('dir' in spec.owns) && !(spec.route in SORT_WITHOUT_DIRECTION),
  ).map((spec) => spec.route);
  assert.deepEqual(
    orphaned,
    [],
    'These routes declare ?sort= but not ?dir=, so the boundary parse will strip the direction and pin the surface to the sort default. Add `dir: paramEnum([\'asc\',\'desc\'])`, or document the route in SORT_WITHOUT_DIRECTION if its sort vocabulary bakes direction into the value.',
  );

  // The allowlist only shrinks: an entry whose route grew a `dir` (or lost
  // `sort`) is stale and must go, or it silently excuses the next regression.
  const staleExcuses = Object.keys(SORT_WITHOUT_DIRECTION).filter((route) => {
    const spec = ALL_SPECS.find((s) => s.route === route);
    return !spec || !('sort' in spec.owns) || 'dir' in spec.owns;
  });
  assert.deepEqual(
    staleExcuses,
    [],
    'These SORT_WITHOUT_DIRECTION entries no longer describe a live sort-without-dir route — drop them.',
  );

  // The converse is a different (harmless-but-dead) shape: a direction with
  // nothing to direct. Catch it in the same place so the pair stays a pair.
  const dangling = ALL_SPECS.filter(
    (spec) => 'dir' in spec.owns && !('sort' in spec.owns),
  ).map((spec) => spec.route);
  assert.deepEqual(dangling, [], 'These routes declare ?dir= with no ?sort= to direct.');
});

test('an owned param never shadows an ambient one', () => {
  const shadowed: string[] = [];
  for (const spec of ALL_SPECS) {
    for (const key of Object.keys(spec.owns)) {
      if (key in AMBIENT_PARAMS) shadowed.push(`${spec.route} owns ambient ?${key}=`);
    }
  }
  assert.deepEqual(
    shadowed,
    [],
    'Ambient params are owned by AMBIENT_PARAMS. Carry them, do not re-own them.',
  );
});

test('every receiving route declares at least one param and a unique route', () => {
  const routes = ALL_SPECS.map((spec) => spec.route);
  assert.equal(new Set(routes).size, routes.length, 'Two specs claim the same route.');
  for (const spec of ALL_SPECS) {
    assert.ok(
      declaredKeys(spec).length > 0,
      `${spec.route} declares no params — delete the spec or declare what it owns.`,
    );
  }
});

test('no raw param read in a governed tree bypasses a spec', () => {
  const declared = new Set<string>([
    ...ALL_SPECS.flatMap((spec) => Object.keys(spec.owns)),
    ...Object.keys(AMBIENT_PARAMS),
  ]);

  const offenders: string[] = [];
  const seenUndeclared = new Set<string>();

  for (const dir of OWNED_TREES) {
    for (const file of walk(join(SRC_ROOT, dir))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(GET_CALL)) {
        const key = match[1]!;
        if (declared.has(key)) continue;
        if (key in UNDECLARED_READS) {
          seenUndeclared.add(key);
          continue;
        }
        offenders.push(`${relative(SRC_ROOT, file)} reads ?${key}=`);
      }
    }
  }

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    [],
    'A receiving surface reads a URL param no route spec declares. Declare it in ' +
      'src/lib/routing/receiving-routes.ts so it survives the boundary parse — ' +
      'an undeclared param is dropped on arrival and will read as null.',
  );

  const stale = Object.keys(UNDECLARED_READS).filter((key) => !seenUndeclared.has(key));
  assert.deepEqual(stale, [], 'These UNDECLARED_READS entries are gone — delete them.');
});

test('every *_PARAM constant is declared by a spec, or excused with a reason', () => {
  const declared = new Set<string>([
    ...ALL_SPECS.flatMap((spec) => Object.keys(spec.owns)),
    ...Object.keys(AMBIENT_PARAMS),
  ]);

  const offenders: string[] = [];
  const seen = new Set<string>();

  for (const file of walk(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(PARAM_CONSTANT_DECL)) {
      const key = match[1]!;
      if (declared.has(key)) continue;
      if (key in UNDECLARED_PARAM_CONSTANTS) {
        seen.add(key);
        continue;
      }
      offenders.push(`${relative(SRC_ROOT, file)} declares ?${key}= but no spec owns it`);
    }
  }

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    [],
    'A *_PARAM constant names a URL param no spec declares. Because the read goes ' +
      'through the constant, the literal-only read guard above cannot see it — and ' +
      'on any route that mounts useSurfaceParamHygiene() the param is DROPPED on ' +
      'arrival, so the control silently reverts. Declare it on the owning route, ' +
      'or in AMBIENT_PARAMS when a shared shell owns the question.',
  );

  const stale = Object.keys(UNDECLARED_PARAM_CONSTANTS).filter((key) => !seen.has(key));
  assert.deepEqual(
    stale,
    [],
    'These UNDECLARED_PARAM_CONSTANTS entries no longer match any constant — delete them.',
  );
});
