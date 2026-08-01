# Research briefing — dashboard Orders identity pane: pin Order left of Product, harden hierarchy

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers, not excerpts; read the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-31
**Repo state:** `main` @ `1c226847d`
**Scope:** the **dashboard Orders queue display** — frozen identity columns, default metric order, and Kinetic Ledger color/type hierarchy on the SoT table surface. Orders family is the **golden surface** first; sibling LedgerGrids get a rollout recommendation only. Not modality redesign, not a new grid engine, not data-fetch / status-machine work.

---

## The report that started this

The operator's account, in substance (against a live Pending grid screenshot):

> Selection should be the leftmost spine. The **order number** should be pinned on the left after selection. **Product title** should follow the order number. Metrics (condition, ship-by, qty, tracking, …) come after. Opening a row should surface the **details panel on the right** so the operator can make exact updates — and the queue needs clearer **color and hierarchy**, done through the codebase source-of-truth table display, not a page-local restyle.

That is a **scan-order + visual hierarchy** complaint on a Workbench collection map, not a request for a new spreadsheet product.

The proposal is an **identity-pane reorder** plus improve-ui hierarchy:

| | Today (SoT default) | Proposed |
|---|---|---|
| **Frozen identity pane** | `select` · `title` (Product) | `select` · `order` (Order) · `title` (Product) — or `select` · `order` only if Product must scroll |
| **Default fact scan** | Ship by · Qty · Cond · Order · Track | Ship by · Cond · Qty · Track (Order promoted out of the movable set) — Gemini may reorder facts |
| **Staff reorder** | Movable facts can be drag-reordered; locked pane always `select`·`title` first | Locked pane always forces the new identity keys; prefs sanitized |
| **Row open → details** | Non-modal float `detail:order` (`modal={false}`) | **Unchanged modality** — open the same float for record-plane edits ("pushed out" = *content* for updates, not layout squeeze) |
| **Hierarchy / color** | Order chip accent; Product heavy; SLA urgency tones; Cond/Qty often muted | Grow SoT VALUE cells + tokens so the spine reads Order → Product → urgency → facts |

**Bias of this brief:** prefer **growing the named SoT** (`GRID_IDENTITY_COLUMN_KEYS`, `ORDERS_QUEUE_COLUMNS`, shared `grid-cells` / identity chips) over a dashboard-only fork. If your answer adds a surface-local lock list that diverges from `GRID_IDENTITY_COLUMN_KEYS` without a model field, say why that is not a fork — or delete the divergence. House law: compose → grow the SoT → compound (`.claude/rules/pattern-evolution.md`).

---

## Deliverable — five separate answers

1. **The identity-pane answer.** For dense **outbound fulfillment / OMS queues** in 2026, is the frozen left spine `select · orderId · title`, `select · title`, or something else? Cite named systems (Shopify Admin orders, ShipStation, ShipBob, Linnworks / ChannelAdvisor-class, Polar, Linear issue lists, Airtable primary field, AG Grid `pinned` + `lockPosition`, Carbon / Polaris / Fluent data tables, NN/g tabular-data guidance). Adjudicate specifically for **serialized reseller outbound** where one marketplace order line is often one physical unit with a long product title — is the row key the **order id** or the **product title**? Distinguish documented product UX from shop-floor habit.

2. **The column-metric hierarchy answer.** Given the Orders Pending column vocabulary in §2, which fact columns belong in the default visible set, in what order, and which demote to Fields (`tier: 'optional'`)? Ship-by urgency, condition tags, qty, tracking — reconcile industry outbound boards against Kinetic Ledger and against this repo's existing viewport collapse (Qty → Cond first) and SLA-protection rules. Do **not** invent new column keys unless you delete an equivalent.

3. **The color / type hierarchy answer (improve-ui scope).** What state color and weight ladder belongs on SoT cells (tokens only; font-weight ceiling **600**; no page-local hex): Order link/chip, Product title, SLA urgency, Cond tag, muted Qty, Tracking. Say what to grow in shared VALUE cells (`src/components/ui/grid-cells.tsx`, `OrderIdentityChips` / `CopyChip`, `QUEUE_ROW`) vs leave alone. Kinetic Ledger only (`.claude/rules/kinetic-ledger.md`).

4. **The codebase answer (Orders-first).** Reconcile 1–3 against §2–§4. Give a **deletion-ordered** path: what to change first on the Orders golden surface, what staff-pref migration is required when `order` enters the locked pane, whether to grow `GRID_IDENTITY_COLUMN_KEYS` house-wide or introduce per-entity identity keys on `LedgerGridColumnModel`, each with the `file:line` it touches. Verify in the repo — §0.1.

5. **The rollout answer (scope 1C, second half).** After Orders lands, should Unbox / Incoming / Pickup / Catalog / Repair adopt `select · order · title`, keep `select · title`, or use **per-entity identity keys** on the column model? Prefer one grown SoT over N forks. Catalog has no order id; Receiving's `order` is often a **PO#**, not a sales-order id — say whether that breaks a house-wide `order`-in-identity rule.

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. Not optional.

Prior briefs in this series produced plans naming files that do not exist.

- **Every file path you name must be one you opened.** Infer nothing from naming convention. Mark inference `[UNVERIFIED]`.
- **Quote the evidence** for load-bearing claims: line number, function signature, prop name.
- Every `file:line` in §2–§4 was read on 2026-07-31 against `main` @ `1c226847d`. **Re-verify them.** If a line has moved or a claim is wrong, say so — that is a useful finding, not a nuisance.
- **Do not attribute reasoning to this brief that is not written in it.** If it is yours, say "my reasoning:".

### 0.2 Search the web for parts 1, 2, and 3. Also not optional.

- Part 1 is a **product-UX / OMS / WMS board** question. Answer from primary vendor docs and design-system table guidance (2024–2026 preferred), not memory.
- Part 2 has real practice divergence: marketplace OMS boards often lead with Order #; inventory / receiving boards often lead with SKU or title. Label which corpus you are using.
- Part 3 must stay inside **tokenized** systems (semantic color, type roles). A recommendation that requires page-local hex or `font-bold` (>600) is rejected by house law.
- **Scale discipline.** This is multi-tenant reseller-ops SaaS (serialized units, desk + standing bench, 1080p–1440p monitors). Not a 3PL control tower. A model that assumes dedicated packing stations with RF-gun-only UIs or a WES is not available — say so if your recommendation implies one.

### 0.3 Established facts — do not re-litigate

| Claim | Status |
|---|---|
| Right-rail record inspectors **float** (`modal={false}`); navigators push | **Locked.** Do not re-open push-vs-float / scrim. Sibling briefs already decided: `docs/todo/receiving-details-float-push-GEMINI-RESEARCH-BRIEFING.md` (Model B), `docs/todo/dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md`. Map operator “pushed out for exact updates” → open existing `detail:order` for **record-plane** edits, not layout squeeze. |
| Foreign UI grids (AG Grid / MUI / Glide as runtime) | **No.** Cite them as *benchmarks* only; grow Kinetic Ledger / LedgerGrid. |
| Second visual language | **No.** Kinetic Ledger tokens only. |
| Raise DS ratchet baselines | **No.** |
| “Just restyle Product cells” without identity change | **Out of scope as the whole answer** if you affirm an order-first spine — the complaint includes scan order. Hierarchy-only may be a *partial* answer if you reject the identity change with evidence. |
| Re-answer align / zebra / editability SoT from `table-display-sot` | **Out of scope.** Those display contracts largely landed (`resolveGridColumnAlign`, identity never in-cell edit). Reuse them; do not redesign them. |

---

## 1. Product + house-law context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers; USAV is the dogfood tenant. Inventory is **serialized**. Outbound operators spend most of a shift in `/dashboard` lifecycle tabs (Pending · Tested · Packed · … · Shipped) and sibling Packer/Tech history tables that share the same column SoT.

UI identity: **Kinetic Ledger** — data-first, dense, state-colored, scan-aware. Bias: **legible throughput over document calm** (`.claude/rules/kinetic-ledger.md`).

Region contract for this surface: **Workbench** — pick a record → edit → persist; selection durable / URL-aware where wired (`.claude/rules/contextual-display.md`, `display/workbench.md`). Density: `ops`.

Non-negotiable laws that bound your answer:

- **Compose from the named SoT first; grow it when it is wrong.** Never fork a page-local twin for the same job.
- **Color, spacing, type, z-index, elevation, focus come from tokens.**
- **600 is the font-weight ceiling.**
- **Grid column justification** only via `resolveGridColumnAlign` — digit/id/date/location → end; text/tag → start.
- **Navigators push, inspectors float** — never squeeze LedgerGrid for a transient peek.
- **improve-ui framing:** any later implementation runs critique → audit → **approval gate** → normalize (`.claude/skills/improve-ui/SKILL.md`). Your §4 output should be pasteable as an Orders-first P0/P1 target list for that gate — not an unbounded redesign.

Two prior briefs you must **reconcile, not duplicate**:

| Brief | What it already settled |
|---|---|
| `docs/todo/table-display-sot-GEMINI-RESEARCH-BRIEFING.md` | Pin align / editability / display fields onto the column model |
| `docs/todo/ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md` | Industry table anatomy; measured frozen `select`·`title` across six grids |
| `docs/todo/pending-grid-display-language-GEMINI-RESEARCH-BRIEFING.md` | Pending visual language precedent |
| `docs/todo/dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md` | Dashboard detail modality fight (do not re-run) |
| `docs/todo/receiving-details-float-push-GEMINI-RESEARCH-BRIEFING.md` | Locked float for inspectors |

---

## 2. Measured anatomy — Orders golden surface (read these first)

### 2.1 Column SoT (canonical Pending scan order)

File: `src/lib/dashboard-order-row-layout.ts`

```
select · title(Product) · sla(Ship by) · qty · condition(Cond) · order · tracking(Track)
```

Evidence:

- Canonical array: `ORDERS_QUEUE_COLUMNS` at **:96–107** — `select`, `title` (`Product`, `type: 'text'`, flex `1fr`), `sla` (`Ship by`, `type: 'date'`), `qty`, `condition`, `order` (`type: 'id'`, `hideKey: 'orderid'`), `tracking` (`gridLabel: 'Track'`, `type: 'location'`).
- TESTED mode inserts `tester` + `testedAt` after `sla`: `ORDERS_QUEUE_TESTED_COLUMNS` **:118–129**.
- Mode switch: `ordersQueueColumnsFor` **:135–139**.
- Comment at file top **:7–9** still says an older `date · age` pair in places; the live model fused those into `sla` (**:38–39**, **:80–87**). Prefer the live array over stale prose in the file header if they disagree.

**Important:** A live screenshot showing Product · Order · Cond · Ship by · Qty · Track is **not** a second layout. Movable columns can be staff-reordered; the sanitizer always forces locked keys first (`sanitizeOrdersQueueColumnOrder` **:211–233**). The frozen identity remains `select`·`title` regardless of that screenshot.

### 2.2 Identity freeze / lock / editability (house waist)

| Concern | Module | Evidence |
|---|---|---|
| House identity keys | `src/design-system/components/grid/grid-column-editability.ts` | `GRID_IDENTITY_COLUMN_KEYS = ['select', 'title']` **:16**; `isGridColumnInCellEditable` forbids in-cell edit on those keys **:28–30** |
| Orders alias | `dashboard-order-row-layout.ts` | `ORDERS_QUEUE_LOCKED_KEYS = GRID_IDENTITY_COLUMN_KEYS` **:300**; `isOrdersQueueFrozen` **:303–305** |
| Sticky left math | same | `ordersQueueFrozenLeft` **:323–331** — sums `--cf-col-*` of prior locked keys; comment still says select → title **:318–320** |
| Frozen cell chrome | same | `ORDERS_QUEUE_FROZEN_CELL = 'sticky z-raised bg-inherit'` **:343**; title carries `data-frozen-edge` for scroll shadow (comment **:339–341**) |
| Law text | `.claude/rules/source-of-truth.md` | Identity columns `select` · `title` **~:147–149** |

**Implication for your answer:** putting `order` into the frozen pane is not a CSS tweak. It changes `GRID_IDENTITY_COLUMN_KEYS` and/or Orders locked keys, freeze-left offsets, sanitizer locked set, “never in-cell editable” set, header immovable set, and every surface that spreads `...GRID_IDENTITY_COLUMN_KEYS` (Receiving, Incoming, Pickup, Catalog, Repair — see §3).

### 2.3 Viewport collapse + protected columns

`ordersQueueViewportForceHidden` **:173–188**: force-hide order is Qty → Cond. Comment **:163–168**: **`sla` is protected**; Title / SLA / Order / Tracking are never force-hidden. If Order moves into the identity pane, re-state what remains protected and what collapses first.

### 2.4 Who consumes this layout

| UI | Path | Notes |
|---|---|---|
| Dashboard Orders grid | `src/components/dashboard/orders-queue/OrdersGridView.tsx` | Default `tableId = 'orders'` **:131**; uses `OrdersQueueColumnHeader` (Orders still has a **header fork** with resize/reorder — SoT table notes Orders deferred vs thin `LedgerGridColumnHeader` adapters) |
| Row cells | `OrdersQueueTableRow.tsx` | Fused SLA via `GridSlaCellValue` **:418–428**; `order` cell → `identityNodes.order` **:873–878**; Product corner indicators live on frozen title **:467–470** |
| Packer history | `src/components/PackerTable.tsx` | `tableId="packer"` **:113** — same column vocabulary via station history / queue row path |
| Tech | sibling station history | `tableId` `'tech'` (see `StationQueueRow` comments) |
| Fields menu | `OutboundWorkspaceHeader.tsx` | `GridFieldsMenu tableId="orders" columns={ORDERS_QUEUE_COLUMNS}` |

Staff column-order / visibility prefs are **per `tableId`**. Migrating the locked pane must sanitize persisted orders for `orders`, `packer`, and `tech` (and any other consumers you find when you grep).

### 2.5 Selection spine

- Select track: `minmax(2rem, 2rem)` on the column model.
- LedgerGrid selection under airtable skin: **fill only** — `QUEUE_ROW.selectedLedgerClass = 'bg-blue-50'` in `src/components/ui/queue-row-chrome.ts` **:45**; composed in `OrdersQueueTableRow` (~**:989–992**). Guard: `queue-row-chrome.guard.test.ts`.
- Select-all lives in `OrdersQueueColumnHeader` when select mode / gridSkin.

The operator's “selection as the spine” is **already** the leftmost structural column. Your job is whether that spine's *second* frozen key should become Order.

### 2.6 Row open → details (modality locked — describe only)

- Open event: `dispatchOpenShippedDetails` in `src/utils/events.ts` **:53–56**.
- Dashboard wiring examples: `PackedOrdersTable.tsx` **:76**, **:136**; unshipped table default open path.
- Panel registration: `ShippedDetailsPanel.tsx` registers `id="detail:order"` with **`modal={false}`** **:208–210** — stable occupant so row→row swaps content in place.
- Host: `RightRailHost` + `src/lib/right-rail/store.ts` (one slot; navigators push / inspectors float — `.claude/rules/source-of-truth.md` Right-rail modality **~:151–160**).

**Do not recommend** layout push/squeeze for this inspector. If the operator language says “pushed,” translate it to: *the details surface appears for exact field updates beside the selected row,* using the existing float.

### 2.7 Hierarchy / color that already exists (grow, don't fork)

| Signal | Where | Behavior today |
|---|---|---|
| SLA urgency | `GridSlaCellValue` in `grid-cells.tsx` **:121–168** | Civil date muted; relative age uses `getDaysLateTone` / `getLaneAgeTone` |
| Order id | `OrderIdentityChips` / `OrderIdChip` via `useOrderIdentityCellNodes` | Accent / copy chip; last-4 display common |
| Product title | frozen title cell + corner OOS/note indicators | Primary prose track; exceptions as corner marks (**OrdersQueueTableRow** **:467–470**) |
| Cond | tag cell / `RowConditionMeta` | Often quieter than Order/Track links |
| Qty | number, end-aligned via SoT | Easy to under-emphasize |
| Tracking | `OrderIdentityChips` tracking node; empty → soft “create label” affordance **:879–909** | Strong accent when present |
| Justification | `resolveGridColumnAlign` in `grid-header-align.ts` **:79+** | `id`/`date`/`number`/`location` → end; `text`/`tag` → start |

Part 3 should say which of these stay, which intensify, and which demote — by growing shared modules, not inventing Pending-only CSS.

---

## 3. Sibling grids (for deliverable 5 only)

Every layout below spreads `GRID_IDENTITY_COLUMN_KEYS` into a local `*_LOCKED_KEYS`:

| Surface | Layout SoT | Default identity |
|---|---|---|
| Receiving / Unbox | `src/lib/receiving/receiving-grid-layout.ts` (`RECEIVING_GRID_LOCKED_KEYS` **:112–113**) | `select` · `title`; `order` is later (often PO#) |
| Incoming | `src/lib/receiving/incoming-grid-layout.ts` **:94–95** | `select` · `title` |
| Pickup | `src/components/receiving/pickup/grid/pickup-grid-layout.ts` **:79–80** | `select` · `title` |
| Catalog | `src/lib/products/catalog-grid-layout.ts` **:125–126** | `select` · `title` — **no sales-order column** |
| Repair | `src/lib/repair/repair-grid-layout.ts` **:80–81** | `select` · `title` |

Frozen cell chrome is reused via `ORDERS_QUEUE_FROZEN_CELL as *FROZEN_CELL` aliases.

**This is why deliverable 5 matters:** growing `GRID_IDENTITY_COLUMN_KEYS` to `['select','order','title']` without a per-entity escape **breaks Catalog** and mis-frames Receiving PO# as “order identity.” Prefer an explicit model: e.g. identity keys as a field on `LedgerGridColumnModel` / descriptor, or entity-scoped identity registries — say which, with deletion of the hard-coded twin lists.

---

## 4. Hard constraints (implementation-shaped)

1. **Pattern evolution** — If `select`·`title` is wrong for outbound Orders, grow the SoT; do not add `ORDERS_QUEUE_LOCKED_KEYS = ['select','order','title']` while leaving `GRID_IDENTITY_COLUMN_KEYS` lying about editability/freeze for the same job unless you also redefine the house contract and migrate siblings.
2. **`title` is the only flex track** today (`minmax(12rem, 1fr)`). If Order pins beside it, Order stays content-hard (`minmax(4.5rem, 4.5rem)` or grown); do not make two `1fr` tracks without arithmetic.
3. **Product corner indicators** (OOS / note) are documented as living on the **frozen title** cell so they survive h-scroll. If title unfreezes, you must relocate those signals — say where.
4. **Staff prefs** — `sanitizeOrdersQueueColumnOrder` drops unknown keys and re-prepends locked keys. When `order` becomes locked, any persisted order that placed `order` mid-list must be re-sanitized; Fields `hideKey: 'orderid'` must not allow hiding a locked identity column.
5. **Alignment** — Order as `type: 'id'` stays **end**-aligned even if it sits in the identity pane next to start-aligned Product. That vertical axis split is intentional house law; do not “center the identity pane.”
6. **DS ratchets** — no baseline raises; migrate raw controls to DS primitives if you touch chrome.
7. **improve-ui gate** — §4 should emit an Orders-first checklist suitable for `all | P0 only | pick: …` approval, not a multi-surface big-bang.

---

## 5. Operator proposal — concrete target (for you to affirm or amend)

Proposed Pending default (operator intent + this brief's bias):

```
[select] [Order*] [Product*] | Ship by | Cond | Qty | Track
         └──── frozen identity pane* ────┘
```

Row click / keyboard open → existing `detail:order` float for exact updates (condition, tracking, notes, …) on the **record plane**; multi-select stays on the bottom `ContextualSelectionBar` pattern already used elsewhere — do not invent a second multi-edit waist.

Hierarchy sketch (for Part 3 to harden or reject):

1. **Order** — primary identifier (accent link/chip, tabular, end-aligned).
2. **Product** — secondary but readable title (semibold ≤600, default text color, truncate).
3. **Ship by** — urgency color on the relative segment only (already partially true).
4. **Cond / Qty / Track** — supporting facts; Track remains actionable when present.

---

## 6. Out of scope (explicit)

- Pushing / squeezing the dashboard layout for the details panel.
- Replacing LedgerGrid or adopting AG Grid at runtime.
- Changing status transitions, Zoho sync, or search waist.
- Redesigning MasterNav / left spine.
- Station Workbench chrome (Unbox dock, scan bands) — different brief family.
- Raising knip / DS ratchet baselines to pass verify.
- Implementing the improve-ui pass in the same answer — research + deletion-ordered path only.

---

## 7. What a good answer looks like

- Five labeled sections matching the five deliverables.
- Primary citations for industry claims; `file:line` for codebase claims.
- A single **Orders-first** target anatomy (column keys + freeze set + default fact order + hierarchy ladder).
- A **pref migration** note (what happens to existing staff column orders).
- A **rollout** verdict: house-wide identity grow vs per-entity identity keys vs Orders-only with an honest temporary fork + delete-by date.
- An improve-ui paste block: P0 / P1 / deferred, each pointing at modules to grow.

**Scale reminder again:** multi-tenant reseller SaaS, serialized units, one primary dogfood warehouse — not Amazon FC density. Prefer the smallest SoT growth that fixes the scan order and hierarchy.

---

## Appendix A — screenshot reference

Operator screenshot (2026-07-31): Pending-style grid with columns appearing as Product · Order · Cond · Ship by · Qty · Track, selection checkboxes leftmost, Order/Track as accent links, some Ship-by urgency in warm tone, some rows `Unknown Product` / `----` order placeholders. Treat as **evidence of desired scan priority and hierarchy**, and as **evidence of staff reorder**, not as proof of a second canonical SoT.

## Appendix B — key file index (open these)

| Path | Why |
|---|---|
| `src/lib/dashboard-order-row-layout.ts` | Orders column SoT, lock, freeze-left, sanitize |
| `src/design-system/components/grid/grid-column-editability.ts` | House identity keys |
| `src/design-system/components/grid/grid-header-align.ts` | Justification SoT |
| `src/components/dashboard/orders-queue/OrdersGridView.tsx` | Golden surface composer |
| `src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx` | Cell hierarchy / indicators |
| `src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx` | Header fork (resize/reorder) |
| `src/components/ui/grid-cells.tsx` | `GridSlaCellValue` and shared VALUE cells |
| `src/components/ui/OrderIdentityChips.tsx` | Order / tracking identity nodes |
| `src/components/ui/queue-row-chrome.ts` | Selection fill |
| `src/components/shipped/ShippedDetailsPanel.tsx` | `detail:order`, `modal={false}` |
| `src/utils/events.ts` | `dispatchOpenShippedDetails` |
| `.claude/rules/source-of-truth.md` | Identity + right-rail modality laws |
| `.claude/rules/kinetic-ledger.md` | Visual identity |
| `.claude/rules/ui-design-system.md` | Density / one-row / no foreign grids |
| `.claude/skills/improve-ui/SKILL.md` | Later execution gate |
