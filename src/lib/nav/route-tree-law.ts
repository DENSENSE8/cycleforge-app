/**
 * **THE ROUTE-TREE LAW** — the checks and the queries over
 * `src/lib/nav/route-tree.ts`, the one source for Warehouse-lane URLs and
 * domain words (owner 2026-10-03).
 *
 * ONE module, three consumers — the shape `tools/design-mcp` demands before it
 * exposes a verdict:
 *   1. verify `Routes` — `scripts/route-tree-guard.ts` (exit 0 pass / 1 verdict).
 *   2. `ds_route`, `ds_vocabulary`, `ds_route_tree` — the MCP faces, which spawn
 *      the same guard with `--mode route|vocabulary|tree`.
 *   3. session start — `route-tree-guard.ts --digest` prints `digest()`.
 *
 * Pure: every file-system fact (page files on disk, literal counts, the
 * baseline) is passed in by the guard, so the module never disagrees with
 * itself between the gate and the tool.
 */

import {
  MOBILE_V2_DESTINATIONS,
  MOBILE_V2_FULFILLMENT_DESTINATIONS,
  MOBILE_V2_OPERATION_GROUPS,
  MOBILE_V2_UTILITY_DESTINATIONS,
  MOBILE_V2_WORKSPACE_DESTINATIONS,
  type MobileV2Destination,
} from '@/components/mobile/v2/mobile-v2-destinations';
import {
  ROUTE_TREE,
  VOCABULARY,
  lookupTerm,
  routeAncestry,
  routeChildren,
  routeForFile,
  routeForPath,
  routeNode,
  type RouteNode,
  type VocabularyTerm,
} from '@/lib/nav/route-tree';

// ── Findings ────────────────────────────────────────────────────────────────

export type RouteTreeRule =
  | 'unregistered-page'
  | 'name-clash'
  | 'menu-owner'
  | 'banned-word'
  | 'literal-path';

export interface RouteTreeFinding {
  rule: RouteTreeRule;
  severity: 'error' | 'advisory';
  message: string;
  file?: string;
  nodeId?: string;
}

export const ROUTE_TREE_LAW =
  'Every Warehouse URL, nav name and domain word comes from src/lib/nav/route-tree.ts (owner 2026-10-03). Write paths with WAREHOUSE_PATHS and the builders, never a literal; paint the VOCABULARY label, never a banned synonym. Unsure of a name or URL → ds_route / ds_vocabulary; no answer → ask the operator. Never invent a path or a synonym.';

/** The phone menu group that IS the Warehouse lane today (phase 2 renames it). */
export const WAREHOUSE_MENU_GROUP = 'inventory';

/** Where Warehouse pages live today; every page.tsx under them must be a node's `page`. */
export const WAREHOUSE_PAGE_DIRS: readonly string[] = [
  'src/app/m/(shell)/stock',
  'src/app/m/(shell)/loc',
  'src/app/m/(shell)/labels',
  'src/app/m/(shell)/racks',
  'src/app/m/(shell)/h',
  'src/app/m/(immersive)/stock',
];

/** The file that is allowed to hold Warehouse path literals. */
export const ROUTE_TREE_SOURCE = 'src/lib/nav/route-tree.ts';

function isWarehouseNode(node: RouteNode | undefined): node is RouteNode {
  return Boolean(node && routeAncestry(node.id)[0]?.id === 'warehouse');
}

// ── unregistered-page ───────────────────────────────────────────────────────

/**
 * `pageFiles`: every repo-relative `page.tsx` under WAREHOUSE_PAGE_DIRS.
 * `exists`: whether a repo-relative file is on disk.
 */
export function findUnregisteredPages(
  pageFiles: readonly string[],
  exists: (file: string) => boolean,
): RouteTreeFinding[] {
  const findings: RouteTreeFinding[] = [];
  const registered = new Set(ROUTE_TREE.map((node) => node.page).filter(Boolean));
  for (const file of pageFiles) {
    if (!registered.has(file)) {
      findings.push({
        rule: 'unregistered-page',
        severity: 'error',
        file,
        message: `${file} serves a Warehouse URL but no ROUTE_TREE node names it as its page — add the node (ask the operator for its name and parent) before shipping the page.`,
      });
    }
  }
  for (const node of ROUTE_TREE) {
    if (node.status !== 'live') continue;
    if (!node.page) {
      findings.push({
        rule: 'unregistered-page',
        severity: 'error',
        nodeId: node.id,
        message: `node "${node.id}" is live but names no page.`,
      });
    } else if (!exists(node.page)) {
      findings.push({
        rule: 'unregistered-page',
        severity: 'error',
        nodeId: node.id,
        file: node.page,
        message: `node "${node.id}" is live but its page ${node.page} is not on disk.`,
      });
    }
  }
  return findings;
}

// ── name-clash ──────────────────────────────────────────────────────────────

export function findNameClashes(): RouteTreeFinding[] {
  const findings: RouteTreeFinding[] = [];
  for (const node of ROUTE_TREE) {
    if (node.kind === 'record' || !node.parent) continue;
    const parent = routeNode(node.parent);
    if (parent && parent.label.trim().toLowerCase() === node.label.trim().toLowerCase()) {
      findings.push({
        rule: 'name-clash',
        severity: 'error',
        nodeId: node.id,
        message: `"${node.label}" (${node.id}) wears its parent's name (${parent.id}) — rename the CHILD.`,
      });
    }
  }
  return findings;
}

// ── menu-owner ──────────────────────────────────────────────────────────────

const findWarehouseGroup = () =>
  MOBILE_V2_OPERATION_GROUPS.find((group) => group.id === WAREHOUSE_MENU_GROUP);

/** Every destination list the phone menu paints, labelled by where it sits. */
function allDestinations(): Array<{ where: string; destination: MobileV2Destination }> {
  const lists: Array<[string, readonly MobileV2Destination[]]> = [
    ['MOBILE_V2_DESTINATIONS', MOBILE_V2_DESTINATIONS],
    ['MOBILE_V2_UTILITY_DESTINATIONS', MOBILE_V2_UTILITY_DESTINATIONS],
    ['MOBILE_V2_WORKSPACE_DESTINATIONS', MOBILE_V2_WORKSPACE_DESTINATIONS],
    ['MOBILE_V2_FULFILLMENT_DESTINATIONS', MOBILE_V2_FULFILLMENT_DESTINATIONS],
    ...MOBILE_V2_OPERATION_GROUPS.map(
      (group) => [`group ${group.id}`, group.destinations] as [string, readonly MobileV2Destination[]],
    ),
  ];
  return lists.flatMap(([where, list]) => list.map((destination) => ({ where, destination })));
}

export function findMenuOwnerViolations(): RouteTreeFinding[] {
  const file = 'src/components/mobile/v2/mobile-v2-destinations.tsx';
  const group = findWarehouseGroup();
  if (!group) {
    return [
      {
        rule: 'menu-owner',
        severity: 'error',
        file,
        message: `MOBILE_V2_OPERATION_GROUPS has no "${WAREHOUSE_MENU_GROUP}" group — the Warehouse lane has no menu.`,
      },
    ];
  }
  const findings: RouteTreeFinding[] = [];
  const inGroup = new Set(group.destinations.map((d) => d.id));
  for (const destination of group.destinations) {
    const node = routeForPath(destination.href);
    if (!isWarehouseNode(node)) {
      findings.push({
        rule: 'menu-owner',
        severity: 'error',
        file,
        message: `menu group "${group.id}" lists "${destination.label}" (${destination.href}), which is not a Warehouse node in ROUTE_TREE — register it or move it to the lane that owns it.`,
      });
    }
  }
  const seen = new Set<string>();
  for (const { where, destination } of allDestinations()) {
    if (where === `group ${group.id}`) continue;
    const node = routeForPath(destination.href);
    if (!isWarehouseNode(node)) continue;
    const misplaced = where.startsWith('group ') || !inGroup.has(destination.id);
    const key = `${where}:${destination.id}`;
    if (misplaced && !seen.has(key)) {
      seen.add(key);
      findings.push({
        rule: 'menu-owner',
        severity: 'error',
        file,
        nodeId: node.id,
        message: `"${destination.label}" (${destination.href}) is the Warehouse node "${node.id}" but sits in ${where}, outside menu group "${group.id}".`,
      });
    }
  }
  return findings;
}

// ── banned-word ─────────────────────────────────────────────────────────────

interface BannedEntry {
  term: VocabularyTerm;
  entry: string;
  bare: string;
  qualified: boolean;
}

function bannedEntries(): BannedEntry[] {
  return VOCABULARY.flatMap((term) =>
    term.banned.map((entry) => ({
      term,
      entry,
      bare: entry.split(' (')[0]!.trim().toLowerCase(),
      qualified: entry.includes('('),
    })),
  );
}

/** Whole-word (or whole-phrase) match, plural `s` allowed: "zone" hits "Zones" and "Zone map". */
function containsWord(label: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}s?($|[^a-z0-9])`, 'i').test(label);
}

/** The banned entries a painted label breaks. */
export function bannedHits(label: string): BannedEntry[] {
  const lower = label.trim().toLowerCase();
  // A label that IS a canonical term's own word ("LPN", "Rack") is that term, not another term's
  // qualified synonym ("LPN (for a tote)", "rack (for fixed racking)").
  const isTerm = VOCABULARY.some((t) => t.label.toLowerCase() === lower || t.plural.toLowerCase() === lower);
  return bannedEntries().filter((b) =>
    b.qualified ? (lower === b.bare || lower === `${b.bare}s`) && !isTerm : containsWord(lower, b.bare),
  );
}

export function findBannedWords(): RouteTreeFinding[] {
  const findings: RouteTreeFinding[] = [];
  const report = (label: string, where: string, extra: Partial<RouteTreeFinding>) => {
    for (const hit of bannedHits(label)) {
      findings.push({
        rule: 'banned-word',
        severity: 'error',
        ...extra,
        message: `${where} "${label}" uses "${hit.entry}", banned for ${hit.term.label} (${hit.term.id}) — paint "${hit.term.label}".`,
      });
    }
  };
  for (const node of ROUTE_TREE) report(node.label, `node ${node.id}`, { nodeId: node.id });
  for (const destination of findWarehouseGroup()?.destinations ?? []) {
    report(destination.label, `menu destination ${destination.id}`, {
      file: 'src/components/mobile/v2/mobile-v2-destinations.tsx',
    });
  }
  return findings;
}

// ── literal-path ────────────────────────────────────────────────────────────

/** Live Warehouse path prefixes, cut at the first `[`, minimal set (`/m/stock`, `/m/loc/`, …). */
export function literalPathPrefixes(): string[] {
  const cut = ROUTE_TREE.filter((node) => node.status === 'live' && node.path && isWarehouseNode(node))
    .map((node) => node.path!.split('[')[0]!)
    .filter((prefix) => prefix.length > 3);
  const unique = [...new Set(cut)].sort((a, b) => a.length - b.length);
  return unique.filter((prefix, i) => !unique.slice(0, i).some((shorter) => covers(shorter, prefix)));
}

function covers(prefix: string, value: string): boolean {
  if (!value.startsWith(prefix)) return false;
  if (prefix.endsWith('/')) return true;
  const next = value.charAt(prefix.length);
  return next === '' || next === '/' || next === '?' || next === '#';
}

/** Does a string literal's text (or a template's head) start with a live Warehouse path? */
export function isWarehousePathLiteral(text: string, prefixes = literalPathPrefixes()): boolean {
  return prefixes.some((prefix) => covers(prefix, text));
}

/** Whether a repo-relative source file is subject to the literal-path count. */
export function literalScanApplies(file: string): boolean {
  return (
    /^src\/.*\.(ts|tsx)$/.test(file) &&
    file !== ROUTE_TREE_SOURCE &&
    !/\.(test|spec)\.(ts|tsx)$/.test(file) &&
    !file.includes('/__tests__/')
  );
}

export interface LiteralBaseline {
  files: Record<string, number>;
}

export function compareLiteralBaseline(
  counts: Readonly<Record<string, number>>,
  baseline: LiteralBaseline,
): RouteTreeFinding[] {
  const findings: RouteTreeFinding[] = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(baseline.files)]);
  for (const file of [...files].sort()) {
    const now = counts[file] ?? 0;
    const frozen = baseline.files[file];
    if (frozen === undefined) {
      if (now > 0) {
        findings.push({
          rule: 'literal-path',
          severity: 'error',
          file,
          message: `${now} Warehouse path literal(s) in a file outside the baseline — use WAREHOUSE_PATHS / the builders from @/lib/nav/route-tree.`,
        });
      }
    } else if (now > frozen) {
      findings.push({
        rule: 'literal-path',
        severity: 'error',
        file,
        message: `${now} Warehouse path literal(s), baseline ${frozen} — the new ones must use WAREHOUSE_PATHS / the builders from @/lib/nav/route-tree.`,
      });
    } else if (now < frozen) {
      findings.push({
        rule: 'literal-path',
        severity: 'advisory',
        file,
        message: `${now} Warehouse path literal(s), baseline ${frozen} — shrink the baseline (route-tree-guard.ts --write-baseline).`,
      });
    }
  }
  return findings;
}

// ── All checks ──────────────────────────────────────────────────────────────

export interface RouteTreeFacts {
  pageFiles: readonly string[];
  exists: (file: string) => boolean;
  literalCounts: Readonly<Record<string, number>>;
  baseline: LiteralBaseline;
}

export function checkRouteTree(facts: RouteTreeFacts): RouteTreeFinding[] {
  return [
    ...findUnregisteredPages(facts.pageFiles, facts.exists),
    ...findNameClashes(),
    ...findMenuOwnerViolations(),
    ...findBannedWords(),
    ...compareLiteralBaseline(facts.literalCounts, facts.baseline),
  ];
}

export function formatRouteTreeFinding(f: RouteTreeFinding): string {
  const at = f.file ?? (f.nodeId ? `node ${f.nodeId}` : '');
  return `[${f.severity}] ${f.rule}${at ? ` ${at}` : ''}: ${f.message}`;
}

// ── Queries (ds_route · ds_vocabulary · ds_route_tree · digest) ─────────────

/** nodeId → the export a caller writes instead of a literal. */
export const ROUTE_BUILDERS: Readonly<Record<string, string>> = {
  customers: 'CUSTOMER_PATHS.desktop',
  'customers-mobile': 'CUSTOMER_PATHS.mobile',
  'customer-mobile': 'customerMobilePath(id)',
  'quality-control': 'QUALITY_CONTROL_PATHS.desktop',
  'quality-control-mobile': 'QUALITY_CONTROL_PATHS.mobile',
  'quality-control-line-mobile': 'qualityControlLineMobilePath(id)',
  'quality-control-lpn-mobile': 'qualityControlLpnMobilePath(id)',
  stock: 'WAREHOUSE_PATHS.stock',
  'stock-detail': 'WAREHOUSE_PATHS.stockDetail',
  'stock-photos': 'stockPhotosHref(stockId, { sku, back })',
  location: 'locationPath(code)',
  'location-info': 'locationInfoPath(code)',
  'location-cleanup': 'WAREHOUSE_PATHS.locationCleanup',
  'location-labels': 'locationLabelsHref({ code, kind, back })',
  'rack-labels': 'rackLabelsHref({ rack, back })',
  racks: 'WAREHOUSE_PATHS.racks',
  'rack-new': 'WAREHOUSE_PATHS.newRack',
  rack: 'locationPath(code)',
  container: 'containerPath(id)',
  'fnsku-labels': 'PRINT_STATION_PATHS.fnskuLabels',
  'print-stations': 'PRINT_STATION_PATHS.stations',
  'print-station-device': 'printStationDeviceHref({ code })',
  purchasing: 'RECEIVING_PATHS.purchasing',
};

const BUILDER_IMPORT = "import { … } from '@/lib/nav/route-tree'";

const ASK_OPERATOR =
  'No node in the route tree owns this. Ask the operator which of these owns it (or what to name it) — never invent a path or a name. Then add the node to ROUTE_TREE in src/lib/nav/route-tree.ts.';

export interface RouteMatch {
  node: Pick<RouteNode, 'id' | 'label' | 'kind' | 'status'> & Partial<Pick<RouteNode, 'query' | 'note' | 'forwardsTo'>>;
  ancestry: string[];
  path: string | null;
  target: string;
  page: string | null;
  builder?: string;
  score?: number;
}

function toMatch(node: RouteNode, score?: number): RouteMatch {
  return {
    node: {
      id: node.id,
      label: node.label,
      kind: node.kind,
      status: node.status,
      ...(node.query ? { query: node.query } : {}),
      ...(node.note ? { note: node.note } : {}),
      ...(node.forwardsTo ? { forwardsTo: node.forwardsTo } : {}),
    },
    ancestry: routeAncestry(node.id).map((n) => n.label),
    path: node.path,
    target: node.target,
    page: node.page,
    ...(ROUTE_BUILDERS[node.id] ? { builder: `${ROUTE_BUILDERS[node.id]} — ${BUILDER_IMPORT}` } : {}),
    ...(score === undefined ? {} : { score }),
  };
}

function laneMenu(lane = 'warehouse') {
  return ROUTE_TREE.filter(
    (node) => node.kind === 'collection' && routeAncestry(node.id)[0]?.id === lane,
  ).map((node) => ({ id: node.id, label: node.label, path: node.path, target: node.target, status: node.status }));
}

const STOPWORDS: Record<string, true> = Object.fromEntries(
  'a an the to for of on in at or and is it my me i we you with from by this that new all its our your into onto up out how what where which add make show open go get see view page screen list'
    .split(' ')
    .map((word) => [word, true] as const),
);

const stem = (word: string) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [];
}

interface TermHit {
  word: string;
  term: string;
  label: string;
  via: 'term' | 'banned';
  correction?: string;
}

/** Words + bigrams of an intent, each looked up in the vocabulary. */
function intentTerms(intent: string): TermHit[] {
  const tokens = words(intent);
  const candidates = [
    ...tokens.slice(0, -1).map((w, i) => `${w} ${tokens[i + 1]}`),
    ...tokens,
  ];
  const hits: TermHit[] = [];
  const claimed = new Set<string>();
  for (const word of candidates) {
    if (claimed.has(word)) continue;
    const hit = lookupTerm(word);
    if (!hit) continue;
    // A bigram that resolved claims both of its words.
    if (word.includes(' ')) for (const part of word.split(' ')) claimed.add(part);
    hits.push({
      word,
      term: hit.term.id,
      label: hit.term.label,
      via: hit.via,
      ...(hit.via === 'banned' ? { correction: `say "${hit.term.label}", not "${word}"` } : {}),
    });
  }
  return hits;
}

function scoreIntent(intent: string, terms: TermHit[]): Array<{ node: RouteNode; score: number }> {
  const termIds = new Set(terms.map((t) => t.term));
  const segments = new Set(
    terms.map((t) => VOCABULARY.find((v) => v.id === t.term)?.segment).filter(Boolean) as string[],
  );
  const content = words(intent).filter((w) => w.length >= 3 && !STOPWORDS[w]).map(stem);
  const scored = ROUTE_TREE.map((node) => {
    let score = 0;
    if (node.owns && termIds.has(node.owns)) score += 3;
    const labelWords = new Set(words(node.label).map(stem));
    for (const w of content) if (labelWords.has(w)) score += 2;
    for (const q of node.query ?? []) if (segments.has(q)) score += 1;
    const owned = VOCABULARY.find((v) => v.id === node.owns);
    if (owned) {
      const defWords = new Set(words(owned.definition).map(stem));
      for (const w of content) if (defWords.has(w)) score += 1;
    }
    if (score > 0 && node.status === 'planned') score -= 0.5;
    if (score > 0 && node.kind === 'compat') score -= 1;
    return { node, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
}

export interface ResolveRouteInput {
  path?: string;
  file?: string;
  intent?: string;
}

export function resolveRoute(input: ResolveRouteInput) {
  const exact = input.path ? routeForPath(input.path) : input.file ? routeForFile(input.file) : undefined;
  if (input.path || input.file) {
    if (exact) {
      return {
        decision: 'route' as const,
        by: input.path ? 'path' : 'file',
        matches: [toMatch(exact)],
        ...(exact.forwardsTo ? { forwardsTo: toMatch(routeNode(exact.forwardsTo)!) } : {}),
      };
    }
    if (!input.intent) {
      return { decision: 'ask-operator' as const, matches: [], menu: laneMenu(), instruction: ASK_OPERATOR };
    }
  }
  const intent = input.intent?.trim() ?? '';
  if (!intent) {
    return {
      decision: 'ask-operator' as const,
      matches: [],
      menu: laneMenu(),
      instruction: 'Pass { path }, { file } or { intent }. ' + ASK_OPERATOR,
    };
  }
  const terms = intentTerms(intent);
  const ranked = scoreIntent(intent, terms);
  const [top, second] = ranked;
  const decided = Boolean(top && top.score >= 1 && (!second || top.score > second.score));
  const corrections = terms.filter((t) => t.correction).map((t) => t.correction!);
  return {
    decision: decided ? ('route' as const) : ('ask-operator' as const),
    terms,
    ...(corrections.length ? { corrections } : {}),
    matches: ranked.slice(0, decided ? 3 : 5).map((r) => toMatch(r.node, r.score)),
    ...(decided
      ? {}
      : {
          menu: laneMenu(),
          instruction: ranked.length
            ? 'More than one node fits equally. Ask the operator which one is meant — never pick by guess, never invent a new path.'
            : ASK_OPERATOR,
        }),
  };
}

function presentTerm(term: VocabularyTerm) {
  return {
    id: term.id,
    label: term.label,
    plural: term.plural,
    definition: term.definition,
    ...(term.segment ? { segment: term.segment } : {}),
    banned: term.banned,
    ...(term.industry ? { industry: term.industry } : {}),
    owner: term.owner,
    decided: term.decided,
    routes: ROUTE_TREE.filter((node) => node.owns === term.id).map((node) => ({
      id: node.id,
      label: node.label,
      path: node.path,
      target: node.target,
      status: node.status,
    })),
  };
}

export function vocabulary(input: { word?: string }) {
  const word = input.word?.trim();
  if (!word) return { found: true, terms: VOCABULARY.map(presentTerm) };
  const hit = lookupTerm(word);
  if (!hit) {
    return {
      found: false,
      word,
      advice: `"${word}" is not in the vocabulary. Do not coin it in UI copy, a nav label or a URL — ask the operator what it is called, then add it to VOCABULARY in src/lib/nav/route-tree.ts.`,
      known: VOCABULARY.map((t) => t.label),
    };
  }
  return {
    found: true,
    word,
    via: hit.via,
    ...(hit.via === 'banned'
      ? { correction: `"${word}" is banned — paint "${hit.term.label}" (${hit.term.id}).` }
      : {}),
    term: presentTerm(hit.term),
  };
}

interface TreeNode {
  id: string;
  label: string;
  kind: RouteNode['kind'];
  status: RouteNode['status'];
  path: string | null;
  target: string;
  page: string | null;
  children: TreeNode[];
}

function nest(node: RouteNode): TreeNode {
  return {
    id: node.id,
    label: node.label,
    kind: node.kind,
    status: node.status,
    path: node.path,
    target: node.target,
    page: node.page,
    children: routeChildren(node.id).map(nest),
  };
}

export function tree(input: { lane?: string }) {
  const lanes = routeChildren(null);
  const lane = input.lane?.trim().toLowerCase();
  if (!lane) return { found: true, lanes: lanes.map(nest) };
  const root = lanes.find((node) => node.id === lane || node.label.toLowerCase() === lane);
  if (!root) {
    return {
      found: false,
      lane,
      lanes: lanes.map((node) => node.id),
      advice: 'Unknown lane. Only these lanes are in the route tree; ask the operator before adding another.',
    };
  }
  return { found: true, lanes: [nest(root)] };
}

/** ≤25-line plain-text session summary. */
export function digest(): string {
  const lines: string[] = ['ROUTE TREE (src/lib/nav/route-tree.ts) — the one source for Warehouse URLs and domain words.'];
  for (const lane of routeChildren(null)) {
    lines.push(`Lane ${lane.label} → ${lane.target} (${lane.status})`);
    for (const node of ROUTE_TREE) {
      if (node.kind !== 'collection' || routeAncestry(node.id)[0]?.id !== lane.id) continue;
      lines.push(`  ${node.label}: ${node.path ?? '(not built)'} → ${node.target}`);
    }
  }
  lines.push('Live routes: write WAREHOUSE_PATHS / locationPath / locationLabelsHref / containerPath …, never a literal.');
  lines.push('Terms (paint the label; never the banned word):');
  for (const term of VOCABULARY) {
    lines.push(`  ${term.label}: not ${term.banned.map((b) => `"${b}"`).join(', ')}`);
  }
  lines.push('Unsure of a name or URL → ds_route / ds_vocabulary / ds_route_tree; no answer → ask the operator. Never invent a path or synonym.');
  return lines.slice(0, 25).join('\n');
}
