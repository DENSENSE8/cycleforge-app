/**
 * Prompt router — one derivation from the TypeScript cohorts.
 *
 * `routePrompt` expands an operator sentence into eval commands, graph symbols,
 * engine files, and refuse rules. `routeDirtyPaths` is the same map for the
 * Host machine-gate (replaces TABLE_MARKERS / STATION_WORKSPACES).
 *
 * A tripwire test asserts every graphSymbols / engineFiles / evalCommand
 * string exists in a cohort or in package.json scripts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SHORTCUT_DISPLAY_ENGINE,
  SHORTCUT_DISPLAY_FORBIDDEN,
  SHORTCUT_DISPLAY_PAINT_LAW,
} from '@/lib/keyboard/shortcut-display-cohort';
import {
  SCAN_STATION_OVERLAY_COHORT,
  SCAN_STATION_OVERLAY_COHORT_TRIPWIRE,
  IDLE_OVERLAY_HELPER,
  OVERLAY_SHELL_GRAPH_SYMBOL_FILES,
  overlayCohortWorkspacePaths,
  stationEvalManifest,
} from '@/lib/station/scan-station-overlay-cohort';
import {
  SLOT_TABLE_COHORT_TRIPWIRE,
  SLOT_TABLE_ENGINE,
  SLOT_TABLE_ENGINE_LAYOUT_HOOKS,
  SLOT_TABLE_GRAPH_SYMBOL_FILES,
  SLOT_TABLE_PAINT_LAW,
} from '@/lib/tables/slot-table-cohort';
import { surfaceIndex } from './surface-index';

/** Same split `ds_contract` uses (`tools/design-mcp/server.mjs` `terms`). */
const STOP = new Set([
  'a',
  'an',
  'the',
  'for',
  'of',
  'to',
  'in',
  'on',
  'and',
  'or',
  'with',
  'that',
  'this',
  'is',
  'my',
]);

export function terms(s: string): string[] {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export type RefuseRule = { id: string; why: string; diffPattern?: RegExp };

export type RouteCohort = 'slot-table' | 'shortcuts' | `station:${string}` | 'discover' | 'composer';

export type RouteRule = {
  cohort: RouteCohort;
  keywords: readonly string[];
  evalCommand: string;
  graphSymbols: readonly string[];
  engineFiles: readonly string[];
  mounts: readonly string[];
  refuse: readonly RefuseRule[];
  /** Engine files that document refuse tokens — skip write-gate matching. */
  refuseSkipFiles?: readonly string[];
  tokenAxes?: readonly string[];
  /** Engine file a graphSymbols find must land in (from the cohorts). Unplaced symbols are found, never location-judged. */
  graphExpectedFiles?: Readonly<Record<string, string>>;
};

export type RouteResult = {
  routes: RouteRule[];
  refusals: RefuseRule[];
  unrouted: boolean;
};

export type DirtyEval = {
  kind: 'cohort' | 'station';
  name: string;
  evalCommand: string;
};

type InternalRoute = RouteRule & { minScore?: number };

function pathValues(record: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const v of Object.values(record)) {
    if (typeof v === 'string' && v.includes('/')) out.push(v);
    else if (Array.isArray(v)) {
      for (const x of v) if (typeof x === 'string' && x.includes('/')) out.push(x);
    }
  }
  return out;
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

export function slotTableEngineFiles(): string[] {
  return unique([
    ...pathValues(SLOT_TABLE_ENGINE as unknown as Record<string, unknown>),
    ...SLOT_TABLE_ENGINE_LAYOUT_HOOKS.map((h) => h.path),
    SLOT_TABLE_COHORT_TRIPWIRE,
    'src/lib/tables/slot-table-cohort.ts',
    'src/lib/tables/slot-table-discover.ts',
    'src/lib/eval/prompt-router.ts',
  ]);
}

/** Law files name refuse tokens. Dirty-path still evals them; the write gate must not. */
export function slotTableRefuseSkipFiles(): string[] {
  return unique([
    'src/lib/tables/slot-table-cohort.ts',
    SLOT_TABLE_COHORT_TRIPWIRE,
    'src/lib/tables/slot-table-discover.ts',
    'src/lib/tables/slot-table-discover.test.ts',
    'src/lib/eval/prompt-router.ts',
    'src/lib/eval/prompt-router.test.ts',
  ]);
}

export function shortcutEngineFiles(): string[] {
  return unique([
    ...pathValues(SHORTCUT_DISPLAY_ENGINE as unknown as Record<string, unknown>),
    'src/hooks/useSelectionActionHotkeys.ts',
    'src/lib/keyboard/shortcut-display-cohort.ts',
  ]);
}

export function stationEngineFiles(id: string): string[] {
  const member = SCAN_STATION_OVERLAY_COHORT.find((m) => m.id === id);
  if (!member) return [];
  const manifest = stationEvalManifest(member);
  return unique([
    manifest.workspace,
    ...manifest.critiqueFiles,
    SCAN_STATION_OVERLAY_COHORT_TRIPWIRE,
    IDLE_OVERLAY_HELPER,
  ]);
}

const SLOT_TABLE_REFUSE: RefuseRule[] = [
  {
    id: 'slot-table.sortable-false-on-fact',
    why: SLOT_TABLE_PAINT_LAW.headerSort,
    diffPattern: /sortable:\s*false/,
  },
  {
    id: 'slot-table.new-grid-columns-array',
    why: 'Do not author a second GRID_COLUMNS SoT. Discover names DELETE; KEEP engine materializations.',
    diffPattern: /export const \w+_GRID_COLUMNS/,
  },
  {
    id: 'slot-table.new-grid-row',
    why: 'A *GridRow.tsx with a switch over column keys is a second table. To-ship sheet sync mounts UnshippedTable → useOrdersSpreadsheet → OrdersQueueTableRow. Adapt the row (cagedRecordToQueueRow). File CSV may keep CsvImportStagingGridRow; do not import it from DashboardOrdersView. New *GridRow files fail the slot-table tripwire allowlist.',
    diffPattern: /CsvImportStagingGridRow|export (?:function|const) \w+GridRow/,
  },
  {
    id: 'slot-table.new-sheet-columns',
    why: 'Do not author a parallel *_SHEET_COLUMNS / *_SHEET_BASE column SoT. Bind a catalog field and materializeTracks. To-ship display is ordersCompoundColumnsFor, never a staging sheet model.',
    diffPattern: /export const \w+_SHEET_(?:COLUMNS|BASE)/,
  },
  {
    id: 'slot-table.native-date-input',
    why: SLOT_TABLE_PAINT_LAW.shipBy,
    diffPattern: /type=["']date["']/,
  },
  {
    id: 'slot-table.range-variant-in-cell',
    why: SLOT_TABLE_PAINT_LAW.shipBy,
    diffPattern: /variant=["']range["']/,
  },
  {
    id: 'slot-table.inline-editable-date',
    why: SLOT_TABLE_PAINT_LAW.shipBy,
    diffPattern: /InlineEditableValue/,
  },
  {
    id: 'slot-table.filter-refinement-bar',
    why: SLOT_TABLE_PAINT_LAW.filter,
    diffPattern: /FilterRefinementBar/,
  },
  {
    id: 'slot-table.orders-row-dots-menu',
    why: SLOT_TABLE_PAINT_LAW.ordersActions,
    diffPattern: /Copy order number|rowMenuActions/,
  },
  {
    id: 'slot-table.amount-column',
    why: SLOT_TABLE_PAINT_LAW.lineMoney,
    diffPattern: /'amount',\s*'_fill'/,
  },
];

const COMPOSER_REFUSE: RefuseRule[] = [
  {
    id: 'composer.show-mode-row-false',
    why: 'Dumb stations keep the mode row and set showModeFaces={false}. Never showModeRow={false} to hide Unbox|Ticket.',
    diffPattern: /showModeRow=\{false\}/,
  },
  {
    id: 'composer.notes-composer',
    why: 'Clone Pack/Unbox. Do not invent a *NotesComposer shell or a second mouth.',
    diffPattern: /\w+NotesComposer/,
  },
];

const STANDING_KEYCAPS: RefuseRule = {
  id: 'shortcuts.standing-keycaps',
  why: SHORTCUT_DISPLAY_PAINT_LAW.refuse,
};

function shortcutForbiddenRefusals(): RefuseRule[] {
  return Object.entries(SHORTCUT_DISPLAY_FORBIDDEN).map(([name, re]) => ({
    id: `shortcuts.forbidden.${name}`,
    why: SHORTCUT_DISPLAY_PAINT_LAW.refuse,
    diffPattern: re,
  }));
}

function slotTableRoute(): InternalRoute {
  return {
    cohort: 'slot-table',
    keywords: [
      'sort',
      'column',
      'header',
      'image',
      'thumb',
      'date',
      'cell',
      'ship',
      'compact',
      'filter',
      'sortable',
      'listing',
      'compound',
      'table',
      'dots',
      'ellipsis',
      'amount',
      'price',
    ],
    evalCommand: 'pnpm run eval:cohort slot-table',
    graphSymbols: [
      'isSlotTableChromeTrack',
      'queueSortForColumnKey',
      'LedgerGridColumnHeader',
      'CompoundItem',
      'DateRangePickerField',
      'CompoundState',
      'useOptimisticMutation',
      'ordersCompoundColumnsFor',
      'COMPOUND_COLUMN_KEYS',
    ],
    engineFiles: slotTableEngineFiles(),
    refuseSkipFiles: slotTableRefuseSkipFiles(),
    mounts: [],
    refuse: SLOT_TABLE_REFUSE,
    tokenAxes: ['color', 'radius'],
    graphExpectedFiles: { ...SLOT_TABLE_GRAPH_SYMBOL_FILES },
    minScore: 2,
  };
}

function shortcutsRoute(): InternalRoute {
  return {
    cohort: 'shortcuts',
    keywords: ['shortcut', 'hotkey', 'overlay', 'keycap', 'cheat'],
    evalCommand: 'pnpm run eval:cohort shortcuts',
    graphSymbols: [...SHORTCUT_DISPLAY_ENGINE.graphSymbols],
    engineFiles: shortcutEngineFiles(),
    mounts: ['HotkeyGlyph'],
    refuse: [STANDING_KEYCAPS, ...shortcutForbiddenRefusals()],
    minScore: 1,
  };
}

function composerRoute(): InternalRoute {
  return {
    cohort: 'composer',
    keywords: ['modes', 'dumb', 'gun', 'faces', 'composer', 'mouth'],
    evalCommand: 'pnpm run eval:station scan-out',
    graphSymbols: ['StationComposerHost', 'ComposerModeRow'],
    engineFiles: unique([
      'src/components/composer/StationComposerHost.tsx',
      'src/components/composer/ComposerModeRow.tsx',
      ...stationEngineFiles('scan-out'),
    ]),
    mounts: ['showModeFaces={false}'],
    refuse: COMPOSER_REFUSE,
    minScore: 1,
  };
}

function stationRoute(id: string): InternalRoute | null {
  const member = SCAN_STATION_OVERLAY_COHORT.find((m) => m.id === id);
  if (!member) return null;
  const manifest = stationEvalManifest(member);
  return {
    cohort: `station:${member.id}`,
    keywords: terms(`${member.id} ${member.label} ${member.route}`),
    evalCommand: `pnpm run eval:station ${member.id}`,
    graphSymbols: manifest.graphSymbols,
    engineFiles: stationEngineFiles(member.id),
    mounts: [],
    refuse: COMPOSER_REFUSE,
    graphExpectedFiles: {
      [member.exportName]: member.workspace,
      ...OVERLAY_SHELL_GRAPH_SYMBOL_FILES,
    },
    minScore: 1,
  };
}

function discoverRoute(): InternalRoute {
  return {
    cohort: 'discover',
    keywords: ['discover', 'leftover', 'handmodel'],
    evalCommand: 'pnpm run eval:discover',
    graphSymbols: [],
    engineFiles: ['src/lib/tables/slot-table-discover.ts'],
    mounts: [],
    refuse: [],
    minScore: 1,
  };
}

export function allRouteRules(): RouteRule[] {
  const stations = SCAN_STATION_OVERLAY_COHORT.map((m) => stationRoute(m.id)).filter(
    (r): r is InternalRoute => r != null,
  );
  return [slotTableRoute(), shortcutsRoute(), composerRoute(), discoverRoute(), ...stations].map(publicRoute);
}

function publicRoute(route: InternalRoute): RouteRule {
  const { minScore: _m, ...rest } = route;
  return rest;
}

function score(qTerms: readonly string[], keywords: readonly string[]): number {
  const have = new Set(qTerms);
  let n = 0;
  for (const k of keywords) if (have.has(k)) n += 1;
  return n;
}

function isStandingKeycapsPrompt(qTerms: readonly string[], lower: string): boolean {
  const have = new Set(qTerms);
  if (have.has('keys') && have.has('buttons')) return true;
  if (have.has('standing') || have.has('keycaps') || have.has('keybinds')) return true;
  if (have.has('cheat') && have.has('sheet') && (have.has('buttons') || have.has('staff'))) return true;
  if (lower.includes('standing letters') || lower.includes('leave keycaps')) return true;
  return false;
}

function isDateInCellPrompt(qTerms: readonly string[], lower: string): boolean {
  const have = new Set(qTerms);
  if (have.has('date') && have.has('cell')) return true;
  if (lower.includes('ship by') || lower.includes('ship-by') || lower.includes('shipby')) return true;
  if (have.has('ship') && (have.has('date') || have.has('cell'))) return true;
  if (have.has('compact') && have.has('date')) return true;
  return false;
}

function isSortImagePrompt(qTerms: readonly string[]): boolean {
  const have = new Set(qTerms);
  if (have.has('sort') && (have.has('column') || have.has('header') || have.has('image') || have.has('thumb'))) {
    return true;
  }
  if (have.has('sortable') || (have.has('data') && have.has('header'))) return true;
  return false;
}

/** Google Sheet → To-ship triage. Must hit slot-table refuse, not a new grid. */
function isSheetTriagePrompt(qTerms: readonly string[], lower: string): boolean {
  if (/google\s*sheet/.test(lower)) return true;
  if (lower.includes('sync') && lower.includes('sheet')) return true;
  if (lower.includes('triage board') || lower.includes('staging grid')) return true;
  const have = new Set(qTerms);
  return have.has('sheet') && (have.has('sync') || have.has('triage') || have.has('import'));
}

function withSheetTriageSymbols(route: RouteRule): RouteRule {
  return {
    ...route,
    graphSymbols: unique([
      'UnshippedTable',
      'useOrdersSpreadsheet',
      'OrdersQueueTableRow',
      'DataTable',
      ...route.graphSymbols,
    ]),
  };
}


/** Orders / To-ship ⋮ — copy lives on identity chips. */
function isOrdersDotsPrompt(qTerms: readonly string[], lower: string): boolean {
  const have = new Set(qTerms);
  if (lower.includes('three dots') || lower.includes('three-dot')) return true;
  if (have.has('ellipsis') || have.has('kebab')) return true;
  if (have.has('dots') && (have.has('row') || have.has('menu') || have.has('order') || have.has('ship'))) {
    return true;
  }
  if (have.has('row') && have.has('menu') && (have.has('order') || have.has('ship') || have.has('actions'))) {
    return true;
  }
  return false;
}

function withOrdersDotsSymbols(route: RouteRule): RouteRule {
  return {
    ...route,
    graphSymbols: unique(['ordersCompoundColumnsFor', 'COMPOUND_COLUMN_KEYS', 'OrdersQueueTableRow', ...route.graphSymbols]),
  };
}

function stationHits(lower: string, qTerms: readonly string[]): string[] {
  const hits: string[] = [];
  for (const member of SCAN_STATION_OVERLAY_COHORT) {
    if (lower.includes(member.id) || lower.includes(member.route)) {
      hits.push(member.id);
      continue;
    }
    const labelTerms = terms(member.label);
    if (labelTerms.length && labelTerms.every((t) => qTerms.includes(t))) hits.push(member.id);
  }
  return hits;
}

function withDateMount(route: RouteRule): RouteRule {
  return {
    ...route,
    graphSymbols: unique([...route.graphSymbols, 'DateRangePickerField', 'CompoundState', 'useOptimisticMutation']),
    mounts: unique([...route.mounts, '<DateRangePickerField variant="compact" />']),
  };
}

function withSortSymbols(route: RouteRule): RouteRule {
  return {
    ...route,
    graphSymbols: unique([
      'isSlotTableChromeTrack',
      'queueSortForColumnKey',
      'LedgerGridColumnHeader',
      'CompoundItem',
      ...route.graphSymbols,
    ]),
    mounts: [],
  };
}

export function routePrompt(text: string): RouteResult {
  const qTerms = terms(text);
  const lower = text.toLowerCase();
  const refusals: RefuseRule[] = [];
  const routes: RouteRule[] = [];

  if (isStandingKeycapsPrompt(qTerms, lower)) {
    refusals.push(STANDING_KEYCAPS, ...shortcutForbiddenRefusals());
    return { routes: [], refusals, unrouted: false };
  }

  const slot = slotTableRoute();
  if (
    isDateInCellPrompt(qTerms, lower) ||
    isSortImagePrompt(qTerms) ||
    isSheetTriagePrompt(qTerms, lower) ||
    isOrdersDotsPrompt(qTerms, lower) ||
    score(qTerms, slot.keywords) >= (slot.minScore ?? 2)
  ) {
    let r: RouteRule = publicRoute(slot);
    if (isDateInCellPrompt(qTerms, lower)) r = withDateMount(r);
    else if (isSortImagePrompt(qTerms)) r = withSortSymbols(r);
    else if (isSheetTriagePrompt(qTerms, lower)) r = withSheetTriageSymbols(r);
    else if (isOrdersDotsPrompt(qTerms, lower)) r = withOrdersDotsSymbols(r);
    routes.push(r);
    refusals.push(...r.refuse);
  }

  const shortcuts = shortcutsRoute();
  if (score(qTerms, shortcuts.keywords) >= (shortcuts.minScore ?? 1)) {
    const r = publicRoute(shortcuts);
    routes.push(r);
    refusals.push(...r.refuse);
  }

  const composer = composerRoute();
  if (score(qTerms, composer.keywords) >= (composer.minScore ?? 1)) {
    const r = publicRoute(composer);
    routes.push(r);
    refusals.push(...r.refuse);
  }

  for (const id of stationHits(lower, qTerms)) {
    const r = stationRoute(id);
    if (!r) continue;
    if (routes.some((x) => x.cohort === r.cohort)) continue;
    const pub = publicRoute(r);
    routes.push(pub);
    refusals.push(...pub.refuse);
  }

  const discover = discoverRoute();
  if (score(qTerms, discover.keywords) >= 1) {
    routes.push(publicRoute(discover));
  }

  const seen = new Set<string>();
  const uniqRefusals: RefuseRule[] = [];
  for (const r of refusals) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    uniqRefusals.push(r);
  }

  return {
    routes,
    refusals: uniqRefusals,
    unrouted: routes.length === 0 && uniqRefusals.length === 0,
  };
}

function pathTouches(dirty: readonly string[], engineFile: string): boolean {
  const base = engineFile.split('/').pop() ?? engineFile;
  for (const raw of dirty) {
    const p = raw.replaceAll('\\', '/').replace(/^"|"$/g, '');
    if (p === engineFile) return true;
    if (p.endsWith(`/${base}`)) return true;
  }
  return false;
}

export function routeDirtyPaths(paths: readonly string[]): DirtyEval[] {
  const hits: DirtyEval[] = [];
  const seen = new Set<string>();
  const push = (item: DirtyEval) => {
    const key = `${item.kind}:${item.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(item);
  };

  if (slotTableEngineFiles().some((f) => pathTouches(paths, f))) {
    push({ kind: 'cohort', name: 'slot-table', evalCommand: 'pnpm run eval:cohort slot-table' });
  }
  if (shortcutEngineFiles().some((f) => pathTouches(paths, f))) {
    push({ kind: 'cohort', name: 'shortcuts', evalCommand: 'pnpm run eval:cohort shortcuts' });
  }
  for (const member of SCAN_STATION_OVERLAY_COHORT) {
    if (stationEngineFiles(member.id).some((f) => pathTouches(paths, f))) {
      push({
        kind: 'station',
        name: member.id,
        evalCommand: `pnpm run eval:station ${member.id}`,
      });
    }
  }
  return hits;
}

export function serializeRefuse(rule: RefuseRule): { id: string; why: string; diffPattern?: string } {
  return {
    id: rule.id,
    why: rule.why,
    ...(rule.diffPattern ? { diffPattern: rule.diffPattern.source } : {}),
  };
}

export function serializeRoute(route: RouteRule): Omit<RouteRule, 'refuse'> & {
  refuse: ReturnType<typeof serializeRefuse>[];
} {
  return {
    ...route,
    refuse: route.refuse.map(serializeRefuse),
  };
}

export const ROUTER_DOCUMENT_VERSION = 'cf-router:v1' as const;

export type RouterDocument = {
  v: typeof ROUTER_DOCUMENT_VERSION;
  overlayWorkspaces: string[];
  surfaces: ReturnType<typeof surfaceIndex>;
  routes: ReturnType<typeof serializeRoute>[];
  standingKeycaps: {
    id: string;
    topId: 'TableStatusBar';
    cohort: 'shortcuts';
    evalCommand: string;
    refuse: ReturnType<typeof serializeRefuse>[];
  };
};

/** Deterministic JSON the design-mcp server reads (`tools/design-mcp/router.json`). */
export function emitRouterDocument(): RouterDocument {
  const shortcuts = shortcutsRoute();
  return {
    v: ROUTER_DOCUMENT_VERSION,
    overlayWorkspaces: [...overlayCohortWorkspacePaths()].sort(),
    surfaces: surfaceIndex(),
    routes: allRouteRules()
      .map(serializeRoute)
      .sort((a, b) => a.cohort.localeCompare(b.cohort)),
    standingKeycaps: {
      id: STANDING_KEYCAPS.id,
      topId: 'TableStatusBar',
      cohort: 'shortcuts',
      evalCommand: shortcuts.evalCommand,
      refuse: [STANDING_KEYCAPS, ...shortcutForbiddenRefusals()].map(serializeRefuse),
    },
  };
}

/** Assert helper: every evalCommand's pnpm script exists in package.json. */
export function evalCommandScriptName(evalCommand: string): string | null {
  const m = evalCommand.match(/pnpm run ([^\s]+)/);
  return m?.[1] ?? null;
}

export function readPackageScripts(repoRoot = process.cwd()): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? {};
}
