/**
 * Guard — retired design-system symbols must not return in shipped code
 * (DS fork-consolidation program — Phase 1, slices 1a + 1d / D4 + D12).
 *
 * ## Why a source-text scan and not a dependency-cruiser ban
 *
 * D12 sanctions either "a matching `dependency-cruiser` ban OR a guard
 * `doesNotMatch(/Symbol/)`". For SYMBOL-level retirement, the guard is strictly
 * more capable: dependency-cruiser reasons over the import GRAPH, so it can only
 * flag a re-created MODULE PATH — but a retired symbol (`parkRail`,
 * `salesCartStore`) reappears as an in-file declaration inside a module that
 * still exists, which the graph never sees. A comment-aware identifier scan
 * catches BOTH a re-created module and a re-added symbol, runs inside the verify
 * `src/**` sweep with zero wiring, and needs no install. (A dependency-cruiser
 * module-path tripwire + a `jscpd` clone baseline remain separate Phase-1 items:
 * they need a shared-config edit / a network install — see the program PLAN §2
 * 1a/1b.)
 *
 * ## The contract
 *
 * Each entry is VERIFIED (0 live *code* references today — the only residuals are
 * doc comments that explain the retirement, which this guard strips before
 * scanning) and cites the rule that retires it. This is the D12 prose↔code parity
 * for the retirement claims: a "deleted/retired X" rule with a real enforcement.
 *
 * Shrink-only: `maxLiveRefs` may only DECREASE. A symbol that still has residual
 * live refs is a ratchet toward 0 — never a baseline raised to make a re-fork
 * pass. Add a verified retirement to `RETIRED`; never remove the enforcement.
 *
 * Deliberately NOT in `RETIRED`: `ContextualSelectionBar` (the LIVE multi-select
 * SoT, 13 consumers — `display/workbench.md`), `MobileSelectionBar` (no evidence
 * it ever existed). The program PLAN listed both under 1a; both are stale.
 *
 * Run: node --import tsx --test src/design-system/foundations/retired-symbols.guard.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

interface RetiredSymbol {
  /** The identifier that must not reappear in shipped code. */
  symbol: string;
  /** When it was retired (civil date, or `—` if predating the log). */
  since: string;
  /** The rule that retires it + what to compose instead — the D12 prose link. */
  retiredBy: string;
  /** Shrink-only ceiling of live code refs. 0 = fully retired. Never raise. */
  maxLiveRefs?: number;
}

const RETIRED: RetiredSymbol[] = [
  {
    symbol: 'ToolbarSearchToggle',
    since: '2026-08-03',
    retiredBy:
      'source-of-truth.md → Workbench chrome scoped search — deleted; compose TechRailSearchBar (always-open field).',
  },
  {
    symbol: 'UnboxProcedureRail',
    since: '2026-08-02',
    retiredBy:
      'source-of-truth.md → Right-rail modality — the ambient always-on right-edge procedure region was retired within a day; the checklist is a Displays leaf.',
  },
  {
    symbol: 'parkRail',
    since: '2026-08-05',
    retiredBy:
      'source-of-truth.md → Right-rail modality / Frame column budget — the park-rail rung is retired; do not reintroduce parkRail.',
  },
  {
    symbol: 'salesCartStore',
    since: '2026-08-02',
    retiredBy:
      'counter cart is CounterDraft.retailLines; salesCartStore.ts was deleted 2026-08-02 and must not return (counter-transaction-types.ts).',
  },
  {
    symbol: 'StationWorkbenchShell',
    since: '—',
    retiredBy:
      'display/station-workbench.md → Hard Never — used max-w-3xl; compose StationWorkbench + STATION_WORKBENCH_* instead.',
  },
  {
    symbol: 'RecordPaneHeader',
    since: '—',
    retiredBy:
      'source-of-truth.md / right-rail-inspector.md — the desk order inspector is DeskRailChromeRow + index→leaf, not the retired RecordPaneHeader identity ladder.',
  },
  {
    symbol: 'GridFieldsMenu',
    since: '2026-08-02',
    retiredBy:
      'source-of-truth.md → Grid column visibility — deleted; the one door is GridColumnGutter → GridColumnDetailsPanel.',
  },
  {
    symbol: 'OrderWarrantySection',
    since: '2026-08-12',
    retiredBy:
      'AGENTS.md → Order warranty card — compose OrderWarrantySummary (density="pane" for the exclusive order tab).',
  },
  // ── Slot-table Wave-1 hand-model kill (docs/kill-list/07-slot-table-hand-models.md) ──
  {
    symbol: 'ORDERS_QUEUE_COLUMNS',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §1 — the Orders flat fact-track array; mount ordersCompoundColumnsFor(SlotLayout). The bench copy (STATION_HISTORY_COLUMNS) died with it on 2026-09-11.',
  },
  // ── Slot-table Wave-C station kill: tech + packer are registered families ──
  {
    symbol: 'STATION_HISTORY_COLUMNS',
    since: '2026-09-11',
    retiredBy:
      'Wave C — the bench flat array, whose track keys WERE field names (tester / testedAt / packStation). Mount techCompoundColumnsFor / packerCompoundColumnsFor from the registered tech · packer families instead.',
  },
  {
    symbol: 'StationQueueRow',
    since: '2026-09-11',
    retiredBy:
      'Wave C — a per-family ROW component (ENGINE_IS_MONOMORPHIC forbids one). The benches contribute benchRowCompoundView (row → CompoundRowView) and mount the shared compound row through useCompoundSpreadsheet.',
  },
  {
    symbol: 'ORDERS_QUEUE_TESTED_COLUMNS',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §2 — the tested-mode alias; ?ustatus=TESTED narrows rows, "show pick" is the orders.picked slot binding.',
  },
  {
    symbol: 'ordersTableBindingFor',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §2 — the two-binding mode switch; there is ONE Orders binding (ORDERS_DEFAULT_TABLE_BINDING).',
  },
  {
    symbol: 'makeOrdersGridDescriptorTested',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §2 — the second descriptor factory; makeOrdersGridDescriptor derives everything from the mounted columns.',
  },
  {
    symbol: 'useToShipStatusFilter',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §2 — existed only to swap the tested column mode; ?ustatus reads/writes go through dashboard-search-state / useOutboundSidebarScope.',
  },
  // ── Slot-table Wave-2 pickup kill (docs/kill-list/07-slot-table-hand-models.md §4) ──
  {
    symbol: 'PICKUP_GRID_COLUMNS',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §4 — the pickup flat fact-track array; mount pickupSheetColumnsFor(SlotLayout) over PICKUP_FIELD_CATALOG.',
  },
  {
    symbol: 'isPickupGridSortable',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §4 — static-list sortability; isPickupColumnSortable derives from the mounted model.',
  },
  {
    symbol: 'isPickupGridFrozen',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §4 — static-list lock check; the descriptor derives locks from the mounted columns’ frozen flags.',
  },
  {
    symbol: 'pickupGridFrozenLeft',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §4 — offsets from a static list; use gridFrozenLeft(columns, key) over the mounted model.',
  },
  {
    symbol: 'defaultDirForPickupGridSort',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 §4 — per-flat-key sort dirs; defaultDirForPickupColumn derives from the bound field’s display type.',
  },
  // ── Slot-table FBA fork kill (kill-list 07, Wave-3 `fba` row, executed early) ──
  {
    symbol: 'FBA_BOARD_GRID_COLUMNS',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 Wave-3 fba row — the board’s hand fact-track array. The display that replaced it was torn out the same day (hanging Amazon Prep); do not resurrect a forever-track list.',
  },
  {
    symbol: 'isFbaBoardGridSortable',
    since: '2026-08-30',
    retiredBy:
      'kill-list 07 Wave-3 fba row — static-list sortability. Do not reintroduce a per-key sortability table beside the catalog.',
  },
  {
    symbol: 'fbaSheetColumnsFor',
    since: '2026-08-30',
    retiredBy:
      'Amazon Prep board display torn out 2026-08-30 — the slot materializer lived only to feed FbaBoardTable. Rebuild the display; do not resurrect this helper as a second column SoT.',
  },
  {
    symbol: 'FBA_SHEET_COLUMNS',
    since: '2026-08-30',
    retiredBy:
      'Amazon Prep board display torn out 2026-08-30 — product-default materialization of the torn-out table.',
  },
  {
    symbol: 'FBA_BOARD_TABLE_BINDING',
    since: '2026-08-30',
    retiredBy:
      'Amazon Prep board display torn out 2026-08-30 — re-register a binding only with the rebuilt display.',
  },
  {
    symbol: 'useFbaTableLayout',
    since: '2026-08-30',
    retiredBy:
      'Amazon Prep board display torn out 2026-08-30 — the slot-layout hook was the hanging table’s config. Recreate it with the rebuilt mount.',
  },
  {
    symbol: 'FbaShipmentTracePanel',
    since: '2026-08-30',
    retiredBy:
      'Amazon Prep shipped-table orphan — only consumer was FbaShippedTable, deleted with the display teardown.',
  },
  // ── Seller-table-program wave 1.1 — Ready slot port (docs/todo/seller-table-program-PLAN.md §03) ──
  {
    symbol: 'READY_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.1 — the Ready flat fact-track array, and the last live `{ key: \'tested\' }` track in src/. Mount readySheetColumnsFor(SlotLayout) over READY_FIELD_CATALOG.',
  },
  {
    symbol: 'isReadyGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.1 — static-list sortability. Sortability derives from the MOUNTED model: isReadyColumnSortable(columns, key).',
  },
  {
    symbol: 'isReadyGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.1 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForReadyGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.1 — per-key default direction. Direction rides the bound field\'s displayType: defaultDirForReadyColumn(columns, key).',
  },
  // ── Seller-table-program wave 1.4 — sheet ports (docs/todo/seller-table-program-PLAN.md §03) ──
  {
    symbol: 'UNITS_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the units flat fact-track array. Mount unitsSheetColumnsFor(SlotLayout) over UNITS_FIELD_CATALOG.',
  },
  {
    symbol: 'isUnitsGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isUnitsColumnSortable(columns, key).',
  },
  {
    symbol: 'isUnitsGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForUnitsGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. Direction rides the bound field\'s displayType: defaultDirForUnitsColumn(columns, key).',
  },
  {
    symbol: 'BINS_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the bins flat fact-track array. Mount binsSheetColumnsFor(SlotLayout) over BINS_FIELD_CATALOG.',
  },
  {
    symbol: 'isBinsGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isBinsColumnSortable(columns, key).',
  },
  {
    symbol: 'isBinsGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForBinsGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. Direction rides the bound field\'s displayType: defaultDirForBinsColumn(columns, key).',
  },

  {
    symbol: 'WARRANTY_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the warranty flat fact-track array. Mount warrantySheetColumnsFor(SlotLayout) over WARRANTY_FIELD_CATALOG.',
  },
  {
    symbol: 'isWarrantyGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isWarrantyColumnSortable(columns, key).',
  },
  {
    symbol: 'isWarrantyGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForWarrantyGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. Direction rides the bound field\'s displayType: defaultDirForWarrantyColumn(columns, key).',
  },

  {
    symbol: 'CATALOG_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the products-catalog flat fact-track array. Mount catalogSheetColumnsFor(SlotLayout) over CATALOG_FIELD_CATALOG.',
  },
  {
    symbol: 'isCatalogGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isCatalogColumnSortable(columns, key).',
  },
  {
    symbol: 'isCatalogGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForCatalogGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. Direction rides the bound field\'s displayType: defaultDirForCatalogColumn(columns, key).',
  },

  {
    symbol: 'TECH_ALL_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the Tech-All flat fact-track array. Mount techAllSheetColumnsFor(SlotLayout) over TECH_ALL_FIELD_CATALOG.',
  },
  {
    symbol: 'isTechAllGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isTechAllColumnSortable(columns, key).',
  },
  {
    symbol: 'isTechAllGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForTechAllGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. The urgency RANK exception now rides the fact in defaultDirForTechAllColumn(columns, key).',
  },

  {
    symbol: 'UNFOUND_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the unfound flat fact-track array. Mount unfoundSheetColumnsFor(SlotLayout) over UNFOUND_FIELD_CATALOG.',
  },
  {
    symbol: 'isUnfoundGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isUnfoundColumnSortable(columns, key).',
  },
  {
    symbol: 'isUnfoundGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForUnfoundGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. The queue\'s ascending-everything rule now lives in defaultDirForUnfoundColumn.',
  },

  {
    symbol: 'REPAIR_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the repair flat fact-track array. Mount repairSheetColumnsFor(SlotLayout) over REPAIR_FIELD_CATALOG.',
  },
  {
    symbol: 'isRepairGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isRepairColumnSortable(columns, key).',
  },
  {
    symbol: 'isRepairGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },

  {
    symbol: 'MY_DAY_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the Today flat fact-track array. Mount myDaySheetColumnsFor(SlotLayout) over MY_DAY_FIELD_CATALOG.',
  },
  {
    symbol: 'isMyDayGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isMyDayColumnSortable(columns, key).',
  },
  {
    symbol: 'isMyDayGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForMyDayGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. Direction rides the bound field\'s displayType: defaultDirForMyDayColumn(columns, key).',
  },

  {
    symbol: 'TRACKING_EXCEPTIONS_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the exceptions flat fact-track array. Mount trackingExceptionsSheetColumnsFor(SlotLayout) over TRACKING_EXCEPTIONS_FIELD_CATALOG.',
  },
  {
    symbol: 'isTrackingExceptionsGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isTrackingExceptionsColumnSortable(columns, key).',
  },
  {
    symbol: 'isTrackingExceptionsGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. The descriptor reads the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForTrackingExceptionsGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. Direction rides the bound field\'s displayType: defaultDirForTrackingExceptionsColumn(columns, key).',
  },

  {
    symbol: 'CSV_IMPORT_STAGING_GRID_COLUMNS',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — the staging flat fact-track array. Mount csvImportStagingSheetColumnsFor(SlotLayout) over ORDERS_IMPORT_FIELD_CATALOG.',
  },
  {
    symbol: 'isCsvImportStagingGridSortable',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static-list sortability. Sortability derives from the MOUNTED model: isCsvImportStagingColumnSortable(columns, key).',
  },
  {
    symbol: 'isCsvImportStagingGridFrozen',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — static frozen-key list. Cells read the mounted column\'s own `frozen` flag.',
  },
  {
    symbol: 'defaultDirForCsvImportStagingGridSort',
    since: '2026-08-31',
    retiredBy:
      'seller-table-program wave 1.4 — per-key default direction. Direction rides the bound field\'s displayType: defaultDirForCsvImportStagingColumn(columns, key).',
  },

  {
    symbol: 'PLATFORM_BRAND_ICON_PATHS',
    since: '2026-09-01',
    retiredBy:
      'Platform identity is BrandIdentityDot / platformMetaBrandDot. Do not restore SVG path data.',
  },
  {
    symbol: 'PLATFORM_BRAND_ICON_VIEWBOX',
    since: '2026-09-01',
    retiredBy:
      'Platform identity is BrandIdentityDot / platformMetaBrandDot. Do not restore SVG path data.',
  },
  {
    symbol: 'CarrierMark',
    since: '2026-09-01',
    retiredBy:
      'Tracking identity is BrandIdentityDot ring / carrierBrandDotPaint. Do not restore a MapPin carrier glyph.',
  },
];

/** Recursively collect shipped `.ts`/`.tsx` under src (skip tests + node_modules). */
function walkSrcFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walkSrcFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Strip block + line comments so a retired symbol NAMED in a doc comment (which
 * documents the retirement — a good thing) does not count as a live reference.
 * The `[^:'"\`\\]` guard keeps `://` in URLs/strings from being read as a line
 * comment. A re-introduced symbol is always CODE (import / JSX / call), never a
 * bare comment, so comment-stripping cannot hide a real re-fork.
 */
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// Walk + scan ONCE; test all symbols per file.
const scanned = RETIRED.map((e) => ({ ...e, re: new RegExp(`\\b${e.symbol}\\b`), hits: [] as string[] }));
const GUARD_REL = relative(ROOT, join(SRC, 'design-system/foundations/retired-symbols.test.ts'));
for (const file of walkSrcFiles(SRC)) {
  const rel = relative(ROOT, file);
  if (rel === GUARD_REL) continue; // the registry naturally names each symbol
  const code = stripComments(readFileSync(file, 'utf8'));
  for (const s of scanned) if (s.re.test(code)) s.hits.push(rel);
}

describe('retired design-system symbols stay retired (1a + 1d)', () => {
  for (const s of scanned) {
    const max = s.maxLiveRefs ?? 0;
    it(`${s.symbol} — 0 live code refs (retired: ${s.since})`, () => {
      assert.ok(
        s.hits.length <= max,
        `${s.symbol} reappeared in ${s.hits.length} shipped file(s) (max ${max}): ${s.hits.join(', ')}.\n` +
          `It is retired — ${s.retiredBy}\n` +
          `Compose the existing module, do not re-fork it.`,
      );
    });
  }

  it('primitives/FilterMenu.tsx stays deleted — compose ui/FilterMenu', () => {
    assert.equal(
      existsSync(join(SRC, 'design-system/primitives/FilterMenu.tsx')),
      false,
      'src/design-system/primitives/FilterMenu.tsx returned. That fork had zero importers; the SoT is src/components/ui/FilterMenu.tsx.',
    );
  });

  it('platform-brand-icons.ts stays deleted — identity is BrandIdentityDot', () => {
    assert.equal(
      existsSync(join(SRC, 'lib/platform-brand-icons.ts')),
      false,
      'src/lib/platform-brand-icons.ts returned. Platform identity is BrandIdentityDot / platformMetaBrandDot, not SVG path data.',
    );
  });

  it('CarrierMark.tsx stays deleted — tracking identity is BrandIdentityDot', () => {
    assert.equal(
      existsSync(join(SRC, 'components/ui/CarrierMark.tsx')),
      false,
      'src/components/ui/CarrierMark.tsx returned. Tracking identity is the carrier ring BrandIdentityDot, not MapPin.',
    );
  });

  it('Incoming Band-3 FilterMenu wrappers stay deleted — compose DataTable filter', () => {
    assert.equal(
      existsSync(join(SRC, 'components/sidebar/receiving/incoming/IncomingKindFilters.tsx')),
      false,
      'IncomingKindFilters.tsx returned. Kind/source facets live in Incoming DataTable filter (To-ship gold).',
    );
    assert.equal(
      existsSync(join(SRC, 'components/sidebar/receiving/incoming/IncomingSourceFilters.tsx')),
      false,
      'IncomingSourceFilters.tsx returned. Kind/source facets live in Incoming DataTable filter (To-ship gold).',
    );
  });

  it('registry is honest — no duplicates, every entry cites a retiring rule', () => {
    const seen = new Set<string>();
    for (const e of RETIRED) {
      assert.ok(!seen.has(e.symbol), `duplicate registry entry: ${e.symbol}`);
      seen.add(e.symbol);
      assert.ok(e.retiredBy.length > 10, `${e.symbol} needs a retiredBy citation (the D12 prose link)`);
    }
  });
});
