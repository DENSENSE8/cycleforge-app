/**
 * ONE TABLE ENGINE — the invariants that stop the fork coming back.
 *
 * Operator 2026-09-04, after the same fork appeared for the fourth time (a
 * per-page grid, a per-page action list, a per-page verb): *"I need all of this
 * enforced and ported over to all the different systems so it will never fork
 * again."*
 *
 * The display half of this was already won — thirty per-desk tables collapsed
 * onto one compound model (`one-table-sot-teardown-HANDOFF.md`), and
 * `slot-table-cohort` guards it. What had no law was everything AROUND the
 * grid: which rows it reads, which verbs it offers, and who is allowed to say
 * so. Those are the seams a new page still forks through, so they are stated
 * here as text an agent must read and as ids a tripwire can check.
 *
 * ## The four invariants
 *
 * They are deliberately short enough to quote in a code review.
 *
 * 1. **ENGINE_IS_MONOMORPHIC** — one implementation, generic over the row.
 *    Heterogeneity is resolved at the adapter boundary (`row → CompoundRowView`)
 *    and never enters the engine. The view model is strings and enums by
 *    contract: the moment a family can pass a node, the fork walks back in
 *    wearing a view model.
 *
 * 2. **REGISTER_ENTITY_NOT_PAGE** — a table is registered to an ENTITY and
 *    mounted by pages. One entity, one registration, many mounts. A registry
 *    keyed by page is the same fork with extra ceremony: `orders-page`,
 *    `shipped-page`, `exceptions-page`, three registrations of one dataset,
 *    drifting. Scope, lane lock and layout are parameters of the MOUNT.
 *    (`/shipping/exceptions` proves the shape: `tableId: 'orders'`, a different
 *    row source, and every column an operator curated on To-ship for free.)
 *
 * 3. **DESCRIPTOR_CARRIES_DATA_NOT_BEHAVIOR** — a registration may add data
 *    (fields, widths, capabilities, tier) and never behavior. No render props,
 *    no per-family cell, no override hook, no capability flag meaning "and also
 *    do this one thing". If a mount needs behavior the engine lacks, the ENGINE
 *    gains it for everyone or the mount does without. `compoundColumnsFor`
 *    already refuses a width/label override for exactly this reason — "the door
 *    through which a layout difference walks back in". This extends that rule
 *    from geometry to the whole descriptor.
 *
 * 4. **VERBS_BIND_TO_FIELDS** — an action is declared once in its family's verb
 *    catalog, naming the FIELD it writes and a precondition over row state. It
 *    is offered wherever the mounted layout resolves that field; its DIRECTION
 *    (do / undo / already-done) comes from the row, never from the route. A
 *    hardcoded per-lane key list is a fork of the catalog, and a verb declared
 *    at a page mount is a fork of the verb.
 *
 *    Corollaries worth stating, because each kills a class of fork on its own:
 *    - **Bulk is a cardinality, not a mode.** The row `⋮` menu is the same
 *      catalog at n=1. There is no separate bulk vocabulary.
 *    - **A mixed selection resolves, it does not hide.** The verb offers the
 *      direction that applies to the majority and names the remainder in the
 *      disabled reason ("4 of 7 already scanned out").
 *    - **A reversible verb is ONE verb with two directions.** "Mark scanned
 *      out" and "Undo scan-out" are not two verbs on two pages.
 *
 * ## What this module is
 *
 * Law as DATA, so three consumers read one text: the pinned design contract
 * (`ds_contract`), the cohort ledger, and `table-engine-law.test.ts`, which
 * mechanically checks the parts a grep can prove. It imports nothing — it is a
 * leaf on purpose, so the tripwire and the runner can both load it.
 *
 * Adding an invariant here means adding its check there. An invariant with no
 * check is a comment, and this repo has been burned by comments that described
 * behaviour nothing enforced (the Shortage desk documented itself as "locked to
 * BLOCKED rows" for weeks while painting every unshipped order).
 */

export const TABLE_ENGINE_LAW = {
  engineIsMonomorphic:
    'One table engine, generic over the row. Polymorphism lives in the ADAPTER (row → CompoundRowView, strings and enums only); everything downstream is one implementation. A family contributes an adapter and a column array — never a cell, never a row component, never a host.',
  registerEntityNotPage:
    'Tables are registered to ENTITIES and mounted by pages. One entity → one registration → many mounts; scope, lane lock and layout are parameters of the mount. A registration keyed by page is a fork.',
  descriptorCarriesDataNotBehavior:
    'A registration may add DATA (fields, widths, capabilities, tier) and never BEHAVIOR. No render props, no per-family cell, no override hook. If a mount needs behavior the engine lacks, the engine gains it for everyone or the mount does without.',
  verbsBindToFields:
    'A verb is declared once in the family verb catalog, names the FIELD it writes, and is offered wherever the mounted layout resolves that field. Direction (do / undo / already-done) comes from row STATE, never from the route. Bulk is a cardinality, not a mode: the row menu is the same catalog at n=1.',
} as const;

export type TableEngineLawId = keyof typeof TABLE_ENGINE_LAW;

/**
 * Modules allowed to DECLARE verbs (`SelectionAction` literals).
 *
 * A FAMILY's verb catalog — one per entity family, mounted by every surface
 * that shows that family. The list is short and is meant to stay short: a new
 * entry is a claim that a second place may mint verbs, which is the fork this
 * law exists to refuse. Adding one is a human decision that shows up in a diff,
 * which is the whole point of enumerating them.
 */
export const VERB_CATALOG_MODULES = [
  /** Orders / outbound — the 15-verb catalog every order lane binds from. */
  'src/hooks/useDashboardBulkSelection.tsx',
  /** Receiving lines. */
  'src/hooks/useReceivingLineBulkSelection.tsx',
  /** Repair queue. */
  'src/hooks/useRepairRailSelection.tsx',
  /** Media library — photo verbs bound by PhotoLibraryPage. */
  'src/hooks/useMediaLibrarySelection.tsx',
] as const;

/**
 * Sites that declare verbs and SHOULD NOT — today's debt, ratcheting down.
 *
 * This list is the fork, named. Each entry mints its own verbs outside a family
 * catalog, so the same job gets a second implementation the moment a second
 * surface needs it. They are recorded rather than deleted because deleting them
 * is a migration with real behaviour to preserve, and a law that fails the
 * build on day one gets suppressed instead of obeyed.
 *
 * The tripwire's contract: the declaring set may never GROW. An id leaves this
 * list when its verbs move into a catalog; nothing is ever added to it. A new
 * page that declares a verb fails the cohort immediately, which is the case
 * this whole module exists to prevent.
 */
export const VERB_DECLARATION_DEBT: readonly { file: string; why: string }[] = [];

/**
 * `AdminTable` is gone. Settings desks and the admin SKU ops dump left it;
 * `/admin/inventory/sku/[sku]` redirects to `/inventory?sku=`. The tripwire
 * greps for the import — there is no allowlist. DataTable is the engine.
 */

/**
 * Raw `<table>` product row lists — the same second-engine class AdminTable
 * was, without the wrapper.
 *
 * Staff inventory units (`ByUnitView`) paints allocations as hand HTML.
 * Incoming returns staging reprints `CsvImportStagingHost` as a hand HTML
 * grid. The tripwire's contract: this set may never GROW. An id leaves when
 * the surface mounts a PRODUCT_TABLES family (or the orders-import staging
 * host) instead.
 */
export const HAND_HTML_TABLE_DEBT: readonly { file: string; why: string }[] = [
  {
    file: 'src/components/inventory/ByUnitView.tsx',
    why: 'Staff unit detail paints allocations and TSN links as hand HTML tables. Needs an allocations family, not a second grid.',
  },
  {
    file: 'src/components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost.tsx',
    why: 'Incoming returns CSV staging is a hand HTML grid. To-ship already mounts CsvImportStagingHost → DataTable / orders-import. Reuse that host (or register an incoming-import family); do not grow a third staging engine.',
  },
];

/**
 * `<table>` that is not a product-family desk: print HTML, markdown, maps,
 * KPI, mail, QA.
 */
export const HAND_HTML_TABLE_ALLOW: readonly string[] = [
  'src/components/ai/MarkdownRenderer.tsx',
  'src/components/warehouse/WarehouseMap.tsx',
  'src/components/po-gmail/mailbox/ScannedMode.tsx',
  'src/features/operations/workspace/PackingKpiSection.tsx',
  'src/app/developer/QaConsoleClient.tsx',
  'src/app/api/walk-in/receipt/[id]/route.tsx',
  'src/lib/counter/visit-receipt-html.ts',
  'src/lib/serial/serial-journey.ts',
  'src/lib/sheet/sheet-print.ts',
  // The session view plane's artifact renderer: a READ-ONLY data display the
  // agent fills via render_artifact (data-only schema pinned by
  // session-surface-cohort; no verbs, no sort, no selection). It is a VIEW of
  // tool output, not a desk over a family — the desks themselves stay on the
  // one engine.
  'src/components/session/artifacts/renderers.tsx',
];


/**
 * The reversible verb that PROVES the fourth invariant, and the two properties
 * that make it one verb instead of two.
 *
 * `scan-out` is declared once in the orders catalog. `writesField` puts it on
 * every surface whose rows can resolve `orders.scanned_out` — To-ship AND
 * Shipped — and `direction` reads each ROW: still here → record the dock scan,
 * already gone → remove it. No lane list, no `queueMode` branch, no second
 * "Undo scan-out" verb on a second page.
 *
 * ## The reading of "wherever the mounted layout resolves that field"
 *
 * Settled 2026-09-05, because the two obvious readings disagree here. The gate
 * is whether the mount can RESOLVE the fact for its rows, not whether it paints
 * a COLUMN for it. To-ship deliberately refuses to paint a `Scanned out` column
 * (`omitShippedOnlyBindings` — a dock stamp is not a working-queue column), and
 * the operator requires the VERB on both desks. Painting is a layout decision;
 * being able to act on a fact the row already carries is not. A mount whose
 * rows cannot answer the field still never offers the verb, which is the gate
 * doing its job (a receiving-line mount grows no dock scan-out).
 */
export const REVERSIBLE_VERB_PROOF = {
  verb: 'scan-out',
  module: 'src/hooks/useDashboardBulkSelection.tsx',
  writesField: 'orders.scanned_out',
  directionFrom: 'src/lib/selection/order-verb-state.ts',
  surfaces: ['To-ship', 'Shipped'],
  tripwire: 'src/lib/selection/order-verb-binding.test.ts',
} as const;

/**
 * Per-lane action key lists — the fork this law killed on 2026-09-05.
 *
 * `orderBulkActionKeys(orderView)` returned a different array of verb keys for
 * pre-pack and post-pack lanes, and `useDashboardBulkSelection` gated every
 * verb on `laneActionKeys.has(key)`. The lifecycle distinction was real; the
 * ROUTE was the wrong place to read it. It now lives in
 * `@/lib/selection/order-verb-state` as predicates over the row.
 *
 * These names must not come back — in any spelling. The tripwire greps for
 * them across `src/`, so a new lane list fails the cohort the day it lands.
 */
export const FORBIDDEN_LANE_KEY_LISTS = [
  'orderBulkActionKeys',
  'PENDING_BULK_ACTION_KEYS',
  'OrderBulkActionKey',
] as const;

/**
 * The engine seams a new backend table must NOT re-implement.
 *
 * Registering a table supplies five things — row source, field catalog, row
 * adapter, writer map, permissions — and nothing else. Everything named here is
 * already built and shared; a family that re-implements one has forked.
 */
/**
 * Mounts that strip chrome tracks off `compoundColumnsFor` before materializing.
 * Same class of fork as the Orders-only Amount drop: the family pretends it is
 * a different table. Shrink-only — un-filter a desk onto the shared skeleton,
 * then delete the row. A new `key !== 'dates'` (or select/thumb/item/state/
 * fulfillment) filter on a compoundColumnsFor mount fails the tripwire the day
 * it lands.
 *
 * Named 2026-09-05 from the session-law scan. Do not grow this list to paint
 * fewer columns; hide a track with layout/data, not a per-family geometry cut.
 */
export const COMPOUND_SKELETON_FILTER_DEBT: readonly { file: string; drops: string; why: string }[] = [
  {
    file: 'src/components/settings/ai-usage/ai-usage-grid-layout.ts',
    drops: 'dates, select, thumb',
    why: 'Admin usage desk cut Dates / select / Image off the shared skeleton.',
  },
  {
    file: 'src/components/settings/kiosk-devices/kiosk-devices-grid-layout.ts',
    drops: 'dates, select, thumb',
    why: 'Kiosk devices copied the admin usage filter.',
  },
  {
    file: 'src/components/settings/sessions/auth-sessions-grid-layout.ts',
    drops: 'dates, select, thumb',
    why: 'Auth sessions copied the admin usage filter.',
  },
  {
    file: 'src/components/settings/staff-table/staff-directory-grid-layout.ts',
    drops: 'dates, select',
    why: 'Staff directory drops Dates and the select gutter.',
  },
  {
    file: 'src/components/admin/sourcing/compatibility/compatibility-grid-layout.ts',
    drops: 'dates, select, thumb',
    why: 'Compatibility copied the admin usage filter.',
  },
  {
    file: 'src/components/settings/audit/audit-log-grid-layout.ts',
    drops: 'dates, select, thumb',
    why: 'Audit log drops Dates / select / Image; comment claims thumb would be grey.',
  },
  {
    file: 'src/components/inventory/events-grid/inventory-events-grid-layout.ts',
    drops: 'dates, select',
    why: 'Inventory events drops Dates and select after the sheet→compound port.',
  },
];

export const ENGINE_OWNED_SEAMS = [
  'geometry (compound-columns.ts)',
  'materialization (materialize-tracks.ts)',
  'layout cascade (resolve-effective-layout.ts: savedView ?? staff ?? org ?? product)',
  'header sort (slot-table-header-sort.ts)',
  'line identity (slot-table-line-qty.ts + slot-table-line-money.ts)',
  'session laws (slot-table-session-laws.ts)',
  'selection + the action plane (selection-actions.tsx)',
  'record plane (TableSurfaceBinding.recordPlane)',
  'cells (compound/CompoundCells.tsx)',
] as const;

/**
 * The falsifiable claim, kept as text so it can be quoted in a plan and read
 * back by an agent.
 *
 * It is the acceptance test for the whole architecture: if a PR that adds a
 * table has to touch a component, the ENGINE is missing a capability, and that
 * — not the table — is the bug.
 */
export const TABLE_ENGINE_ACCEPTANCE =
  'Registering a new backend table adds zero new .tsx files and zero lines to any existing component: a catalog + a resolver + an adapter + a registry entry. A verb reaches every surface that binds its field, with no per-lane list.' as const;
