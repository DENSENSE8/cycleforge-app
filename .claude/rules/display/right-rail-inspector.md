# Right-rail inspector — display contract

**Region:** Workbench / Desk record plane (and intake create overlays that share `RightRailHost`).  
**Shell SoT:** `RightRailHost` + `src/lib/right-rail/store.ts` + detail-stack tokens.  
**Desktop geometry:** every non-modal resident inspector is a flush **in-flow
push column at every width**. Width pressure caps the right panel so the center
hugs its floor beside an **open** context rail; it must never auto-park the left
rail and never switch the inspector to the floating rounded overlay shell.
Overlay remains explicit for modal/intake, mobile, ambient assistant, and
station-edge opt-outs.  
**Header SoT:** `PaneHeader` + blocks (`PaneHeaderLabel`, `PaneHeaderActionBar`, `PaneHeaderCloseButton`, …) **or** Unbox-aligned `DeskRailChromeRow` (`src/components/right-rail/DeskRailChromeRow.tsx`) when the card wants `→|` top-left · ↑↓ · trailing ring-twin. Desk `detail:order` composes `DeskRailChromeRow` + Unbox `SectionTabsSlider` density=icon (no identity row).  
**Hairline SoT:** `useHorizontalEdgeResize` + `HorizontalEdgeResizeHandle` on `RightRailHost` with **`placement="inset"`** — the hover paint is a **4px** full-height bar on the panel's own `border-l` seam (the display hairline), hit sash inside the card. Never an outset overhang into the work surface, and never a sash-top collapse chevron. Close / park = `→|` + Band 3 Show/Hide inspector + parked expand strip. Station Displays (`StationDisplaysPushColumn`) is the golden twin for hairline placement — **not** the same host. Left context rail uses the same inset seam paint (drag-only sash) + filter trailing + drag-past-min — different dismiss grammar, same hairline placement.  
**Motion:** desk push open ↔ park **snaps** (`style.width` — Unbox Displays / `ContextPanelLayout` twin). Never `motionRole.push.rail` width tween or opacity presence on the push column; overlay / modal / intake keep their presence fade. Guard: `right-rail-push.guard.test.ts` · `detail-stack-collapse.guard.test.ts`.  
**Modality / push / occupancy:** [source-of-truth.md](../source-of-truth.md) → **Right-rail modality**
(AI and record/ticket details share **one** right-edge slot — detail outranks assistant) ·
**Frame column budget** (center floor · yield ladder) · **Scan vs desk right-edge (C2 thin waist)**
(distinct hosts; share `DisplaysIndexLeafStage` + tokens + domain; never share dismiss chords /
AI occupancy / visit-history).  
**Guard:** `src/components/right-rail/right-rail-inspector-header.guard.test.ts` ·
`src/components/right-rail/detail-stack-collapse.guard.test.ts` ·
`src/components/right-rail/desk-inspector-index.guard.test.ts`.

### C2 — desk host vs station Displays (do not merge)

| Concern | Desk (`RightRailHost` + `DeskInspectorIndexShell`) | Station (`StationDisplaysPushStack`) |
|---|---|---|
| Job | Inspect / light-edit selected queue row | Tools for active carton / procedure |
| Operator copy | **Show / Hide inspector** | **Open displays** / Hide right panel |
| Park / edge chord | **⌘\\** + bare **]** · Band 3 | **⌘]** · `←|` / `→|` |
| Esc | Leaf → index (does not necessarily park) | Leaf → index → close column |
| AI | Same slot; detail priority 100 > assistant 10 | Yield Displays on assistant open (forked mechanism) |
| Visit history | URL / simple last leaf — not station stack | Local `displays-visit-history` |
| Shared waist | `DisplaysIndexLeafStage` + tokens | Same stage body |

**Ask-first:** mounting the push stack on `RightRailHost`, or unifying Esc/park Redux across hosts.

---

## Anatomy (every record inspector)

### Orders family — desk `detail:order` (Unbox index→leaf twin)

```text
┌─────────────────────────────────────────────────────────────┐
│ Row 1 — chrome ONLY                                         │
│ [→|] ……………………………… [ N / M ] [ ↑ ] [ ↓ ]                 │
│ DeskRailChromeRow — close top-left; cursor + ↑↓ trailing    │
├─────────────────────────────────────────────────────────────┤
│ DeskInspectorIndexShell → DisplaysIndexLeafStage            │
│ (shared Unbox waist with StationDisplaysPushStack; never    │
│ mount the push stack on RightRailHost)                      │
│   Index — DisplayIndexRow topics + ⋮ handoffs               │
│   [ Order | Documents | Timeline | Conversation ]           │
│   Topic map SoT: order-inspector-topics.ts                  │
│   Leaf — sticky Back + flush body (no ORDER # identity)     │
│   Order leaf stacks Shipping + Product (no nested tabs)     │
├─────────────────────────────────────────────────────────────┤
│ Order leaf only — bottom update bar (`OrderUpdateDock`)     │
│ [ Assign | Urgent | Notes | OOS | Ship ] …… [🗑 icon]       │
│ Delete = flush trailing icon (no padded surface). Assign    │
│ expands OrderAssignDisplayHost above the bar (never popover)│
└─────────────────────────────────────────────────────────────┘
```

Full-page `/o/[id]` is retired. Desk selected-order mirrors Unbox **rows-index
grammar** on `RightRailHost` — never `SectionTabsSlider density="icon"` /
`PaneHeaderTabs` as primary topic nav, never `RecordPaneHeader` identity ladder.

Sheet **View** topics (paint · drill · compare · Urgent board filter · sort ·
staff · ▦ · KPI) live on **`detail:orders-view`** (`OrdersViewControlsRail`) —
Band 3 opens that rail with no row selected. Selected-order `detail:order` must
**never** remount `OrdersViewTopicsCluster`.

### Incoming family — `DeskRailChromeRow` (Unbox-aligned)

```text
┌─────────────────────────────────────────────────────────────┐
│ Row 1 — DeskRailChromeRow (ONE flex row, never absolute)    │
│ [ >| ] …………………… [ ↑ · ↓ · trailing? ]                     │
│ close · spacer · cursor · ring — chrome ONLY by default     │
│ (optional `.actions` only when topics share the chrome row) │
│ Incoming Sync = trailing after ↑↓ (never the floor)         │
├─────────────────────────────────────────────────────────────┤
│ dense identity (PaneHeaderLabel) + status pills             │
├─────────────────────────────────────────────────────────────┤
│ DeskInspectorIndexShell — topic rows → leaf bodies          │
│ (never PaneHeaderTabs / SectionTabsSlider density=icon)     │
├─────────────────────────────────────────────────────────────┤
│ InspectorActionFloor (Workbench triage only; icons-first)   │
│ [ ⋯ ][ icon ][ icon ] …………………………… [ 🗑 flush icon ]   │
│ FloorOverflowButton · FloorIconButton peers + delete child  │
│ Mount only when the open row has Macro commit / delete      │
└─────────────────────────────────────────────────────────────┘
```

**Action floor SoT (desk):** `InspectorActionFloor` + the shared peers
`FloorIconButton` / `FloorOverflowButton` + `FLOOR_DELETE_PEER_CLASS`
(`src/components/right-rail/`). **Icons-first, ONE row (ruled 2026-08-09):** an
equal-column `IconActionFloor` spread — `⋯` overflow leading · icon verbs ·
flush trailing `InspectorFlushDelete` **child** far-right — with an optional
`above` expand (assign / notes / error / teaching text). **Never a grid of
labelled buttons, and never a labelled `actions` / `leading` / `delete` cluster**
(that legacy path is deleted). Every desk panel composes the SAME peers so the
row is identical by construction; test-ids ride on the peer as JSX attrs. Desk
triage inspectors only (Incoming · Orders Order-leaf · Unfound · Repair · Bin ·
SKU panel · **History**). Never Station Displays / `StationTerminalDock`. Never a
host slot on `RightRailHost`. **Intake overlays are NOT this floor** — a labelled
commit (Import CSV / Add inbound) composes `FlushTerminalFooter layout="cluster"`
directly. **History mounts the floor when n=1** (ruled 2026-08-09): the record's
edit gravity is the bottom dock — `⋯` More · Print · Edit (Open/Continue/Match in
Unbox, `historyInspectorPrimaryAction`) · flush trailing **Delete carton**
(`DELETE /api/receiving-logs`) far-right. The top chrome row stays
navigation-only so a Park never sits beside a Delete. The View-only shell (n=0)
mounts no floor.

**Station Displays carton Macro (fork):** scan benches mount
`StationDisplaysHeaderActions` (`src/components/station/displays/`) via
`StationDisplaysPushStack` `headerActions` in the column's **top-right band**
(moved off the bottom rung 2026-08-18). Layout: Refresh · Print/Resolve · Edit ·
trailing **`⋮`**, with Delete and Resolve *inside* `⋮` (`tone="danger"` + the
undo toast) — the opposite of the desk floor, where Delete is the flush trailing
peer. The `Filter displays… + →|` footer keeps the bottom band. Unbox golden:
`UnboxDisplaysActionFloor` (`station-displays-carton-floor.ts`). Still never
import desk `InspectorActionFloor` into Displays.

**History peek golden (`detail:history`).** Chrome → optional View strip → slim
identity key (status + short PO/Carton; **no icon hero, no CTA row**) →
**`DeskInspectorIndexShell`** (Details · Logistics · Evidence · History as index
rows → leaf) → **`InspectorActionFloor`** bottom dock (record actions + Delete,
n=1). View toggle expands `HistoryViewTopicsCluster`
(paint · Drill|List · compare · zoom · ▦). **KPI collapse is NOT here** —
Band 3 `kpiToggle`. Topic map SoT: `history-inspector-topics.ts`. Never
`PaneHeaderTabs` as primary topic nav. **Display topic** (singular — which
leaf is open) ≠ Station **Displays** column. Desk Orders twin:
`DeskRailChromeRow` + `DeskInspectorIndexShell` + `order-inspector-topics.ts`
(View stays on `detail:orders-view`).

**Desk single-card vs Unbox two-host (ruled 2026-08-03).** Unbox reads
`[→|] ……… [↑ ↓]` across two regions: column `UNBOX_PUSH_TOP_BAND` + pane-absolute
`stationMoreDetailsPaneHostClass` (`top-0 right-2`) for the carton cursor; the
progress ring sits under the dock (Band 2 right), not in this pane. That absolute host is
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
- **Desk selected-order (`detail:order`)** uses Unbox **index→leaf** grammar:
  `DeskRailChromeRow` + `DeskInspectorIndexShell` (`order-inspector-topics.ts`).
  No ORDER # identity row. Order leaf stacks Shipping + Product. Order updates
  (Assign · urgent · notes · OOS · ship) + flush Delete icon live on
  `OrderUpdateDock` under the Order leaf; index ⋮ is handoffs only. Sheet View
  chrome is **`detail:orders-view` only** — never on `detail:order`. Never
  `SectionTabsSlider density="icon"` / `PaneHeaderTabs` as primary topic nav.
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
- **Read facts carry no sunken/canvas wash.** `OrderFactRow` / Displays
  `StationDenseFactStrip` sit transparent on the card host — hairline dividers
  only. Never paint a gray fact-list plane behind telemetry.
- **Create forms in flush push columns** (Station Displays claim compose golden) use **sheet-band
  fields** from `DenseComposeFields` — underline Subject + full-bleed sunken Body (`inset-field`
  only on the textarea). That sunken band is the **only** depth-indent gray for
  notes · ticket/claim create/edit — not for read fact rows. Never nested
  `rounded-lg border` boxes, `TextField`, or `WORKSPACE_NESTED_FIELD` for that job.
- **One icon row in the footer, no labelled CTA band.** A second primary is the
  competing-primaries failure (P5). Workbench record-inspector floors compose
  `InspectorActionFloor` **icons-first** — `FloorIconButton` / `FloorOverflowButton`
  peers + a flush trailing `InspectorFlushDelete` child (`IconActionFloor` spread
  on canvas) — never a labelled `actions` cluster or a full-width labelled danger
  pill. Station Displays Macro verbs compose `StationDisplaysHeaderActions`
  (top band); leaf-local commit surfaces still compose `FlushTerminalFooter`
  directly. Micro per-row actions stay on
  `IconButton size="md"`.

### Anti-patterns

| Don't | Do |
|---|---|
| Card soup — one bordered card per fact group | `<section>` eyebrows in one scroll |
| Chat bubbles as the record surface | Fact rows; the conversation lives in threads |
| A narrative sentence assembled from fields | Label + value, one fact per row |
| A serial or tracking number set in the sans cut | `mono` (or the typed `CopyChip`) |
| A second primary CTA beside the footer band | One commit per beat |

**Adoption note (2026-08-06):** Desk table click mounts tabbed `ShippedDetailsPanel` →
`ShippedDetailsBody` (durable edit/notes). Non-desk stack opens use
`CompactOrderPeek`. Search feedback is `SearchOrderFeedback` on `/search` — a different
job; it may compose fact atoms. `/o/[id]` is retired. Migrate a rail's body when you
are already editing it; do not open a sweep.

## Two chrome families (do not cross)

| Family | Component | Use for |
|---|---|---|
| **Record / queue inspector (orders desk)** | `DeskRailChromeRow` + Unbox `SectionTabsSlider` density=icon | Selected-order `detail:order` (`ShippedDetailsPanel`) |
| **Record / queue inspector (Incoming-family)** | `DeskRailChromeRow` | Unbox-aligned Desk card: Incoming · Unfound · Bin · Support-context · History |
| **Intake / create overlay** | `SidebarIntakeFormShell` | Empty-form create / import wizards (`detail:new-order`, `detail:incoming-import-ebay`, FBA create, grid column prefs) |

If a surface starts as intake and later becomes “open a row and resolve it,” **migrate the header to `PaneHeader` / `DeskRailChromeRow`** — do not stretch the intake shell’s title prop to hold the row’s product name.

---

## Contextual icons

Different rails own different action contracts. Pass them in; do not fork a second header:

| Occupant (examples) | Typical icon actions |
|---|---|
| `detail:order` | Locked Displays topics + ⋮ handoffs; Order-tab `OrderUpdateDock` for Assign · urgent · notes · ship · flush Delete |
| `detail:history` | **Receiving golden** — index→leaf topics + slim identity key; record actions (primary CTA `historyInspectorPrimaryAction` · More · flush Delete carton) dock on the bottom `InspectorActionFloor` (n=1). No CTA on the identity band; no `PaneHeaderTabs` / `PaneHeaderActionBar` |
| `detail:incoming` | Sync |
| `detail:catalog-link` | Link listing · Ignore |
| `detail:import-exception` | Resolve · Ignore |
| `detail:claim` | Print · Square · … |

Trailing cluster is always **`>| · ↑ · ↓`** when the rail walks a queue; close alone when it does not.

---

## Checklist (new right-rail occupant)

1. `DetailStackRailRegistrar` / `useRegisterRightPanel` — no private geometry.  
2. `modal={false}` for record peeks; stable id when row→row is the loop.  
3. Header is **chrome → Displays topics → flush body** for desk `detail:order` (`DeskRailChromeRow` + `SectionTabsSlider` density=icon — Unbox twin; no identity row). History keeps chrome → Display tabs → identity (+ primary CTA). Orders sheet View = `detail:orders-view` only.  
4. No `SidebarIntakeFormShell` on a record inspector.  
5. No `stationMoreDetailsPaneHostClass`, no `rightSlot` close, no `variant="card"` ActionBar pill.  
6. Long titles / prose only in the scroll body.  
7. Push / resize / collapse per Right-rail modality SoT (`edgeCollapse={false}` when header `→|` is the only dismiss — Incoming).
