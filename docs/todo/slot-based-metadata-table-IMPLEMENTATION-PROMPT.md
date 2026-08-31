# IMPLEMENTATION PROMPT — Slot-based metadata table (To-ship first)

**Paste everything below the horizontal rule into a fresh Cursor / Claude / Fable agent.**  
Self-contained. Repo: `cycleforge-app` on **`main`**.  
Plan of record: [`slot-based-metadata-table-PLAN.md`](./slot-based-metadata-table-PLAN.md).  
**Related (desk frame, not columns):** [`non-scan-desk-chrome-caged-release-PLAN.md`](./non-scan-desk-chrome-caged-release-PLAN.md) — Mac-width stage, page tabs, Add CTA, caged→released. Compose; do not merge scopes.

You are the **executor**. The operator / verifier who wrote this prompt is not coding with you — finish the product outcome end-to-end. Do not invent a narrower success criterion. Do not leave forever hard-coded stage columns.

---

You are building the **foundations of a highly customization-oriented, metadata-driven data table** for Cycle Forge Warehouse OS — Salesforce/Linear-class column manipulation that starts on **To-ship** and then propagates to other desks by catalog + layout only (not new table forks).

Operators and org admins bind **backend row facts** into fixed presentation slots via a **+ → shadcn/Radix Popover**, scoped to the route’s `tableId`. Display paint comes from the **catalog + resolver + SlotLayout** — never from hard-coded React columns named Tested / Packed / Scanned out.

Write production TypeScript/React: typed, small diffs, no drive-by refactors, no second DataTable engine, no layout geometry animations.

## Operator UX locks (verifier — non-negotiable)

These are product law for To-ship compound paint. Ship them; do not “defer to a polish pass.”

### 1. Quantity under title — number only + existing tone

- Paint **just the number** (e.g. `1`, `2`) — no “Qty” noun, no `1×`, no badge chrome unless the shared atom already is number-only.
- Reuse the existing order-queue tone SoT: [`orderRowQtyTone`](src/lib/condition-tone.ts) — **qty `1` → `text-text-muted` (gray)**; **qty `> 1` → `text-text-warning` (yellow)** for immediate multi-unit response.
- Catalog field: `orders.qty` (`displayType: 'number'`, `slotKinds: ['subtitle']`).

### 2. Status / stage_event — contextual **one-word verbs**, matched width

- Do **not** always paint the header noun “Tested” on empty and filled rows alike.
- Top line of a `stage_event` cell is a **verb face**:
  - Event **has landed** → done verb (e.g. `Tested`, `Packed`, `Out`)
  - Event **has not landed** → empty verb meaning “still needs this step” (e.g. `Needed` — the one-word form of “need to test / need to pack”)
- **Both verbs are exactly one word.** Choose pairs that keep **column width stable** (same uppercase tracking / tabular face; prefer similar character counts — `Tested`/`Needed`, `Packed`/`Needed`, `Out`/`Needed`). Never paint multi-word empty copy like “Need to test” in the cell.
- Secondary line stays who · time · station (dash when empty) — that is the evidence line, not the verb.
- Encode verbs on the **FieldDef** (e.g. `doneVerb` / `emptyVerb` or equivalent), not `if (fieldId === 'orders.tested')` in the cell. The cell branches on `displayType === 'stage_event'` + resolved filled/empty + catalog verbs.

### 3. Item / product title — once only

- The compound **item primary** is already `product_title`.  
- **Do not** also bind or paint the product title under the title (no duplicate “Item” subtitle that re-shows the same string).
- Remove `orders.title` as a **subtitle** catalog option (or keep it only if needed elsewhere — it must **not** be a To-ship under-title binding). Product title is the title line, full stop.

### 4. Configurable under-title row (subtitle band) — org-ordered

Under the title, paint a **single secondary row** composed from **`subtitleBindings` in array order**. That order **is** the org’s configuration — reorder = reorder paint.

Bindable under-title facts (minimum for To-ship):

| Field id | Role | Paint |
|---|---|---|
| `orders.qty` | Quantity | Number only + `orderRowQtyTone` |
| `orders.condition` | Condition | Grade/marketplace label + existing condition tone ([`condition-tone.ts`](src/lib/condition-tone.ts) / grade chips). **Preview on the row** and **inline-changeable** under the title (reuse existing condition picker patterns — do not invent a second condition editor). |
| `orders.notes` | Note | Note text (hover/tooltip as today when truncated) |
| `orders.item_number` | Item # | Configurable item number below the title (`item_number` already on the orders feed / `ShippedOrder`) |

**Example org layout** the picker must support:

`subtitleBindings: [qty, condition, notes]` → paints `2 · NEW · call buyer` (separators house-consistent; exact join is executor taste as long as order is binding-order).

Another org may choose `[item_number, qty, condition]` or omit notes — **same engine**.

Default product layout may start with a useful subtitle set (e.g. qty + condition) or empty — but catalog + picker must expose all four, and **array order must be editable** (bind/unbind + reorder in the + Popover or equivalent ≤3-interaction path).

### 5. No hard-coded stage columns — backend facts only

- **Forbidden forever:** dedicated React tracks / cells keyed `tested` / `packed` / `scanned_out`, or Slice-style hand splices in `ORDERS_COMPOUND_COLUMNS`.
- Status columns appear **only** when a layout binds a catalog `stage_event` (or other status-capable) field into `status:N`.
- Track keys remain `status:1`… never field ids.
- Facts (who / when / station) come from the **row the API already returns** via the family resolver (`orders-resolve.ts`). If the projection omits a stamp, the secondary **dashes** — do not fake data in the cell.
- Catalog may list `orders.tested` / `orders.packed` / `orders.scanned_out` as **bindable vocabulary**; product default may bind one of them; **org chooses** what shows. The UI never special-cases those names for chrome.

### 6. Customization foundation (propagate later)

This ship is the **slot-table foundation**: catalogs + SlotLayout cascade + materializer + + Popover + under-title ordered subtitles + verbized stage_events. Later desks (pickup, Receiving, …) add a catalog + default layout only. Do not build a second “custom columns” product.

---

## Outcome (done when — audit every line)

Prove against the **working tree and commands**, not intent:

1. To-ship **+** opens `Popover` / `PopoverTrigger` / `PopoverContent` from `@/design-system/primitives/radix-popover`.
2. Popover lists this route’s catalog; toggle add/remove **status** and **subtitle** bindings; **reorder subtitles** (or equivalent that changes `subtitleBindings` order); explicit limit copy at status 10 / subtitle 5.
3. Identity structural, not removable; route-scoped to `tableId` **`orders`** (To-ship only).
4. Admin **Save as organization default** → `organizations.settings.tableLayouts.orders`; staff without personal override inherit it.
5. No `data-col="tested"` (or packed/scanned_out) hard tracks — only `status:N` from materializer. Binding Tested+Packed works via catalog fields.
6. **UX locks above all true on To-ship:** qty number+tone; one-word done/empty verbs; no product-title under title; item_number + condition (editable) + notes bindable in configurable order.
7. `npm run verify` green.
8. No other families mounted this ship.

If any item is unproven, the goal is **not** done.

## Working tree — start from reality

Inspect before editing. Kernel + orders catalog largely exist; finish paint/UX locks and any remaining mount/picker gaps — do not rewrite Phase 0 from scratch.

| Area | Expectation |
|---|---|
| `src/lib/tables/slot-layout*.ts`, `materialize-tracks.ts`, `resolve-effective-layout.ts` | Present — extend if FieldDef needs verbs / subtitle reorder helpers |
| `src/lib/tables/field-catalog/orders.ts` + `orders-resolve.ts` | Present — add `item_number`, `condition`; remove or demote `orders.title` as subtitle; add stage verbs on FieldDef |
| `CompoundStageStep` / `CompoundSlotCell` | Present — switch primary label to done/empty verb from catalog + filled state |
| `CompoundItem` secondary | Must paint **ordered subtitle slot values**, not legacy identity/title duplicate |
| Hard `tested` track | Must be gone if still present anywhere in layout/tests/e2e |
| + Popover / org `tableLayouts` / staff override | Complete if missing; must support subtitle reorder + condition/qty/item#/notes |

## Deliverables

1. Kernel + catalog + cascade + materializer (complete, tested).
2. Orders catalog as **customization vocabulary** (stage_events with verbs; qty; condition; notes; item_number; amount; identity) — **not** hard-coded stage UI.
3. To-ship mount on materializer; DataTable single engine.
4. Org + staff SlotLayout persistence; + Popover Fields UI (bind/unbind/reorder subtitles; limits; save as org default).
5. Compound under-title + stage_event paint matching **Operator UX locks**.
6. `npm run verify` green; To-ship sole verification surface.

## Non-goals (refuse)

- Porting pickup / Receiving / customers this ship
- Schema-per-tenant DDL / EAV from the picker
- Unlimited columns; deep-merge of partial binding arrays
- Multi-word empty status copy; painting product title under the title
- Hard-coded Tested/Packed/Scanned-out columns
- Committing unless asked; `git stash`; branches off `main`
- Restarting `:3050` / `usav-dev`

## Read first (in order)

1. This prompt’s **Operator UX locks**
2. `docs/todo/slot-based-metadata-table-PLAN.md`
3. `AGENTS.md`
4. `src/lib/condition-tone.ts` — `orderRowQtyTone`, condition tones
5. `src/lib/tables/field-catalog/orders.ts` + `orders-resolve.ts` + `types.ts`
6. `src/components/tables/compound/CompoundCells.tsx` — `CompoundItem`, `CompoundStageStep`, `CompoundSlotCell`
7. `src/lib/orders/orders-compound-view.ts`
8. `useOrdersSpreadsheet` / `UnshippedTable` / `DataTable`
9. `src/lib/tenancy/settings.ts` + `staff-preferences.ts`
10. `src/design-system/primitives/radix-popover.ts`

## Architecture (locked)

```text
PRODUCT default SlotLayout (code, orders)
   ↓
ORG organizations.settings.tableLayouts.orders
   ↓
STAFF prefs.tableLayouts.orders (optional)
   ↓
SAVED VIEW layout (optional this ship)
   ↓
resolveEffectiveLayout → materializeTracks → DataTable
         ↓
   resolveField(row) → slot values
         ↓
   status:N → stage_event cell (doneVerb | emptyVerb + who·time·station)
   item secondary → subtitleBindings ORDERED (qty · condition · note · item# …)
```

| Rule | Lock |
|---|---|
| Slots | identity (1) · status ≤10 · subtitle ≤5 · amount? |
| Track keys | `status:N` / `subtitle:N` — never field ids |
| Cascade | whole-document last-wins |
| Chrome | branch on `displayType` / slot key — never `if (family === 'orders')` for paint |
| Subtitle order | `subtitleBindings[]` order = paint order (org-configurable) |
| Stage columns | catalog bindings only — no hard-coded stage tracks |

### Product default (starting point — org may diverge)

```ts
{
  morph: 'compound',
  identityFieldId: 'orders.order_id',
  statusBindings: [{ fieldId: 'orders.tested' }], // optional bind — still catalog-driven paint
  subtitleBindings: [
    { fieldId: 'orders.qty' },
    { fieldId: 'orders.condition' },
  ], // example; org can reorder / swap in notes + item_number
  amountFieldId: 'orders.amount',
}
```

### Catalog minimum (To-ship)

| id | displayType | slotKinds | Notes |
|---|---|---|---|
| `orders.order_id` | id | identity | Structural |
| `orders.tested` | stage_event | status | `doneVerb`/`emptyVerb` e.g. Tested/Needed |
| `orders.packed` | stage_event | status | Packed/Needed |
| `orders.scanned_out` | stage_event | status | Out/Needed (one word) |
| `orders.qty` | number | subtitle | Number + `orderRowQtyTone` |
| `orders.condition` | tag (or dedicated) | subtitle | Tone + **inline editable** |
| `orders.notes` | note | subtitle | |
| `orders.item_number` | text | subtitle | Item # under title |
| `orders.amount` | money | amount | |
| ~~`orders.title` as subtitle~~ | — | — | **Do not** use under title |

## Implementation order

### Phase 0 — Kernel / catalog alignment

1. Extend `FieldDef` for stage verbs (`doneVerb` / `emptyVerb`).
2. Update Orders catalog: verbs; add `condition` + `item_number`; remove title-as-subtitle.
3. Resolver covers new fields; tests for qty tone class mapping, empty/done verb selection, subtitle order join.
4. Keep cascade / materialize tests green.

### Phase 1 — To-ship paint

1. Ensure columns only from `materializeTracks` (no hard stage keys).
2. `CompoundStageStep`: primary = emptyVerb or doneVerb from field + filled facts.
3. `CompoundItem` secondary: render ordered subtitle slot values (qty tone, condition preview, notes, item_number) — **not** product title, not legacy identity filler when layout binds subtitles.
4. Condition under title: preview + changeable (existing condition UI).
5. Update tests/e2e that still assert `tested` track keys.
6. `npm run verify`

### Phase 2 — + Popover customization

1. Org `tableLayouts.orders` + staff override.
2. + Popover: bind/unbind status & subtitle; **reorder subtitle bindings**; limit copy; identity locked; admin Save as org default.
3. Interaction budget ≤3 for primary bind; reorder may use drag or up/down inside the same popover without blowing the budget for a single bind.
4. Prove org A: qty·condition·notes; org B: item_number·qty; both via layout only.

### Phase 3+ — DO NOT IMPLEMENT

Other families — adoption checklist only.

## Repo laws

- `npm run verify` before done (`verify:fast` for inner loop).
- No geometry tweens.
- `orgId` from `ctx.organizationId`.
- Stage only your files; commit only if asked.
- Pure functions + Zod at the waist; thin React at the edges.

## Report back when done

1. Files created/changed (paths only)
2. Admin UI path for org-wide To-ship columns + subtitle order
3. Default product bindings + verb pairs chosen
4. How qty tone and condition edit were wired (cite symbols)
5. Evidence for each Outcome + each Operator UX lock
6. `npm run verify` result
7. What remains for post–To-ship ports

Start from **Operator UX locks**, then catalog/resolver/cell paint, then picker persistence. Do not open a PR unless asked.
