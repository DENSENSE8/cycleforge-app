# Inventory › Stock — ACTION STRIP hardening handoff

**Status:** not started. The strip ships four working verbs
(`stock-desk-action-bar-HANDOFF.md`, SHIPPED 2026-09-15): Adjust count, Move to
location, Replace SKU / Pair to real SKU, Delete. Every one of them writes an
endpoint the phone and the scan gun already call, and every figure was verified
against Postgres.

This handoff is the next layer: what turns a strip that **writes correctly**
into one that is **safe to hand a temp on a Monday**, ordered so the first four
items can land in one sitting.

**Read first:** `docs/todo/stock-desk-action-bar-HANDOFF.md` (what exists, and
why each verb writes what it writes). Do not rebuild anything in its §0 table.

---

## 0. The four files you will be in

| file | what it owns |
|---|---|
| `src/lib/inventory/stock-bin-verb-writes.ts` | request builders, one per verb + `commitStockWrites` / `commitStockRequest`. **Pure.** |
| `src/lib/inventory/stock-bin-writes.ts` | the bin-write precondition (`planStockBinWrites`) + refusal sentences. **Pure, tested.** |
| `src/lib/inventory/stock-sku-replacement.ts` | pair-vs-swap direction + target refusals. **Pure, tested.** |
| `src/components/inventory/location-stock-grid/useStockVerbStrip.ts` | strip state, the two commit shapes (`commit` fans out per bin, `commitOnce` for the SKU-wide pair) |

Faces: `StockVerbRow.tsx`, `StockAdjustRow.tsx`, `StockMoveRow.tsx`,
`StockReplaceRow.tsx`, `stock-verb-row-parts.tsx`. The strip itself
(`StockActionBar.tsx`) is portal + key bindings + which row shows — keep it
that way; it is already at the 255-line mark `ds_critique` starts complaining
about.

---

## P0 — ship today. Two pure files and one hook.

### P0.1 Undo in the toast (the single highest-ROI change)

Every bin verb here has an EXACT inverse, which is what makes this cheap and
what makes the confirm-dialog pressure go away permanently. A ten-second Undo
beside the success toast is the industry answer (Gmail, Linear, Airtable) and it
is strictly better than a modal: the operator has already seen the result.

| verb committed | the inverse request |
|---|---|
| adjust `put qty` | `take qty`, same sku/bin, reason `BIN_PULL` |
| adjust `take qty` | `put qty`, reason `BIN_ADD` |
| move (`/api/transfers` A→B, qty) | the same POST with `fromBinBarcode` / `toBinBarcode` swapped |
| swap (`/swap` old→new, qty) | the same POST with `oldSku` / `newSku` swapped |
| delete (`take` whole row) | `put` the same qty back, reason `BIN_ADD` |
| **pair** (provisional merge) | **NO INVERSE — refuse to offer Undo.** The placeholder row is deleted and its ledger history is re-keyed; "undoing" it would mint a new `TMP-` key and re-key history a second time. Say so in the toast copy, not in a comment. |

Shape it as a pure function so it is testable without a DOM:

```ts
// stock-bin-verb-writes.ts
export function stockUndoRequest(landed: StockCommittedWrite): StockBinRequest | null
```

Rules that are not optional:
- **Fresh `Idempotency-Key` per undo.** Reusing the forward key would replay the
  forward response and write nothing while claiming success.
- **Undo is a real write, not a rollback.** It lands its own ledger row. That is
  correct and must be visible in the toast copy ("Undone — a reversing entry is
  in the ledger"), because the alternative (silent compensation) is what makes
  cycle counts disagree later.
- **One undo per commit, expiring.** Drop the affordance after ~10s or when the
  next verb commits. A stale Undo that fires after two more moves is a
  data-entry bug with a friendly label.
- **Partial batches:** undo only the rows that landed (`ok`), never the whole
  selection.

Acceptance: adjust +3 → Undo → `bin_contents` back to the start and TWO ledger
rows (`+3 BIN_ADD`, `−3 BIN_PULL`). Move → Undo → both bins restored,
`TRANSFER_OUT`/`TRANSFER_IN` ×2. Pair → **no Undo offered.**

### P0.2 Gate the verbs on permission, before the press

Today a readonly or floor-only operator presses and reads a 403 from the route.
Every other refusal on this strip is a sentence in the place the verb would
have been; this one should be too.

| verb | server gate |
|---|---|
| adjust put/take | `bin.adjust` |
| move (`/api/transfers`) | `bin.adjust` (via `withAuth`) |
| swap | `bin.swap` (asserted on **body** `staffId` — keep passing it) |
| pair (merge) | `sku_stock.manage` — deliberately NOT `bin.adjust`: merging rewrites stock history onto a sellable product |
| delete (take whole row) | `bin.adjust` |

Wire `useAuth().has(...)` into the planners' `blocked` / `replaceBlocked`
fields, not into the buttons — the planners are already where refusals live and
are already tested. Copy: name the permission the operator lacks, not "not
allowed".

Acceptance: a staffer without `bin.swap` sees `Replace SKU` disabled with the
reason, and `Adjust count` still live.

### P0.3 Bounded concurrency + progress in `commitStockWrites`

`Promise.allSettled(targets.map(...))` fires one request per ticked row, all at
once. Forty rows is forty transactions and forty pool connections; the strip
has no idea how far it got.

- Chunk to 5–8 in flight (a constant with a name, not a literal).
- Report progress back so the commit button can read `12 / 40`.
- Keep the first real failure as the message (existing behaviour).

Still pure, still unit-testable with a fake `request` fn — do not reach for a
component test.

### P0.4 Name the rows that failed, and re-select exactly those

`{ ok, failed, reason }` loses WHICH rows failed, so the operator's retry is
"tick them again from memory". Return the failed `rowId[]`
({@link StockBinWriteTarget.rowId} is already the selection key), and have the
strip narrow the selection to them. The retry is then one press.

Acceptance: with one bin deliberately short (`INSUFFICIENT_QTY` on a move), the
strip keeps exactly the short row ticked, prints the route's own message
("Source bin only has 2; cannot move 5."), and the rows that landed are gone
from the selection.

---

## P1 — the increment that makes it engine-standard

### P1.1 Move the four verbs into a family verb catalog

They are declared inside the strip today, which is precisely the shape
`VERB_CATALOG_MODULES` (`src/lib/tables/table-engine-law.ts`) names as debt —
the tripwire allows it only because the strip declares no `SelectionAction`
literals. Catalogued once for the `location-stock` family, the same four verbs
bind to:

- the right-rail selection plane at 3+ rows (`publishRailActions`, as orders do),
- the row `⋮` / hover menu at n=1 (see P1.2),
- a future `/m` screen,

with **no second declaration**. This is the difference between four good verbs
on one desk and a catalog every surface reads. Do NOT add an entry to
`VERB_DECLARATION_DEBT`; that list only ever shrinks.

### P1.2 Row menu = the same catalog at n=1

`useCompoundSpreadsheet` takes `rowActions?: (row) => CompoundRowAction[]` and
this family passes nothing, so a single-row verb currently requires ticking a
checkbox first. Law already says bulk is a **cardinality, not a mode**. Entries
are label + callback only — never JSX.

### P1.3 Shift-click range and ⌘A

`selection-anchor.ts` already holds the range walk and `stepCursor`, and is now
generic over string ids. `useLocationStockSelection` deliberately ignores
`shiftKey` because DISPLAY order lives inside the engine (search → sort → page)
and a range resolved over the unsorted feed would tick rows the operator cannot
see. The fix is to pass the engine's sorted id list down into `selection`, then
delete that paragraph from the hook's docblock. `row-gestures.guard.test.ts`
exists because this exact gesture was once plumbed and hard-coded off.

### P1.4 "5 selected · Select all 49"

Select-all ticks the painted PAGE (`slotTableSelectableIds`); operators read it
as the filtered set. Say which it is and offer the other, in `TableStatusBar`
beside the count it already prints.

---

## P2 — real design decisions, one increment each

| # | item | the point |
|---|---|---|
| 1 | **One server call per bulk verb** (`withTenantTransaction`) | N HTTP calls is N transactions: a 40-row adjust can half-land. Atomic bulk is also the honest place for an idempotency key that covers the whole press. |
| 2 | **Per-row pending / settled paint** | Whole-strip `busy` hides which rows are in flight. `CompoundRowView` has the hooks; needs a pending id set from the commit. |
| 3 | **Keyboard row cursor (`j`/`k`, space, enter)** | `stepCursor` exists. Without it the strip is mouse-first, which is the wrong posture for a warehouse desk. |
| 4 | **Leaf detail band = last 3 ledger rows** | `recordPlane` is honestly `{kind:'none'}` (a pair has no page). The substitute is "who changed this and why", one chevron from where the verb wrote it. |
| 5 | **§4d verbs** — `Mark counted` (`markBinCounted` exists), min/max | `Counted` and `Level` paint `--` / `STOCKED` on nearly every row until something writes them. |
| 6 | **Facets beyond Room, `copyExport`, saved `views`** | Three `DataTable` props this desk passes nothing to. Level / source / held-as as funnel groups; Copy on the selection; named views. |
| 7 | **Target picker source** | The replace/intake picker is `searchField: 'zoho_catalog'`, so a `sku_catalog` row with no Zoho mirror row cannot be picked — `00045-P-2-BK` is a live example. One list, two callers (`useLocationPickerOptions` / `useSkuCatalogSearch`): fix it once, and treat it as a catalog decision, not a strip decision. |

---

## Refuse these

- **A confirm dialog or a Confirm button.** Picking commits; Delete re-labels in
  place and takes a second press. P0.1 is the reason this stays true.
- **Standing keycaps on the CTAs, or a cheat sheet from the foot `?`.** Bind the
  letter, keep the face clean (`shortcut-display-cohort.ts`). `a` / `m` / `r` /
  `d` are taken.
- **`action: 'set'` for anything.** It upserts `bin_contents` with no ledger row
  and no `sku_stock` recompute. Delete is a `take` of the whole row for exactly
  this reason.
- **A second verb declaration** at a page, a mount, or a lane key list.
- **Per-row calls for the provisional merge.** It is SKU-wide; the second call
  404s because the placeholder is gone.
- **Hiding a verb on a mixed selection.** It resolves and names the remainder
  (`planStockBinWrites().note`).
- **Silent compensation for an undo.** The reversing entry is visible or the
  books drift.

---

## Gates

```
npx tsx --test src/lib/inventory/stock-bin-writes.test.ts \
               src/lib/inventory/stock-sku-replacement.test.ts \
               src/lib/inventory/stock-live-refresh.test.ts
pnpm run eval:cohort slot-table      # ok:true, peers == enginePeers (47)
pnpm run eval:cohort shortcuts       # any new hotkey
npm run verify:fast
```

Design-system hooks deny writes under `src/**/*.{tsx,jsx,css}` without a fresh
stamp:

```
node tools/design-mcp/ds.mjs contract "<job>"
node tools/design-mcp/ds.mjs tokens <axis>
node tools/design-mcp/ds.mjs critique <file>     # keep each UI file under 300 lines
```

`ds_adjudicate` is the same rules the PreToolUse hook enforces — run it on each
touched `.tsx` before calling the work done.

---

## Verifying against real data (the recipe that worked)

The desk is RSC + `force-dynamic`, so a browser run is the only honest proof.

1. **Dev server:** the prod lane runs on **3077**, not 3050 (3050 belongs to
   Garisek-OS). `.next/dev` takes a single lock — if another agent holds it,
   use the server that is up rather than starting a second.
2. **Env trap:** starting your own `next dev` can inherit a DSN split
   (`DATABASE_URL` on one Neon branch, `POSTGRES_URL` / `TENANT_APP_DATABASE_URL`
   on another) and `src/lib/db.ts` throws on it. Pass all six DSNs from `.env`
   explicitly if you must launch one.
3. **Session:** `createSession()` is RLS-blocked from a script; insert directly:
   `INSERT INTO staff_sessions (sid, staff_id, organization_id, device_kind,
   device_label, expires_at, persistent)` with a 32-byte hex sid, then set the
   `cf_sid` cookie in Playwright (`@playwright/test`'s `chromium`; there is no
   bare `playwright` package). **Revoke it when done.**
4. **Disposable stock:** the `ZONE` bin is empty and barcoded. Seed with
   `PATCH /api/locations/ZONE` `put`, act, then `take` it back out. For the pair
   direction, mint your own placeholder via
   `POST /api/sku-catalog/provisional` — never touch the operator's live
   `TMP-FJRJRB`.
5. **Rows carry no `role="row"`.** Find one by text through
   `[data-select-gutter]` → `closest('div.group\\/row')`, then click
   `button[role="checkbox"]` inside the gutter.
6. **The remote picker needs polling, not a timeout.** `SearchableSelectField`
   sets `shouldFilter={false}`, so an empty list mid-typing is react-query still
   in flight. Poll for the wanted option.
7. **Prove it in Postgres, not in the DOM:** `bin_contents.qty`, `sku_stock.stock`
   and the `sku_stock_ledger` tail. Restore every figure and say so.

Delete every throwaway script and screenshot before yielding.
