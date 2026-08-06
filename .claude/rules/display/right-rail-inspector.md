# Right-rail inspector — display contract

**Region:** Workbench / Desk record plane (and intake create overlays that share `RightRailHost`).  
**Shell SoT:** `RightRailHost` + `src/lib/right-rail/store.ts` + detail-stack tokens.  
**Desktop geometry:** every non-modal resident inspector is a flush **in-flow
push column at every width**. Width pressure caps the right panel so the center
hugs its floor beside an **open** context rail; it must never auto-park the left
rail and never switch the inspector to the floating rounded overlay shell.
Overlay remains explicit for modal/intake, mobile, ambient assistant, and
station-edge opt-outs.  
**Header SoT:** `PaneHeader` + blocks (`PaneHeaderLabel`, `PaneHeaderActionBar`, `PaneHeaderCloseButton`, …) **or** Unbox-aligned `DeskRailChromeRow` (`src/components/right-rail/DeskRailChromeRow.tsx`) when the card wants `→|` top-left · ↑↓ · trailing ring-twin. Orders `RecordPaneHeader` composes `DeskRailChromeRow` for chrome Row 1 (same top-left close).  
**Hairline SoT:** `useHorizontalEdgeResize` + `HorizontalEdgeResizeHandle` on `RightRailHost` with **`placement="inset"`** — the 1px paint is the panel's own `border-l` seam (the display hairline), hit sash inside the card. Never an outset overhang into the work surface, and never a sash-top collapse chevron (`onCollapse`). Close / park = `→|` + Band 3 Show/Hide inspector + parked expand strip. Unbox Displays (`UnboxPushColumn`) is the golden twin. Left context rail may still use sash `onCollapse` + `outset` — different edge.  
**Modality / push / occupancy:** [source-of-truth.md](../source-of-truth.md) → **Right-rail modality**
(AI and record/ticket details share **one** right-edge slot — detail outranks assistant) ·
**Frame column budget** (center floor · yield ladder).  
**Guard:** `src/components/right-rail/right-rail-inspector-header.guard.test.ts` ·
`src/components/right-rail/detail-stack-collapse.guard.test.ts`.

---

## Anatomy (every record inspector)

### Orders family — `RecordPaneHeader` (chrome → context → identity)

```text
┌─────────────────────────────────────────────────────────────┐
│ Row 1 — chrome ONLY (omit when no close and no ↑↓)          │
│ [→|] ……………………………… [ N / M ] [ ↑ ] [ ↓ ]                 │
│ DeskRailChromeRow — close top-left; cursor + ↑↓ trailing    │
├─────────────────────────────────────────────────────────────┤
│ Row 2 — contextual icons / topic tabs ONLY                  │
│ [ contextual icons … ]                                      │
│ PaneHeaderActionBar iconOnly — actions only (no chrome)     │
├─────────────────────────────────────────────────────────────┤
│ Row 3 — dense identity (PaneHeaderLabel)                    │
│ [badge?]  eyebrow (mode / entity kind)                      │
│           value = SHORT durable key (truncate)              │
│ optional legacy section tabs after identity                 │
├─────────────────────────────────────────────────────────────┤
│ Body — scrollable facts · forms · long titles · prose       │
├─────────────────────────────────────────────────────────────┤
│ optional footer — ONE primary CTA band (submit / resolve)   │
└─────────────────────────────────────────────────────────────┘
```

### Incoming family — `DeskRailChromeRow` (Unbox-aligned)

```text
┌─────────────────────────────────────────────────────────────┐
│ Row 1 — DeskRailChromeRow (ONE flex row, never absolute)    │
│ [ >| ] …………………… [ ↑ · ↓ · trailing? ]                     │
│ close · spacer · cursor · ring — chrome ONLY by default     │
│ (optional `.actions` only when topics share the chrome row) │
├─────────────────────────────────────────────────────────────┤
│ Row 2 — contextual icons / topic tabs (when present)        │
│ PaneHeaderActionBar iconOnly — no onClose / onPrev / onNext │
├─────────────────────────────────────────────────────────────┤
│ dense identity (PaneHeaderLabel) + status pills             │
├─────────────────────────────────────────────────────────────┤
│ Body …                                                      │
└─────────────────────────────────────────────────────────────┘
```

**History peek golden (`detail:history`).** Its header is chrome → Display tabs
→ identity (+ optional View strip):
1) `DeskRailChromeRow` with **close + ↑↓ only** (no `.actions`), 2) labelled
**Display** `PaneHeaderTabs` dense (`Details | Logistics | Evidence | History`)
with a **View** toggle that expands `HistoryViewTopicsCluster` (paint ·
Drill|List · compare · zoom · staff · week · ▦ · KPI — sheet layout / refine
moved off Band 3; forced open in View-only shell), then 3) short status + PO /
Receiving identity plus **one** readiness-picked labelled primary CTA
(`historyInspectorPrimaryAction`) and a More menu for secondary edits —
**not** an Edit icon ActionBar and **not** a multi-button labelled strip.
Topic map SoT: `history-inspector-topics.ts`. The topic row lives **only** on
this push inspector — never on Unbox History Band 3 (Band 3 = find · in-field
filter · park/reopen via **Show / Hide inspector** — not Station **Open
displays**). Body shows the **active** Display section only (`data-history-topic`).
**Display topic** (singular — which body section is open) ≠ Station **Displays**
column (`UnboxPushColumn` / Ticket · Photos · Linkage · …). Law:
source-of-truth.md → Displays vs inspector. Orders mirror the same chrome →
context → identity ladder via `RecordPaneHeader`.

**Desk single-card vs Unbox two-host (ruled 2026-08-03).** Unbox reads
`[→|] ……… [↑ ↓]` across two regions: column `UNBOX_PUSH_TOP_BAND` + pane-absolute
`stationMoreDetailsPaneHostClass` (`top-0 right-2`) for the carton cursor; the
progress ring is dock-anchored under the terminal. That absolute host is
**illegal inside a RightRailHost card** — a non-zero top inset only offsets the
trailing cluster and splits the baseline. When every control lives in one card, compose
**`DeskRailChromeRow`** (or `PaneHeaderActionBar onClose` for the orders
cluster). Never a page-local twin of the row class.

Compose with `PaneHeader`: chrome (close · ↑↓ · counter) on Row 1; contextual
icons on Row 2; identity in `belowSlot` **or** under `DeskRailChromeRow` — but
**never** a wrapping hero title, **never** close in `rightSlot` while prev/next
live on another row, and **never** chrome props on the same ActionBar instance
as contextual `actions`.

---

## Identity — Hard Always / Never

**Always**

- Identity uses `PaneHeaderLabel` (or the same role ladder):  
  - Eyebrow: `text-role-eyebrow uppercase tracking-widest` — mode / entity kind (`Order #`, `Catalog link`, `PO`, `Repair ticket`).  
  - Value: truncated short key at caption density (`paneHeaderLabelValueClass` / `text-role-caption font-semibold`) — order id, item #, SKU, ticket #, tracking.
- Long product titles, listing sentences, descriptions, and multi-line prose live in the **body** as fact rows — not in the header.
- Contextual icon actions are a **per-occupant** `PaneHeaderActionBarAction[]` (Link / Sync / Print / Ignore / …). The shell does not hardcode them.
- Close is **`PaneHeaderActionBar onClose`** (orders) **or** **`DeskRailChromeRow`** (Incoming-family) — mandatory for `modal={false}`. Queue walk uses the same row's prev/next. **Never** close in a `rightSlot` on the row above prev/next (split-cluster drift). Reach for `PaneHeaderCloseButton` directly only outside an action/chrome row.
- **Close glyph is `ArrowRightToLine` (`>|`), not an `X`** (2026-08-02). The arrow says the panel is parked back against the right edge; `intent="dismiss"` restores the `X` for a pane that genuinely goes away.
- **Order surfaces mount `RecordPaneHeader`** (`src/components/order-record/`). Contextual icons are Row 2; legacy section tabs stay a `tabs` slot after identity. Open-full-page is an **action in the contextual icon row**, not a lone `IconButton` beside close.
- **Incoming / Unfound / Bin / Support-context compose `DeskRailChromeRow`.** Trailing Sync (Incoming) is the Unbox ring twin — always most right after ↑↓.

**Never**

- **`SidebarIntakeFormShell` as record-inspector chrome.** That shell is for **create / intake / import** forms (New Order, Import eBay, FBA create, column-display prefs). It ships a left-circle close + wrapping uppercase `<h2 title>` — the exact anti-pattern that turned a Bose product sentence into a hero header on Review → Catalog link.
- A **wrapping hero title** (full `product_title` / listing name / paragraph) in any right-rail header.
- `text-role-title` / `text-role-display` / raw `text-lg`+ for rail identity.
- Labelled button blocks that **duplicate** the icon action row (e.g. a second Delete in the footer). A single primary CTA band (Link listing / Resolve / Save) in the footer is allowed; it is not a twin of the icon strip.
- Page-local `fixed right-0` panels, intake `h2` titles, or a third right-edge grammar.
- **`stationMoreDetailsPaneHostClass` inside a Desk RightRailHost card** (Unbox pane-host only — allowlisted at `LineEditPanel`).
- **`variant="card"` `PaneHeaderActionBar`** as the chrome utility pill (deleted Incoming pill row).
- **`rightSlot={<PaneHeaderCloseButton …/>}`** on a record registrar (split cluster).

---

## Body — fact telemetry

The header says *which* record. The body says *what is true about it*. Default body grammar is a
**fact list**, not prose and not cards.

**SoT:** `OrderFactList` / `OrderFactRow` (`@/components/order-record/order-record-card.tsx`).
`OrderRecordCard` is the section container. Identity + principles:
[`instrument-panel.md`](instrument-panel.md) → P1 / P4.

```tsx
<OrderFactList cols={1}>                        {/* cols=1 for narrow rails */}
  <OrderFactRow label="ORDER"    value={orderId}  mono />
  <OrderFactRow label="TRACKING" value={tracking} mono />
  <OrderFactRow label="PLATFORM" value={platformLabel} />
  <OrderFactRow label="TITLE"    value={productTitle} span />
</OrderFactList>
```

- Label resolves to `text-role-eyebrow uppercase text-text-faint`; value to `text-role-caption
  font-medium`, with `mono` adding `font-mono tabular-nums`. An empty value renders an em dash
  unless `omitWhenEmpty` — **honest absence, never `"N/A"`**.
- **`span` is where the banned hero title goes.** A full `product_title` / listing sentence is
  legitimate content — it is only banned from the *header*. Give it a spanning row in the body.
- **`mono` is not decoration — it is the retypability contract (P3).** Any identifier an operator
  might have to read back into a field or a phone (serial · FNSKU · tracking · SKU · order id) is
  mono. A platform name or a staff name is not.

### Segments — the hybrid ruling

**Segment with `<section>` eyebrows inside ONE scroll; do not split into separate cards.** A rail is
a single narrow column, so stacked cards re-create the nested-cards-as-rows ban and cost a border
plus padding per group for no navigational gain.

- Use a segment eyebrow (`EVIDENCE`, `FULFILLMENT`, `CUSTOMER`) once a body carries **three or more
  fact groups**; below that the eyebrows out-number the facts.
- **A multi-field FORM breaks out of the fact list.** Facts are read; a form is operated. Once a
  group takes more than one editable control, it becomes its own `OrderRecordCard` section with its
  own submit — it is no longer telemetry.
- **Create forms in flush push columns** (Station Displays claim compose golden) use **sheet-band
  fields** from `DenseComposeFields` — underline Subject + full-bleed sunken Body (`inset-field`
  only on the textarea). Never nested `rounded-lg border` boxes, `TextField`, or
  `WORKSPACE_NESTED_FIELD` for that job.
- **One primary CTA band in the footer, at most.** A second primary is the competing-primaries
  failure (P5). Macro commit / bulk CTAs compose `FlushTerminalFooter` (Claim File golden —
  in-flow `p-0` hairline floor, flush `Button`); Micro per-row actions stay on
  `IconButton size="md"`.

### Anti-patterns

| Don't | Do |
|---|---|
| Card soup — one bordered card per fact group | `<section>` eyebrows in one scroll |
| Chat bubbles as the record surface | Fact rows; the conversation lives in threads |
| A narrative sentence assembled from fields | Label + value, one fact per row |
| A serial or tracking number set in the sans cut | `mono` (or the typed `CopyChip`) |
| A second primary CTA beside the footer band | One commit per beat |

**Adoption note (2026-08-05):** Desk table click mounts tabbed `ShippedDetailsPanel` →
`ShippedDetailsBody` (no `OrderRecordBody` branch). Non-desk stack opens use
`CompactOrderPeek`. Search feedback is `SearchOrderFeedback` on `/search` — a different
job; it may compose fact atoms without going through `OrderRecordBody`. Durable
`/o/[id]` keeps `OrderRecordBody`. Migrate a rail's body when you are already editing
it; do not open a sweep.

## Two chrome families (do not cross)

| Family | Component | Use for |
|---|---|---|
| **Record / queue inspector (orders)** | `RecordPaneHeader` / `PaneHeaderActionBar onClose` | Picked order detail, queue walk (`detail:order`, `detail:catalog-link`, …) |
| **Record / queue inspector (Incoming-family)** | `DeskRailChromeRow` | Unbox-aligned Desk card: Incoming · Unfound · Bin · Support-context |
| **Intake / create overlay** | `SidebarIntakeFormShell` | Empty-form create / import wizards (`detail:new-order`, `detail:incoming-import-ebay`, FBA create, grid column prefs) |

If a surface starts as intake and later becomes “open a row and resolve it,” **migrate the header to `PaneHeader` / `DeskRailChromeRow`** — do not stretch the intake shell’s title prop to hold the row’s product name.

---

## Contextual icons

Different rails own different action contracts. Pass them in; do not fork a second header:

| Occupant (examples) | Typical icon actions |
|---|---|
| `detail:order` | Print · note · open full · delete · … |
| `detail:history` | **Receiving golden** — labelled Display `PaneHeaderTabs` + one identity primary CTA (`historyInspectorPrimaryAction`); Edit icon strip / multi-button labelled strips banned |
| `detail:incoming` | Sync |
| `detail:catalog-link` | Link listing · Ignore |
| `detail:import-exception` | Resolve · Ignore |
| `detail:claim` | Print · Square · … |

Trailing cluster is always **`>| · ↑ · ↓`** when the rail walks a queue; close alone when it does not.

---

## Checklist (new right-rail occupant)

1. `DetailStackRailRegistrar` / `useRegisterRightPanel` — no private geometry.  
2. `modal={false}` for record peeks; stable id when row→row is the loop.  
3. Header is **chrome → context → identity**: Row 1 chrome/navigation only (`DeskRailChromeRow` Incoming-family **or** `PaneHeaderActionBar iconOnly` with `onPrev`/`onNext`/`onClose` for orders — no contextual `actions` on that bar); Row 2 contextual tabs / icons (`PaneHeaderTabs` for History Display, or `PaneHeaderActionBar iconOnly` elsewhere); Row 3 dense `PaneHeaderLabel` short key (+ History: one primary CTA + More). History is the Incoming golden; Orders compose `RecordPaneHeader` — don't fork a third.  
4. No `SidebarIntakeFormShell` on a record inspector.  
5. No `stationMoreDetailsPaneHostClass`, no `rightSlot` close, no `variant="card"` ActionBar pill.  
6. Long titles / prose only in the scroll body.  
7. Push / resize / collapse per Right-rail modality SoT (`edgeCollapse={false}` when header `→|` is the only dismiss — Incoming).
