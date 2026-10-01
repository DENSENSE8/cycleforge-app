# Handoff prompt — RecordCard family ports: inbound, inventory, sales, products (page by page)

Paste everything below the line into a fresh long-running session.

---

You are porting CycleForge's remaining triage pages onto the shared `RecordCard` /
`TriageCardList` foundation, **one page at a time**. Families in scope: **inbound (receiving)**,
**inventory**, **sales (walk-in)** and **products**. Worktree
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Read `AGENTS.md` first. Dev origin is
`http://localhost:3050` ONLY (lane unit `cycleforge-lane@prod`).

Shared dirty tree (other sessions live): never commit without asking; re-read a file right before
editing it; never revert what you did not write; report red that belongs to other files, don't fix it.

## The principle (owner-validated 2026-09-27)

**One anatomy, a different card per page.** Every page gets its own card *content* — its own
facts, its own top-right status, its own chips, sections and verbs, chosen for that page's job — but
every card wears the *same anatomy in the same places*, so muscle memory carries from page to page:

| Fixed spot (every family) | What changes per page |
|---|---|
| Rail (far left) · checkbox · status icon beneath | the state and its tone / hatch |
| Line 1 top-left: identity (number + ↗ / copy menu) | PO #, unit serial, bin code, sale #, SKU |
| Line 1: channel (dot + name) · person · chips · note | source, vendor, customer; "Urgent", batch chips |
| Line 1 top-right: the page's most important status | SLA, dock state, stock level, count variance |
| Lead line: photo · title · facts in the page's column order · Details at the far right | which facts, in which order |
| "+N items" row → unfolded lines as aligned columns | lines of a PO, units of a SKU, items of a sale |
| Quick look (Space / Details) | the page's full facts |
| Selection bar above the list: same verbs, same order, 1 or N checked | the page's action registry |

What this rules out: a hand-built table or card component per page. A page is a **family adapter**
(data → `RecordCardModel`) plus a few lines of mounting. If a page seems to need a new *place* on the
card, it is missing a fact kind, a status kind, or a slot — add it to the foundation for every family,
never as a page branch (Law 1).

## Read first (in this order)
1. `docs/design-system/BRIEF.md` §12–§13 — especially the last §13 rulings: no Pick / QC / Pack chips
   on the card face; multi-line = lead line + "+N items" unfolding as columns; Details only at the end
   of the lead facts row; selection verbs live only in the selection bar.
2. `docs/design-system/HANDOFF-record-card-foundation.md` — the five layers and Laws 1–7.
3. `docs/design-system/RECORD-CARD-MIGRATION.md` — the ledger: Wave 0 mount table (row numbers used
   below), confirmed keep-sheet list, wave order, O1 progress, dev red.
4. The foundation (read the code, not just the docs):
   - `src/design-system/components/record-card/RecordCard.tsx` — the anatomy; `record-card-types.ts`
     (`RecordCardModel`, lines, deadline status, chips, alert); `record-fact.tsx` (fact faces:
     `qty`, `grade`, `stock`, `code`, `place`, `money`; `RecordFactColumn` with disclosure tier).
   - `src/design-system/components/triage-card-list/` — `TriageSelectBar.tsx`, `TriageListBody.tsx`
     (`TriageSectionHeader`, `TriageAllClear`), `triage-list-state.ts` (URL status + page, page mode,
     kept scroll, held-new, `[` `]` keys).
   - The reference family: `src/components/outbound/orders/cards/OrderCard.tsx` (adapter) and
     `OrderCardList.tsx` (mount).
   - `src/design-system/components/Collapse.tsx` — the only height animation (lint-enforced).

## Order of work

Outbound comes first by owner ruling (ledger "Wave order": O1 root lock, then Exceptions → PO paired →
Pick list → Shipped). **ASK** the owner at the start whether this session waits for O2–O5 or runs
these families in parallel. Then go family by family, page by page, in this order:

### Inbound (receiving)
1. `/receiving` incoming deliveries — `IncomingDeliveryCardList` (ledger #13), the **second hand-built
   card list**. Absorb it into the foundation first; it drives most of the contract extensions below.
2. `/receiving`, `/receiving/history`, `/unbox` lines — `ReceivingLinesTable` → `useReceivingSpreadsheet` (#11), plus
   the testing view (#12).
3. `/unbox?unboxview=all`, `/test|/tech?testTab=all` — `TechAllTriageTable` (#14).
4. `/pickup` — `PickupWorkspace` (#15).

### Inventory
1. `/inventory/units`, `/inventory?states=…` (by-filter), SKU page recent units — `units` (#17).
   Stress family: **stock and location are the top-right status, no price.**
2. `/inventory/locations?tab=bins` — `BinsTable` (#18).
3. `/inventory/health/sku/[sku]` bins — `sku-bins` (#19).
4. Admin queues: `/inventory/holds` (#31), `/inventory/bulk-allocate` (#32), `/inventory/cycle-counts`
   (#33) and `[id]` lines (#34), `/inventory/returns` (#35), `/inventory/health` drift alerts (#27).
Keep-sheet (do NOT port): event logs, SKU ledger, allocations, TSN links, sku-drift, `/inventory/stock`,
replenish need (ledger rows #20–#26, #28–#30, #36, #37).

### Sales
1. `/dashboard?mode=sales|pickup` — `SalesHistoryTable` (`walk-in-sales`, #41). Record = a completed
   Square sale; opens the linked repair or pickup.

### Products
**ASK before any code.** Wave 0 found no live products table: `/products` renders
`ProductsWorkspace` (manual library + labels workbench); the `catalog` table binding
(`CATALOG_TABLE_BINDING`, `useCatalogTableLayout`) has zero consumers. Porting products means
*building* a catalog triage page — ask the owner what record it lists, what its status is, and
where it mounts. Also confirm SKU identity rules first (`ds_sku_identity`; the Zoho item is the source
of truth — `resolveSkuIdentityTitle`, `SKU_CATALOG_JOIN_ON_SQL`).

## The per-page loop (every page, no exceptions)

1. **Capture before.** Screenshot the page at 1500 / 1100 / 760 px. If the page is already on cards,
   also `node scripts/dom-equivalence.mjs capture <page>-before <route> <cardTestId>`.
2. **Write the page's pattern card** in `RECORD-CARD-MIGRATION.md` (a short table), filling every
   fixed spot for this page: identity · channel / person · chips · note · top-right status (and its
   tones) · lead-line facts in order with disclosure tiers · what "+N items" lines are · alert (what a
   danger line means) · quick-look facts · sections (and their tones) · verbs (id, key, scope
   single / bulk / both, `unavailable` reason) · noun (one / many) · test-id prefix · status-chip keys
   · record URL params · storage keys. **Owner signs the pattern card off before code.** This is
   where the page gets its own best display; the anatomy stays fixed.
3. **Extend the foundation if the pattern card needs it** (for every family, never a page branch):
   a new fact kind in `record-fact.tsx`, a new status kind, a new slot. Re-prove the orders page is
   unchanged afterwards with `scripts/dom-equivalence.mjs` (capture before the extension, compare after).
4. **Write the adapter** (`<family>-card.tsx` next to the family's code): row → `RecordCardModel`,
   `RecordFactColumn[]`, and the family slots (identity, trailing, quick look). Pure mapping; hooks
   only where the data needs them (as `useOrderChannel` does).
5. **Mount** `TriageSelectBar` + `TriageListBody` + the `triage-list-state` hooks, with the family's
   noun, test-id prefix, status keys, record params and storage keys. Records open in
   `DeskRecordPlane` like orders. Declare `cardStatus` / `page` in the route's param hygiene.
6. **Delete the old mount and every helper only it used** (clean cutover — no shims, no dead exports).
   Update `registered-bindings.ts` if the binding is now dead.
7. **Verify**: `npx tsc --noEmit -p tsconfig.json` (filter touched), `npx eslint <touched> --quiet`,
   `pnpm verify:fast`; screenshots at 3 widths at `:3050`; J / K, Space, Enter, checkbox and shift
   range, `[` `]`, held-new pill, kept scroll across reload; a saved view loads; the `/m/*` twin
   still works (ledger "Mobile twin" column); any Collapse you touched ends at its settled height.
8. **Ledger row** (what landed, proof, open items) → **owner signs off the page** → next page.

## Contract extensions you will need (known from the O1 map)

For incoming deliveries (inbound page 1), the foundation lacks:
1. **Status as a union**: `deadline` (orders SLA) | `state` (dot + label top-right, e.g. dock state).
2. **Optional status icon** (incoming has none today), and state icons beyond `LIFECYCLE_GLYPH`
   (`package-open`, `inbox`, …).
3. **Alert line** under line 1 (exception "why → next").
4. **Per-line open**: a line opens its own sub-record (`line:<id>`) with the open line highlighted.
5. **Next-action spot** in the lead facts row.
6. **Notice** and **footer** slots in the list body.
7. **Selection port**: accept an external `Set` + toggle, not only the scope-based selection store.
8. **Cursor publication port**: the family publishes its own record cursor.
Expected visual changes on incoming (owner sign-off): `GridRowCheckbox` → the card checkbox; "+N
items" moves from the facts row to its own row; unfolded lines become columns without the lead; the
title loses its "N items ·" prefix; stagger 0.02 → 0.028 s.

Inventory will need at least a stock-level status (top-right) and no price column; add fact / status
kinds rather than special cases.

## Not done yet (do not assume it exists)

- ~~Action registry + Law 5 selection bar~~ — **landed 2026-09-27** (ledger "O1 progress", key map
  there). A family builds `RecordActionVerb[]` with `scope` on every lead-only verb, runs it through
  `scopeRecordVerbs(verbs, checkedCount, noun)` and paints it in the bar's `bulk` slot, which
  `TriageSelectBar` shows at 1 **and** N checked. `RecordCard` has no `menu` slot. Mount
  `useTriageCardKeys` so X checks, Space folds the quick look and Enter opens the focused card (else the card under the pointer; X falls back to the open record), and keep verb letters off `x`, `f`,
  `j`, `k`, `[`, `]`.
- DataTable column layouts do not drive cards; adapters own the fact list.
  Keep it that way unless the owner schedules a separate card-layout contract.

## Laws (enforce in review)
1. Pages pass ids and data, never JSX branches; `RecordCard` never branches on family.
2. One painter per display type (`record-fact.tsx`); new kinds go into the shared set.
3. Fixed positions (table above). No stage chips on the card face.
4. Disclosure by the card's own width (`CARD_DISCLOSE` tiers), never per-page breakpoints.
5. Height animates only through `Collapse` / `CollapseItem` (ESLint "Animate height only through
   <Collapse>").
6. Floor stays industrial; `/m/*` surfaces are not changed unless a wave explicitly ports them (**ASK**).
7. Keep-sheet pages stay on `DataTable` — the list is in the ledger.

## ASK points (only these)
1. Start of session: wait for outbound O2–O5, or run in parallel.
2. Every page's pattern card, before code.
3. Products: what the catalog triage page lists, its status and route.
4. Any foundation extension that changes the orders page's pixels.
5. Any change to a `/m/*` surface.
