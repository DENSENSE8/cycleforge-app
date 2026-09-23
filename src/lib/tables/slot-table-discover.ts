/**
 * Slot-table discover — delete vs keep inventory for local agents.
 *
 * The cohort tripwire (`slot-table-cohort.test.ts`) only proves hooks exist.
 * This module walks the tree and names **exactly** what to delete, what to
 * keep, and what needs a human. Eval writes the matrices into the cohort
 * LEDGER. Agents pick **one** `verdict: 'delete'` row per session.
 *
 * Shrink-only ratchet: every current finding id lives in
 * {@link SLOT_TABLE_KNOWN_DEBT}. A **new** id fails the tripwire (don't ship
 * a new dual SoT). A **gone** id also fails until you remove it from the
 * list (debt only shrinks).
 *
 * Kill-list authority: `docs/kill-list/07-slot-table-hand-models.md`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TABLE_COLUMNS } from '@/lib/tables/table-columns';
import { SLOT_LAYOUT_TABLES } from '@/lib/tables/org-table-layouts';
import {
  SLOT_TABLE_ENGINE,
  SLOT_TABLE_ENGINE_LAYOUT_HOOKS,
  slotTableEnginePeerIds,
  slotTablePeerIds,
} from '@/lib/tables/slot-table-cohort';

export const SLOT_TABLE_DISCOVER_TRIPWIRE =
  'src/lib/tables/slot-table-discover.test.ts' as const;

export type SlotTableDiscoverVerdict = 'delete' | 'keep' | 'judgment';

export type SlotTableScannerId =
  | 'hand-grid-export'
  | 'flat-mount'
  | 'grid-default'
  | 'table-columns-nonempty'
  | 'peer-not-on-engine'
  | 'layout-registry-gap'
  | 'catalog-orphan'
  | 'out-of-waist-hand-model'
  | 'table-columns-zombie';

export type SlotTableFinding = {
  id: string;
  scanner: SlotTableScannerId;
  verdict: 'delete' | 'judgment';
  /** 1 = live dual SoT (do first). 2 = leftover registry. 9 = human only. */
  priority: 1 | 2 | 9;
  tableId: string | null;
  symbol: string;
  path: string;
  refs: string[];
  why: string;
  keep: string;
  next: string;
  blockedBy: string[];
};

export type SlotTableKeepItem = {
  id: string;
  path: string;
  why: string;
};

export type SlotTableDiscoverReport = {
  keep: SlotTableKeepItem[];
  delete: SlotTableFinding[];
  judgment: SlotTableFinding[];
  unexpected: SlotTableFinding[];
  staleKnownDebt: string[];
};

const GRID_SYMBOL_TABLE_ID: Record<string, string> = {
  RECEIVING_GRID_COLUMNS: 'receiving',
  INCOMING_GRID_COLUMNS: 'incoming',
  DAILY_GRID_COLUMNS: 'daily',
  TASKS_GRID_COLUMNS: 'tasks',
  CATALOG_LINK_GRID_COLUMNS: 'catalog-link',
  IMPORT_EXCEPTION_GRID_COLUMNS: 'import-exception',
};

/**
 * `TABLE_COLUMNS` keys that must **stay as keys** (zod `TableId` enum) even
 * when the bucket is `[]`. Do not delete the key.
 */
const TABLE_COLUMNS_PLACEHOLDER_KEYS = new Set([
  'shipped',
  'tech',
  'testing',
  'packer',
  'fba',
]);

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', '.next']);

/**
 * Known live debt. Shrink-only: remove an id in the same change that deletes
 * the smell. Never append without an operator ruling (new dual-SoT is a fail,
 * not a baseline bump).
 *
 * Callers: slot-table-discover.test + eval:discover. Affected API:
 * SLOT_TABLE_KNOWN_DEBT. Schema: none. User: "Make that contract green…
 * Allowed: … KEEP rows." Ratchet 2026-09-11: every mechanical hand-GRID array
 * and row/descriptor GRID default is DELETED — receiving, incoming, tasks and
 * import-exception went with the Wave B port, and Wave C registered `tech` +
 * `packer` so `STATION_HISTORY_COLUMNS` (the last third engine) went too. What
 * remains needs an operator ruling, not a codemod.
 */
export const SLOT_TABLE_KNOWN_DEBT: readonly string[] = [
  'catalog-orphan:fba:FBA_FIELD_CATALOG',
  'table-columns-zombie:support-tickets',
];

function walkTs(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, acc);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

function rel(root: string, abs: string): string {
  return relative(root, abs).replaceAll('\\', '/');
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function tableIdForGridSymbol(symbol: string): string {
  if (GRID_SYMBOL_TABLE_ID[symbol]) return GRID_SYMBOL_TABLE_ID[symbol];
  return symbol
    .replace(/_GRID_COLUMNS$/, '')
    .toLowerCase()
    .replaceAll('_', '-');
}

function materializationKeepFor(tableId: string): string {
  const map: Record<string, string> = {
    receiving: 'RECEIVING_COMPOUND_COLUMNS (receivingCompoundColumnsFor)',
    incoming: 'INCOMING_COMPOUND_COLUMNS (incomingCompoundColumnsFor)',
    daily: 'DAILY_COMPOUND_COLUMNS (dailyCompoundColumnsFor)',
    tasks: 'TASKS_COMPOUND_COLUMNS (tasksCompoundColumnsFor)',
    'catalog-link': 'CATALOG_LINK_COMPOUND_COLUMNS (catalogLinkCompoundColumnsFor)',
    'import-exception':
      'IMPORT_EXCEPTION_COMPOUND_COLUMNS (importExceptionCompoundColumnsFor)',
    orders: 'ORDERS_COMPOUND_COLUMNS (ordersCompoundColumnsFor)',
  };
  return map[tableId] ?? `materializeTracks / *CompoundColumnsFor / *SheetColumnsFor for ${tableId}`;
}

function refsForSymbol(files: { rel: string; src: string }[], symbol: string, origin: string): string[] {
  const re = new RegExp(`\\b${symbol}\\b`);
  const out: string[] = [];
  for (const f of files) {
    if (f.rel === origin) continue;
    if (f.rel.endsWith('.test.ts') || f.rel.endsWith('.test.tsx')) {
      if (re.test(f.src)) out.push(f.rel);
      continue;
    }
    if (re.test(f.src)) out.push(f.rel);
  }
  return out.sort();
}

function scanHandGridExports(
  files: { rel: string; src: string }[],
  peers: Set<string>,
): SlotTableFinding[] {
  const exportRe = /export const ([A-Z0-9_]+_GRID_COLUMNS)\s*(?::[^=\n]+)?=\s*\[/g;
  const findings: SlotTableFinding[] = [];
  for (const f of files) {
    if (f.rel.includes('.test.')) continue;
    exportRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = exportRe.exec(f.src))) {
      const symbol = m[1];
      const tableId = tableIdForGridSymbol(symbol);
      if (!peers.has(tableId)) continue;
      const id = `hand-grid-export:${tableId}:${symbol}`;
      findings.push({
        id,
        scanner: 'hand-grid-export',
        verdict: 'delete',
        priority: 1,
        tableId,
        symbol,
        path: f.rel,
        refs: refsForSymbol(files, symbol, f.rel),
        why: `Hand ${symbol} is a frozen field-key layout on an engine peer. Dual SoT next to the compound/sheet materialization.`,
        keep: materializationKeepFor(tableId),
        next: `After any live flat mount is ported or given its own tableId, delete ${symbol} and retarget sort/default/descriptor callers at the materialization.`,
        blockedBy: [],
      });
    }
  }
  return findings;
}

/**
 * A desk that passes a hand `*_GRID_COLUMNS` array as its `columns` prop.
 *
 * Every family's flat spreadsheet array is deleted, so today this can only fire
 * on a NEW one — which is the regression it exists to catch. It used to name
 * `TestingHistoryList` and `RECEIVING_GRID_COLUMNS` literally; that pinned one
 * desk and one symbol, and went inert the moment both were gone.
 */
function scanFlatMounts(files: { rel: string; src: string }[]): SlotTableFinding[] {
  const findings: SlotTableFinding[] = [];
  for (const f of files) {
    if (f.rel.includes('.test.')) continue;
    const stripped = stripComments(f.src);
    const mountRe = /columns=\{([A-Z][A-Z0-9_]*_GRID_COLUMNS)\}/g;
    let m: RegExpExecArray | null;
    while ((m = mountRe.exec(stripped))) {
      const symbol = m[1];
      const tableId = GRID_SYMBOL_TABLE_ID[symbol] ?? '—';
      findings.push({
        id: `flat-mount:${tableId}:${f.rel.split('/').pop()?.replace(/\.tsx?$/, '')}`,
        scanner: 'flat-mount',
        verdict: 'judgment',
        priority: 9,
        tableId,
        symbol,
        path: f.rel,
        refs: ['src/lib/tables/table-engine-law.ts'],
        why: `This desk mounts the hand flat ${symbol} instead of the family's compound/sheet materialization. Every family's flat array was deleted in the Wave B port — a new one is a second column model on one engine.`,
        keep: 'The family materialization (*_COMPOUND_COLUMNS / *_SHEET_COLUMNS) and its field catalog.',
        next: `Mount the family materialization and delete ${symbol}. A desk that needs different tracks owes a tableId + SlotLayout, not a second array.`,
        blockedBy: [],
      });
    }
  }
  return findings;
}

function scanGridDefaults(
  files: { rel: string; src: string }[],
  peers: Set<string>,
): SlotTableFinding[] {
  const findings: SlotTableFinding[] = [];
    const re = /columns(?:\s*:\s*[^,=]+)?\s*=\s*([A-Z0-9_]+_GRID_COLUMNS)/g;
  for (const f of files) {
    if (f.rel.includes('.test.')) continue;
    if (!/GridRow\.tsx$/.test(f.rel) && !/grid-descriptor\.ts$/.test(f.rel)) continue;
    const stripped = stripComments(f.src);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped))) {
      const symbol = m[1];
      const tableId = tableIdForGridSymbol(symbol);
      if (!peers.has(tableId)) continue;
      const component = f.rel.split('/').pop()?.replace(/\.(tsx|ts)$/, '') ?? f.rel;
      findings.push({
        id: `grid-default:${tableId}:${component}`,
        scanner: 'grid-default',
        verdict: 'delete',
        priority: 1,
        tableId,
        symbol,
        path: f.rel,
        refs: [],
        why: `Row/descriptor defaults to the hand ${symbol} when the caller omits columns — silence re-SoTs the flat model.`,
        keep: materializationKeepFor(tableId),
        next: `Default columns to the family materialization (or require columns at the call site). Do not keep a GRID fallback.`,
        blockedBy: [],
      });
    }
  }
  return findings;
}

function scanTableColumnsNonempty(peers: Set<string>): SlotTableFinding[] {
  const findings: SlotTableFinding[] = [];
  for (const id of peers) {
    const cols = TABLE_COLUMNS[id as keyof typeof TABLE_COLUMNS];
    if (!cols || cols.length === 0) continue;
    findings.push({
      id: `table-columns-nonempty:${id}`,
      scanner: 'table-columns-nonempty',
      verdict: 'delete',
      priority: 2,
      tableId: id,
      symbol: `TABLE_COLUMNS['${id}']`,
      path: 'src/lib/tables/table-columns.ts',
      refs: [],
      why: `Hide-by-field-id still populated for a slot peer. Slots replace "hide Tester" with unbind-from-slot. The KEY must stay (\`[]\`) — it feeds the TableId enum.`,
      keep: `TABLE_COLUMNS['${id}'] as an empty array (do not delete the key)`,
      next: `Set TABLE_COLUMNS['${id}'] = [] after the flat model is gone. Never delete the key.`,
      blockedBy: [],
    });
  }
  return findings;
}

function scanPeerNotOnEngine(peers: string[], engine: Set<string>): SlotTableFinding[] {
  return peers
    .filter((id) => !engine.has(id))
    .map((id) => ({
      id: `peer-not-on-engine:${id}`,
      scanner: 'peer-not-on-engine' as const,
      verdict: 'delete' as const,
      priority: 1 as const,
      tableId: id,
      symbol: id,
      path: 'src/lib/tables/slot-table-cohort.ts',
      refs: [],
      why: `${id} is in PRODUCT_TABLES but has no useSlotTableLayout hook in SLOT_TABLE_ENGINE_LAYOUT_HOOKS.`,
      keep: 'PRODUCT_TABLES row + REGISTERED_BINDINGS entry',
      next: `Add a use*TableLayout config wrapping useSlotTableLayout and append SLOT_TABLE_ENGINE_LAYOUT_HOOKS.`,
      blockedBy: [],
    }));
}

function scanLayoutRegistryGap(peers: string[]): SlotTableFinding[] {
  const registered = new Set(Object.keys(SLOT_LAYOUT_TABLES));
  return peers
    .filter((id) => !registered.has(id))
    .map((id) => ({
      id: `layout-registry-gap:${id}`,
      scanner: 'layout-registry-gap' as const,
      verdict: 'delete' as const,
      priority: 1 as const,
      tableId: id,
      symbol: id,
      path: 'src/lib/tables/org-table-layouts.ts',
      refs: [],
      why: `${id} is a product table but missing from SLOT_LAYOUT_TABLES — org layouts 404.`,
      keep: 'field catalog file for this tableId',
      next: `Register { catalog, morphs } under SLOT_LAYOUT_TABLES['${id}'].`,
      blockedBy: [],
    }));
}

function scanCatalogOrphans(root: string): SlotTableFinding[] {
  const dir = join(root, 'src/lib/tables/field-catalog');
  const registered = new Set(Object.keys(SLOT_LAYOUT_TABLES));
  const findings: SlotTableFinding[] = [];
  if (!existsSync(dir)) return findings;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.ts') || name.includes('.test.') || name.endsWith('-resolve.ts')) {
      continue;
    }
    if (name === 'types.ts') continue;
    const relPath = `src/lib/tables/field-catalog/${name}`;
    const src = readFileSync(join(root, relPath), 'utf8');
    const idMatch = src.match(/export const \w+_TABLE_LAYOUT_ID = '([^']+)'/);
    const catMatch = src.match(/export const (\w+_FIELD_CATALOG)/);
    if (!idMatch || !catMatch) continue;
    const tableId = idMatch[1];
    if (registered.has(tableId)) continue;
    findings.push({
      id: `catalog-orphan:${tableId}:${catMatch[1]}`,
      scanner: 'catalog-orphan',
      verdict: 'judgment',
      priority: 9,
      tableId,
      symbol: catMatch[1],
      path: relPath,
      refs: [],
      why: `Field catalog exists but is not in SLOT_LAYOUT_TABLES. FBA is the known case: board torn out, catalog kept for rebuild (operator 2026-08-31).`,
      keep: `${catMatch[1]} + resolve module — do not delete. Re-add one SLOT_LAYOUT_TABLES line when the mount returns.`,
      next: 'Human: remount the desk, then register. Do not register an unmounted table (layouts would save into a void).',
      blockedBy: [],
    });
  }
  return findings;
}

/**
 * A hand column array that is NOT a registered family materialization.
 *
 * The named case was the Tech / Packer benches' hand array — their third
 * engine — deleted in Wave C when `tech` and `packer` became registered
 * families. It escaped {@link scanHandGridExports} because its name carried no
 * `GRID`, so this scanner matches the SHAPE instead: a `readonly`-typed
 * `*_COLUMNS` array under a component/lib path that is neither a slot
 * materialization (`*_COMPOUND_COLUMNS` / `*_SHEET_COLUMNS`) nor the registry's
 * own `TABLE_COLUMNS`.
 */
function scanOutOfWaistHandModels(files: { rel: string; src: string }[]): SlotTableFinding[] {
  const findings: SlotTableFinding[] = [];
  const arrayRe = /export const ([A-Z][A-Z0-9_]*_COLUMNS)\s*:\s*readonly/g;
  for (const f of files) {
    if (f.rel.includes('.test.')) continue;
    const stripped = stripComments(f.src);
    let m: RegExpExecArray | null;
    while ((m = arrayRe.exec(stripped))) {
      const symbol = m[1];
      if (/_(COMPOUND|SHEET)_COLUMNS$/.test(symbol)) continue;
      if (symbol === 'TABLE_COLUMNS') continue;
      if (/_GRID_COLUMNS$/.test(symbol)) continue; // scanHandGridExports owns these
      findings.push({
        id: `out-of-waist-hand-model:${f.rel.split('/').pop()?.replace(/\.tsx?$/, '')}:${symbol}`,
        scanner: 'out-of-waist-hand-model',
        verdict: 'judgment',
        priority: 9,
        tableId: null,
        symbol,
        path: f.rel,
        refs: ['src/lib/tables/table-engine-law.ts'],
        why: `${symbol} is a hand column array outside PRODUCT_TABLES / REGISTERED_BINDINGS — a third engine's column model. Kill-list 07 §5; the last one died when the tech and packer benches were registered.`,
        keep: 'The registered family materializations and the DataTable waist. Do not copy a hand array onto a product desk.',
        next: 'Human: register a real binding + catalog for this surface, or delete the host fork. Not a mechanical GRID delete.',
        blockedBy: [],
      });
    }
  }
  return findings;
}

function scanTableColumnZombies(peers: Set<string>): SlotTableFinding[] {
  const findings: SlotTableFinding[] = [];
  for (const [key, cols] of Object.entries(TABLE_COLUMNS)) {
    if (peers.has(key)) continue;
    if (TABLE_COLUMNS_PLACEHOLDER_KEYS.has(key) && cols.length === 0) continue;
    if (cols.length === 0) continue;
    findings.push({
      id: `table-columns-zombie:${key}`,
      scanner: 'table-columns-zombie',
      verdict: 'judgment',
      priority: 9,
      tableId: key,
      symbol: `TABLE_COLUMNS['${key}']`,
      path: 'src/lib/tables/table-columns.ts',
      refs: [],
      why:
        key === 'incoming_embed'
          ? 'Third hide-bucket for Incoming embed (not a product table). Prefs fork vs fold into incoming slots.'
          : `${key} looks like a product queue in TABLE_COLUMNS but is not in PRODUCT_TABLES.`,
      keep:
        key === 'incoming_embed'
          ? 'Distinct prefs identity if embed density must not leak into /incoming — or fold later. Do not invent a second Incoming engine.'
          : `If this is not joining the waist, empty the bucket to [] (keep the key only if TableId still needs it).`,
      next: 'Human: join PRODUCT_TABLES or empty the bucket. Agents do not invent a tableId.',
      blockedBy: [],
    });
  }
  return findings;
}

function keepInventory(root: string): SlotTableKeepItem[] {
  const items: SlotTableKeepItem[] = [
    {
      id: 'engine:CompoundItem',
      path: SLOT_TABLE_ENGINE.compoundCells,
      why: 'One Item cell for every PRODUCT_TABLES peer. Title/listing paint lives here.',
    },
    {
      id: 'engine:CompoundStageStep',
      path: SLOT_TABLE_ENGINE.compoundCells,
      why: 'Parameterized stage paint. Feed from FieldDef — never if (fieldId === …).',
    },
    {
      id: 'engine:useSlotTableLayout',
      path: SLOT_TABLE_ENGINE.useSlotTableLayout,
      why: 'Shared cascade. Family hooks are config, not forks.',
    },
    {
      id: 'engine:materializeTracks',
      path: SLOT_TABLE_ENGINE.materializeTracks,
      why: 'Track keys are slot indices. Replacement for hand GRID arrays.',
    },
    {
      id: 'engine:DataTable',
      path: 'src/components/tables/DataTable.tsx',
      why: 'One display. Kill-list never-kill.',
    },
    {
      id: 'engine:DataTableFilterMenu',
      path: 'src/components/tables/DataTable.tsx',
      why: 'Toolbar funnel always mounts beside SearchField. Idle chrome when a family has no facets. Not FilterRefinementBar.',
    },
    {
      id: 'engine:NonlinearTableHost',
      path: 'src/components/tables/NonlinearTableHost.tsx',
      why: 'Virtualization host. Kill-list never-kill.',
    },
    {
      id: 'engine:LedgerGrid',
      path: 'src/design-system/components/grid/LedgerGrid.tsx',
      why: 'Grid primitive. Kill-list never-kill.',
    },
    {
      id: 'engine:SearchField',
      path: 'src/design-system/primitives/SearchField.tsx',
      why: 'Find field. Kill-list never-kill.',
    },
    {
      id: 'engine:REGISTERED_BINDINGS',
      path: 'src/components/tables/registered-bindings.ts',
      why: 'Offering waist. Layout is not this object.',
    },
    {
      id: 'engine:PRODUCT_TABLES',
      path: 'src/lib/tables/table-catalog.ts',
      why: 'Server-safe catalog. Parity-tested against bindings.',
    },
    {
      id: 'engine:SLOT_LAYOUT_TABLES',
      path: 'src/lib/tables/org-table-layouts.ts',
      why: 'Opt-in registry for org layouts. Grow one entry per family; never delete a mounted one.',
    },
    {
      id: 'engine:TABLE_COLUMNS-keys',
      path: 'src/lib/tables/table-columns.ts',
      why: 'Keys feed TableId. Empty buckets for slot peers; do not delete keys.',
    },
    {
      id: 'engine:getExternalUrlByItemNumber',
      path: SLOT_TABLE_ENGINE.externalItemUrl,
      why: 'Listing URL util. CompoundItem consumes this; desk forks must not paint host paths.',
    },
    {
      id: 'engine:DateRangePickerField',
      path: SLOT_TABLE_ENGINE.dateRangePickerField,
      why: 'STATUS ship-by / inline civil date. variant=compact in the cell (no X, no year, click commits). variant=range is the filter. Do not hand-roll type=date.',
    },
    {
      id: 'engine:CompoundRowDetailBand',
      path: SLOT_TABLE_ENGINE.compoundRowDetailBand,
      why: 'Leaf detail band under the 48px product row (serial / location / view unit). data-compound-row-detail. Never grow CompoundItem. Not FilterRefinementBar.',
    },
    {
      id: 'engine:CompoundState',
      path: SLOT_TABLE_ENGINE.compoundCells,
      why: 'STATUS column. Editable delay mounts DateRangePickerField variant=compact.',
    },
  ];

  for (const hook of SLOT_TABLE_ENGINE_LAYOUT_HOOKS) {
    items.push({
      id: `hook:${hook.tableId}`,
      path: hook.path,
      why: `Engine opt-in for ${hook.tableId}. Keep the hook; it is not a second Item cell.`,
    });
  }

  for (const tableId of Object.keys(SLOT_LAYOUT_TABLES)) {
    items.push({
      id: `catalog:${tableId}`,
      path: `src/lib/tables/field-catalog`,
      why: `Registered field catalog for ${tableId}. Data only.`,
    });
  }

  const files = walkTs(join(root, 'src')).map((abs) => ({
    rel: rel(root, abs),
    src: readFileSync(abs, 'utf8'),
  }));
  const matRe = /export const ([A-Z0-9_]+_(?:COMPOUND|SHEET)_COLUMNS)\s*(?::[^=\n]+)?=\s*(?!\[)/g;
  for (const f of files) {
    if (f.rel.includes('.test.')) continue;
    matRe.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = matRe.exec(f.src))) {
      items.push({
        id: `materialization:${mm[1]}`,
        path: f.rel,
        why: `${mm[1]} is the product-default materialization (not a hand GRID array). Keep; this is what mounts.`,
      });
    }
  }

  return items.filter((item, i, all) => all.findIndex((x) => x.id === item.id) === i);
}

function applyBlockedBy(findings: SlotTableFinding[]): void {
  const byPrefix = new Map<string, string>();
  for (const f of findings) {
    if (f.scanner === 'flat-mount' && f.tableId) {
      byPrefix.set(`hand-grid-export:${f.tableId}`, f.id);
    }
  }
  for (const f of findings) {
    if (f.scanner === 'hand-grid-export' && f.tableId) {
      const blocker = byPrefix.get(`hand-grid-export:${f.tableId}`);
      if (blocker) f.blockedBy = [blocker];
    }
    if (f.scanner === 'table-columns-nonempty' && f.tableId) {
      const hand = findings.find(
        (x) => x.scanner === 'hand-grid-export' && x.tableId === f.tableId,
      );
      const mount = findings.find((x) => x.scanner === 'flat-mount' && x.tableId === f.tableId);
      f.blockedBy = [hand?.id, mount?.id].filter((x): x is string => Boolean(x));
    }
  }
}

export function discoverSlotTable(root = process.cwd()): SlotTableDiscoverReport {
  const srcRoot = join(root, 'src');
  const files = walkTs(srcRoot).map((abs) => ({
    rel: rel(root, abs),
    src: readFileSync(abs, 'utf8'),
  }));
  const peers = slotTablePeerIds();
  const peerSet = new Set(peers);
  const engine = new Set(slotTableEnginePeerIds());

  const all: SlotTableFinding[] = [
    ...scanHandGridExports(files, peerSet),
    ...scanFlatMounts(files),
    ...scanGridDefaults(files, peerSet),
    ...scanTableColumnsNonempty(peerSet),
    ...scanPeerNotOnEngine(peers, engine),
    ...scanLayoutRegistryGap(peers),
    ...scanCatalogOrphans(root),
    ...scanOutOfWaistHandModels(files),
    ...scanTableColumnZombies(peerSet),
  ];
  applyBlockedBy(all);

  const known = new Set(SLOT_TABLE_KNOWN_DEBT);
  const deleteF = all.filter((f) => f.verdict === 'delete').sort((a, b) => a.id.localeCompare(b.id));
  const judgment = all.filter((f) => f.verdict === 'judgment').sort((a, b) => a.id.localeCompare(b.id));
  const unexpected = all.filter((f) => !known.has(f.id)).sort((a, b) => a.id.localeCompare(b.id));
  const foundIds = new Set(all.map((f) => f.id));
  const staleKnownDebt = SLOT_TABLE_KNOWN_DEBT.filter((id) => !foundIds.has(id));

  return {
    keep: keepInventory(root),
    delete: deleteF,
    judgment,
    unexpected,
    staleKnownDebt,
  };
}

export function nextDeleteGap(report: SlotTableDiscoverReport): SlotTableFinding | null {
  const ready = report.delete.filter((f) => f.blockedBy.length === 0);
  const unusedHand = ready.filter((f) => f.scanner === 'hand-grid-export');
  const pool = unusedHand.length > 0 ? unusedHand : ready;
  return [...pool].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))[0] ?? null;
}

export function formatDiscoverMarkdown(report: SlotTableDiscoverReport): {
  keep: string;
  delete: string;
  judgment: string;
  next: string;
} {
  const keep = [
    `| id | path | keep because |`,
    `|---|---|---|`,
    ...report.keep.map((k) => `| \`${k.id}\` | \`${k.path}\` | ${k.why} |`),
  ].join('\n');

  const row = (f: SlotTableFinding) =>
    `| \`${f.id}\` | ${f.priority} | ${f.tableId ?? '—'} | \`${f.path}\` | ${f.why} | **${f.keep}** | ${f.next}${f.blockedBy.length ? ` · blocked by \`${f.blockedBy.join('`, `')}\`` : ''} |`;

  const header =
    `| id | pri | tableId | path | why | KEEP | next |\n|---|---|---|---|---|---|---|`;

  const deleteBlock =
    report.delete.length === 0
      ? '_No mechanical deletes. Dual-SoT hand models are gone._'
      : [header, ...report.delete.map(row)].join('\n');

  const judgmentBlock =
    report.judgment.length === 0
      ? '_None._'
      : [header, ...report.judgment.map(row)].join('\n');

  const nxt = nextDeleteGap(report);
  const next = nxt
    ? `**Next mechanical gap:** \`${nxt.id}\`\n\n- Delete/retarget: \`${nxt.path}\` (\`${nxt.symbol}\`)\n- Keep: ${nxt.keep}\n- Do: ${nxt.next}`
    : '_No unblocked mechanical deletes._';

  return { keep, delete: deleteBlock, judgment: judgmentBlock, next };
}

export function assertKnownDebtRatchet(report: SlotTableDiscoverReport): {
  ok: boolean;
  extra: string[];
  stale: string[];
} {
  return {
    ok: report.unexpected.length === 0 && report.staleKnownDebt.length === 0,
    extra: report.unexpected.map((f) => f.id),
    stale: report.staleKnownDebt,
  };
}
