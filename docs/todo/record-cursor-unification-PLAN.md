# Record cursor unification — one grouping, one open, one up/down

**Created 2026-08-01.** A codebase **simplification** plan, not a feature plan. It
precedes the remaining display work in
[`right-panel-display-HANDOFF.md`](right-panel-display-HANDOFF.md) §3.1 — that
handoff says "prev/next and close must be one cluster on the top row", and this
plan is what makes that a *one-place* change instead of a seven-place change.

**Scope:** how a record gets **imported into** the detail panel (opened), how the
panel **displays** its position, and how **up/down** steps to the next one — with
the same grouping and ordering rules the grid on screen is already using.

---

## 0. One-sentence goal

Replace **seven** ad-hoc record-navigation channels and **five** copies of
`findIndex → ±1 → open` with **one pure cursor model + one module store**, so
every collection surface publishes its on-screen order once and every right-rail
panel inherits `up · down · position · disabled` without wiring anything.

---

## 1. What is actually there today (measured, not assumed)

### 1.1 Seven channels for one job

| # | Channel | Dispatchers | Listeners | Notes |
|---|---|---|---|---|
| 1 | `navigate-shipped-details` (window event) | `ShippedDetailsPanel.tsx:188`, `useOutboundQueueKeyboard.ts:100,125` | **3** — [`useOrdersQueueSelection.ts:109`](src/components/dashboard/orders-queue/useOrdersQueueSelection.ts:109), [`useShippedDetailsSelection.ts:52`](src/components/shipped/dashboard-table/useShippedDetailsSelection.ts:52), [`useStationDetailsSelection.ts:68`](src/hooks/station/useStationDetailsSelection.ts:68) | Three listeners, three row types, three copies of the same math |
| 2 | `receiving-navigate-table` | `IncomingDetailsHeader.tsx:93`, `UnboxLineWorkspace.tsx:188`, `TriageLineWorkspace.tsx:94`, `useReceivingLineNavigation.ts:191` | **2 contending** — [`useReceivingTableNavigation.ts:66`](src/components/station/useReceivingTableNavigation.ts:66) and [`useSidebarRail.ts:434`](src/components/sidebar/rail-shell/useSidebarRail.ts:434) | Both listen to the same name; arbitrated by a `tableNavEnabled` boolean the table must remember to pass |
| 3 | `receiving-navigate-detail-overlay` | `ReceivingDetailsStack.tsx:278,285` | **ZERO** | See §2.1 — these chevrons are dead buttons |
| 4 | `receiving-highlight-line` | `useReceivingLineNavigation.ts:168,178`, `useReceivingDeepLink.ts:64` | `useReceivingRowSelection.ts:135` | A *second* receiving channel that exists only because channel 2's handler has a side effect the caller did not want |
| 5 | `testing-navigate-rail` | shared header via `WORKSPACE_MODES.navChannel` | `TestingRecentRail.tsx:132` | Same shape as 2, different name |
| 6 | Prop-drilled `onMoveUp` / `onMoveDown` / `disableMoveUp` / `disableMoveDown` | `RepairTable.tsx:194`, `FbaOutboundWorkspace.tsx:246` | — | Only these two compute a real disabled state |
| 7 | `SidebarRailShell` internal `visibleIndices` walk | `useSidebarRail.ts:399–436` | — | The only implementation that steps **visible** rows |

### 1.2 Five copies of the same four lines

```ts
const i = list.findIndex((r) => id(r) === current);
const next = list[i + (dir === 'up' ? -1 : 1)];
if (next) open(next);
```

A pure version already exists — [`resolveDetailsNavigation`](src/components/station/station-table-logic.ts:16),
with unit tests. **Exactly one of the five call sites uses it**
(`useStationDetailsSelection`). The other four re-typed it.

### 1.3 Two copies of "flatten the grouped render order"

Both surfaces already agree on the *shape* — `[dateKey, RowGroup<T>[]][]` — and
both then flatten it by hand:

- [`useOrdersQueueRows.ts:130`](src/components/dashboard/orders-queue/useOrdersQueueRows.ts:130)
  — `orderGroupsByDate.flatMap(([, groups]) => groups.flatMap((g) => g.rows))`
- [`useReceivingGrouping.ts:142`](src/components/station/useReceivingGrouping.ts:142)
  — the same walk with a different sort comparator inline

`src/lib/group-rows.ts` owns `groupRowsBy` and `RowGroup<T>` and stops there. The
flatten is the missing half of that SoT.

### 1.4 Which panels even have up/down

| Panel | Occupant id | up/down | Position readout | Disabled at the ends |
|---|---|---|---|---|
| `ShippedDetailsPanel` (order) | `detail:order` | ✅ ch.1 | ✗ | ✗ — steps off the end silently |
| `IncomingDetailsPanel` | `detail:incoming` | ✅ ch.2 | ✗ | ✗ |
| `RepairDetailsPanel` | `detail:claim` | ✅ ch.6 | ✗ | ✅ |
| `FbaBoardDetailPanel` | `detail:fba-plan` | ✅ ch.6 | ✗ | ✅ |
| `ReceivingDetailsStack` | `detail:receiving` | ⚠️ **dead** ch.3 | ✗ | ✗ |
| `UnfoundQueueDetailsPanel` | `detail:unfound` | ✗ | ✗ | — |
| `SkuDetailView` (panel) | `detail:sku:<sku>` | ✗ | ✗ | — |
| `SupportContextDetailPanel` | `detail:support-context:<id>` | ✗ | ✗ | — |
| `MyDayTaskInspector` | (registrar) | ✗ | ✗ | — |
| `SearchDetailWorkspace` | (registrar) | ✗ | ✗ | — |
| Testing `box:` / `manifest:` | per-entity | ✗ | ✗ | — |

26 files mount `DetailStackRailRegistrar` / `useRegisterRightPanel`; 4 working
up/down implementations; 1 dead one; 0 position readouts anywhere.

---

## 2. The defects this shape produces

Each is a concrete failure, not a style complaint.

### 2.1 A shipped panel has two dead chevrons

`receiving-navigate-detail-overlay` has **no listener anywhere in `src/`**
(verified by grep, including dynamic `addEventListener` templates — the only one
is `cache.ts:162`, a different prefix). Open receiving details from any host,
click ↑ or ↓: nothing happens, no error, no disabled state. The buttons render
enabled because nothing computes a bound.

### 2.2 Up/down steps into rows that are not on screen

`QueueGroupRow.tsx:49` mounts `CollapsibleGroupRow` **uncontrolled** — no
`expanded` prop, `defaultExpanded` false. So a multi-line order renders as one
collapsed summary. But `displayedRecords` (`useOrdersQueueRows.ts:130`) flattens
*every* group's rows including the hidden children.

**Failure:** a day band holds order A (3 lines, collapsed) and order B. Inspector
open on the row above A. Press ↓ → the panel loads A-line-1, a row the operator
cannot see and the grid does not highlight. Press ↓ twice more before anything
appears to move. The panel and the grid disagree about what "next" means.

`grid-row-index.ts:16–18` records the opposite ruling for *ARIA* indices —
"indices are computed as if every fold were expanded… this module never needs to
know a fold's expanded state — which lives inside `CollapsibleGroupRow` and is
deliberately not lifted." That is correct for `aria-rowindex` (WAI-ARIA wants
stable numbering under collapse) and wrong for navigation. **Two different
questions currently share one answer**, and §3.3 resolves them separately.

### 2.3 Ambient arrow keys steal Escape/arrows from open overlays

`useOutboundQueueKeyboard.ts:75` is the **only** keyboard owner in the codebase
that consults `hasOpenOverlay()`. Its own docblock explains why:

> The typing-target test above only covers input/textarea editors, never
> button-and-menu popovers.

[`useReceivingLineNavigation.ts:183`](src/components/sidebar/receiving/useReceivingLineNavigation.ts:183)
binds a window `keydown` for ArrowUp/ArrowDown and guards **only**
`target?.closest('input, textarea, select, [contenteditable]')`. Same for
`useSidebarRail`, `StationHistoryTable`, `usePhotoGridKeyboardNav`.

**Failure:** on `/unbox` with a cell editor's dropdown or a house `DropdownMenu`
open, ArrowDown moves the *carton selection* underneath instead of the menu's
highlighted option. This is the exact bug `.claude/rules/source-of-truth.md` →
Escape ownership was written after.

### 2.4 A channel got cloned to dodge a side effect

`useReceivingLineNavigation.ts:156–160`:

> We avoid dispatching `receiving-select-line` because that handler wipes
> `scanMatchedRows` (row-click semantics) and would break subsequent nav.

That is the honest note of a fork. "Open this record because the operator clicked
it" and "open this record because the operator stepped to it" are genuinely
different intents, and the codebase expressed that difference by minting a second
event name rather than by carrying the intent. §3.2 carries it as a field.

### 2.5 Two headers must each implement the new grammar

`right-panel-display-HANDOFF.md` §4 already names it: `ShippedDetailsHeader` and
`OrderIdentityHeader` render the same identity band + action bar and diverge only
in tabs; `ShippedDetailsPanel` picks on `isOrderRecord`. §3.1 of that handoff
(icon row + `up · down · close`) therefore has to be written **twice** — and the
handoff also warns the dashboard's Pending/Tested lanes reach the panel with
context `'fulfillment'`, so which branch renders is not obvious. Two reverts have
already been caused by that mismatch.

---

## 3. The design

Three modules, each pure or near-pure, each following a pattern this codebase
already runs.

### 3.1 Grow `group-rows.ts` — the render order becomes a named type

`src/lib/group-rows.ts` (pure, no imports) gains:

```ts
/** The canonical on-screen order of a grouped collection: bands → folds → rows. */
export type GroupedRenderOrder<T> = ReadonlyArray<readonly [string, ReadonlyArray<RowGroup<T>>]>;

/** Flatten to the flat leaf order the grid paints. `expandedKeys` omitted =
 *  every fold treated as open (the pre-fold-state behaviour, unchanged). */
export function flattenRenderOrder<T>(
  order: GroupedRenderOrder<T>,
  expandedKeys?: ReadonlySet<string>,
): T[];
```

`useOrdersQueueRows` and `useReceivingGrouping` delete their hand-rolled flatten
and call this. Their *comparators* stay where they are — sorting is domain
knowledge, flattening is not.

### 3.2 New: `src/lib/record-cursor/cursor-model.ts` — pure, dependency-free

Same contract as [`selection-occupancy.ts`](src/lib/right-rail/selection-occupancy.ts)
and `carton-inspector-model.ts`: no React, no fetch, no imports beyond
`group-rows`, runs under `node --test` with zero setup.

```ts
export type CursorIntent = 'click' | 'step' | 'scan' | 'deep-link';

export interface RecordCursor {
  /**
   * 1-based position in the **fold-blind** order — amended 2026-08-01, see below.
   * (Originally specified as "among the rows the operator can currently see".)
   */
  position: number | null;
  total: number;
  prevId: string | number | null;
  nextId: string | number | null;
  /** Set when the target sits inside a collapsed fold — the surface must
   *  reveal this group key before/with the open. §3.3. */
  revealGroupKey: string | null;
}

export function resolveRecordCursor<T>(args: {
  order: GroupedRenderOrder<T>;
  expandedKeys: ReadonlySet<string>;
  openId: string | number | null;
  getId: (row: T) => string | number;
}): RecordCursor;
```

`resolveDetailsNavigation` (`station-table-logic.ts:16`) is **absorbed** — its
four tests are carried into `cursor-model.test.ts` verbatim so the absorption is
provably behaviour-preserving. It is **deleted in Phase 3**, not Phase 0:
`useStationDetailsSelection` still calls it until the station rails migrate.

**Amendment (2026-08-01) — `position` / `total` are FOLD-BLIND.** The original
spec said "among the rows the operator can currently see". The implementation
counts the fold-blind order instead, and that is the better answer for two
reasons the spec had not worked through: under *reveal-never-skip* every record
is reachable, so the visible order is not the navigation domain; and a `total`
that jumped when the operator opened an unrelated fold is worse than one that
counts rows behind a chevron. It also removes §3.3's claimed conflict with
`grid-row-index.ts` — both are fold-blind, for the same reason. Recorded here
rather than left as a silent divergence between doc and code.

`CursorIntent` is what §2.4 needed: `open(record, { intent: 'step' })` lets the
receiving selection handler keep `scanMatchedRows` on a step and clear it on a
click, without a second event name. It is a **required, undefaulted** parameter —
`backend-patterns.md` → *A safety classification is a REQUIRED parameter*: the
same trap as `recordView` and `scanKind`, where a default silently opted in every
call site nobody visited.

### 3.3 Fold state: lift it, and **reveal — never skip**

`CollapsibleGroupRow` already accepts controlled `expanded` / `onToggle`
(`CollapsibleGroupRow.tsx:53`), so this is additive, not a fork.

A new `useFoldState(surfaceKey)` owns a `Set<string>` of expanded group keys and
is passed to the group renderers (`QueueGroupRow`, `ReceivingGridGroupRow`,
`IncomingGridGroupRow`, `PickupGridGroupRow`, `ReceivingPoSummary`).

**Rule: stepping into a collapsed fold EXPANDS it and lands on its first child.**
Not skip-the-fold, and not step-into-the-invisible. Skipping would make a record
unreachable by keyboard, which is worse than the current bug; the cursor returns
`revealGroupKey` and the surface expands before it opens.

This does **not** contradict `grid-row-index.ts`. That module answers
`aria-rowindex` and must stay fold-blind per WAI-ARIA. The cursor answers "what
can the operator see right now", which is a different question with a different
answer. Both docblocks get a cross-reference so the next reader does not
"unify" them.

### 3.4 New: `src/lib/record-cursor/store.ts` — one module store

**React context cannot carry this.** A panel registers its `children` element
into `right-rail/store.ts` and `RightRailHost` renders it; context resolves at
the *render* position, so the panel would read the host's tree, not the grid's.
The house answer to exactly this problem already exists three times —
`right-rail/store.ts`, `overlay-stack/store.ts`, `assistant/context-store.ts`:
a module-level subscribe/emit with a cached snapshot for `useSyncExternalStore`.

```ts
publishRecordCursor({ surfaceId, cursor, open, close });  // one live publisher
subscribeRecordCursor(fn); getRecordCursor();
```

**One publisher at a time**, keyed by `surfaceId`, last-mounted wins — the same
stack discipline as `scan-hotkey/store.ts`. A surface that unmounts withdraws its
publication, and the panel's chevrons go disabled rather than silently stepping a
list that is no longer on screen.

### 3.5 The React seam

```ts
// Collection surface (grid host) — publishes once.
usePublishRecordCursor({ surfaceId, order, expandedKeys, openId, getId, onOpen });

// Any right-rail panel — consumes, wires nothing.
const { onPrev, onNext, prevDisabled, nextDisabled, position, total } = useRecordCursor();
```

### 3.6 The display half: one `RecordPaneHeader`

Merge `ShippedDetailsHeader` + `OrderIdentityHeader` into one component with a
`tabs?` slot (the handoff's §4 ask), and have it call `useRecordCursor()` itself.
Panels stop passing `onMoveUp` / `onMoveDown` / `disableMoveUp` entirely.

Header grammar per `.claude/rules/source-of-truth.md` → Right-rail modality →
Panel header grammar:

```
[ icon actions … ]                          [ 3 / 47 ]  [ ↑ ] [ ↓ ] [ ✕ ]
```

- Actions are icon-only (`PaneHeaderActionBar iconOnly`, which preserves `label`
  as `aria-label` — `dashboard-bulk-actions.spec.ts` reads those strings).
- `up · down · close` is one right-aligned cluster, in that order.
- **`position / total` is new and is the point.** A panel that can step has to
  say where it is, or the operator cannot tell a disabled chevron from a broken
  one — which is precisely how §2.1's dead buttons survived. Render it as
  `text-role-micro tabular-nums text-text-soft`; hide it when no cursor is
  published (a panel opened from search, not from a queue).
- `PaneHeaderActionBar` keeps its raw `onPrev`/`onNext` props for the non-record
  station toolbars; the record panels stop using them.

### 3.7 Keyboard, once

`useOutboundQueueKeyboard` generalises into `useRecordCursorKeyboard()` — `j`/`k`,
`↑`/`↓`, `Enter`, `Esc`, driving the store instead of the shipped event bus. It
keeps its `hasOpenOverlay()` bail-out, and every ambient arrow-key owner in §2.3
either adopts it or gains the same guard. The receiving nav's own listener is
deleted, not guarded — it becomes a duplicate.

---

## 4. Phases

Each phase is independently shippable and independently verifiable. **No phase
raises a DS ratchet baseline.**

### Execution split — ultracode runs 0–1, the rest is a handoff

| Part | How it runs | Why |
|---|---|---|
| **Phase 0 + 1** | **ultracode** (multi-agent) | This is where every downstream decision gets made: the cursor API, the fold-reveal semantics, the store's ownership rule. It is deep-context, adversarial-review-shaped work, and it produces the **reference implementation** the rest copies. Getting it wrong is expensive; getting it independently refuted before it ships is cheap. |
| **Phases 2 – 6** | **handoff prompt** (§11) | Mechanical repetition of a settled pattern across ~8 surfaces, plus one shared-primitive change that is *Ask first* by house rule. Repetition against a proven reference does not need a design panel — it needs a clear prompt and the guard from Phase 6. |

The split is deliberate: fan-out is worth paying for where the answer is
uncertain, not where it is already written down.

### Phase 0 — pure core, zero call sites (no behaviour change)

1. `group-rows.ts` ← `GroupedRenderOrder<T>` + `flattenRenderOrder`.
2. `src/lib/record-cursor/cursor-model.ts` + `cursor-model.test.ts`
   (absorb the 4 tests from `station-table-logic.test.ts`, add: fold collapsed →
   `revealGroupKey`; open row not in order → null cursor; empty order; both ends).
3. `src/lib/record-cursor/store.ts` + `store.test.ts` (publisher swap, withdraw,
   last-mounted-wins).

**Verify:** `npx tsx --test src/lib/record-cursor/*.test.ts`. Nothing else moves.

### Phase 1 — dashboard orders (the golden surface)

`useOrdersQueueRows` flattens via the SoT · `OrdersGridView` publishes the cursor
and owns fold state · `QueueGroupRow` takes controlled `expanded` ·
`ShippedDetailsPanel` reads `useRecordCursor()` · `useOrdersQueueSelection` and
`useShippedDetailsSelection` drop their `navigate-shipped-details` branches ·
`useOutboundQueueKeyboard` → `useRecordCursorKeyboard`.

**This is where §2.2 is fixed and proven.** E2E: collapse a multi-line order,
step past it, assert the fold expands and the landed row is the highlighted one.

### Phase 2 — receiving family (the biggest collapse)

`useReceivingGrouping` flattens via the SoT · `ReceivingLinesTable` publishes ·
`IncomingDetailsPanel`, `ReceivingDetailsStack` read the cursor. Deletes:
channels **2, 3, 4, 5** and the `tableNavEnabled` arbitration boolean that only
existed because two listeners shared one event name. `WORKSPACE_MODES.navChannel`
loses its field; the mode registry keeps its other five.

⚠️ **`receiving-select-line` keeps its `intent`.** Thread `CursorIntent` as a
required field so `scanMatchedRows` clears on `'click'` and survives `'step'` —
that is §2.4's fork, folded back in. Do not default it.

### Phase 3 — Repair · FBA · Testing rails

Delete the `onMoveUp` / `disableMoveUp` prop chains (`RepairTable.tsx:194`,
`FbaOutboundWorkspace.tsx:246`); those surfaces publish instead.
`useSidebarRail`'s `visibleIndices` walk becomes a cursor publication — it is the
only existing implementation that already steps *visible* rows, so it is the
behavioural reference, not a casualty.

### Phase 4 — the panels that never had up/down

Unfound, SKU (panel variant), Support context, My Day, Search detail, Testing
box/manifest. Most need only `useRecordCursor()` + the header; a few have no
publishing surface behind them, and those correctly render **no** chevrons —
`useRecordCursor()` returns a null cursor and the header omits the cluster.
That is the honest-absence rule, not a gap.

### Phase 5 — the station display strip (`SectionTabsSlider`)

Same family, same failure mode: a strip whose membership and width rules are
authored per call site instead of resolved once. Evidence is the Unbox Displays
strip in its shipped state — **"Checklist" and the "CLASSIFY" eyebrow render on
top of each other**, and the accent-filled ⋯ covers the `rightSlot` pencil.

Four causes, all in [`SectionTabsSlider.tsx`](src/design-system/components/SectionTabsSlider.tsx):

1. **The rail cannot shed a tab.** `fit="hug"` resolves to `w-max` +
   `shrink-0` per tab (`TabSwitch.tsx:142–143`). The parent is `min-w-0`, so the
   *box* shrinks while the *content* keeps its intrinsic width and overflows —
   painting over whatever flex sibling follows it.
2. **Two names for one display.** `showLabel` (`:107`) mounts an eyebrow with the
   active tab's label **beside** a strip that already labels its tabs. That
   eyebrow is the "CLASS…" in the screenshot, and the thing it collides with is
   the strip's own last tab. It exists only because a bare ⋯ can't say what's
   active — a gap the layout below closes properly.
3. **Overflow membership is static.** `priority: 'overflow'` is hardcoded at the
   call site (`unbox-tabs.tsx:160, 239, 265, 288`), so the partition cannot
   respond to available width. `classifyOnStrip` conditionally promotes one tab,
   which is how Classify ended up on the strip *and* driving `overflowActive`
   styling at the same time.
4. **⋯ and `rightSlot` are unseparated siblings.** ⋯ renders inside the
   `TabSwitch` `trailing` slot; `rightSlot` renders in the outer row. Once (1)
   overflows, they overlap.

**Target layout (the ask):** each tab becomes an **icon over its label**, the ⋯
pins to the far right of the row, and the eyebrow is deleted.

```
┌──────────────────────────────────────────────────────────┐
│   ⧉        ⣿        ▤        ☑                      ⋯    │
│ Listings  Units 1  Zoho   Checklist                 ✎    │
└──────────────────────────────────────────────────────────┘
```

Why this fixes rather than restyles:

- A stacked cell is roughly **half** the inline width, so the common strip stops
  overflowing at all.
- The active display always names itself in its own cell → cause (2) is deleted,
  not worked around, and the ⋯ no longer needs an accent fill to compensate.
- ⋯ leaves `TabSwitch trailing` and becomes a real right-aligned peer of
  `rightSlot`, with the hairline between them → cause (4) gone.
- Membership becomes **measured, not authored**: keep `priority` as a *hint*
  (a tab marked `overflow` never gets promoted), but let a `ResizeObserver` on
  the rail demote primaries right-to-left until they fit. Cause (3) gone.
  Authored-only is what makes the strip break at one specific width.

Constraints this must not violate:

- `ui-design-system.md` → **Icons: structural and paired**. Icon-over-label is
  still paired — the label is present, not replaced by a tooltip. An icon-only
  cell here would be a new violation.
- Type roles: label stays `text-role-micro` (bakes 600 + the condensed cut), so
  a stacked cell does not grow the row past the existing `min-h-9` band.
- `station-workbench.md` — the strip lives in the right-edge **Displays push
  column**, not the workbench body. Unchanged.
- `SectionTabsSlider` is shared (Unbox Displays, Testing, Triage, Timeline
  spine switcher). Changing its layout is a **public API change to a shared
  primitive** — `pattern-evolution.md` → *Ask first*. Land it behind an opt-in
  `density="stacked"` prop, migrate Unbox Displays first, then promote once a
  second surface adopts it.

### Phase 6 — header merge + guard

`RecordPaneHeader` replaces `ShippedDetailsHeader` + `OrderIdentityHeader`
(handoff §4). New guard `src/lib/record-cursor/record-cursor.guard.test.ts`,
shrink-only in the house style:

1. No new `CustomEvent('*-navigate-*')` outside `record-cursor/`.
2. No `findIndex(...) + 1` step outside `cursor-model.ts` (AST-lite scan, same
   shape as `lookup-scan-wiring.guard.test.ts`).
3. Every `DetailStackRailRegistrar` mount whose surface publishes a cursor
   renders the up/down cluster (walks the registrar call sites on disk, the way
   `grid-surface-capabilities.guard.test.ts` walks `<LedgerGrid` mounts — that
   two-half design is what caught the two undeclared grids the hand list missed).
4. Every ambient arrow/Escape `keydown` listener calls `hasOpenOverlay()`.

---

## 5. What this deletes

| Thing | Before | After |
|---|---|---|
| Navigation channels | 7 | 1 store |
| `findIndex → ±1 → open` copies | 5 | 1 pure fn |
| "Flatten the grouped order" copies | 2 | 1 in `group-rows.ts` |
| Order-panel headers | 2 | 1 |
| Ambient keyboard owners without an overlay guard | 4 | 0 |
| Dead nav channels | 1 | 0 |
| Panels that can step but cannot say where they are | all | 0 |
| Names rendered for the active display | 2 (tab + eyebrow) | 1 |
| Strip overflow rules | authored per call site | measured once |

---

## 6. Non-goals

- **Push / width-order-of-sacrifice** (`right-panel-display-HANDOFF.md` §3.3) —
  independent; the cursor is orthogonal to whether the panel pushes or floats.
- **Modality.** Settled 2026-07-31; not reopened.
- **`aria-rowindex` semantics.** `grid-row-index.ts` stays fold-blind (§3.3).
- **Selection cardinality.** `selection-occupancy.ts` already owns
  1→inspect / 2→compare / 3+→batch. The cursor is about *which* record, never
  *how many*; a cursor is published only in the `inspect` kind.
- **`ContextualSelectionBar` / bulk actions** — `order-rail-selection-plane-PLAN.md` D2.
- **`SidebarRailShell` row rendering** — only its nav walk is touched.
- Anchored field editors and wizards (LabelEdit, Prebox, UnitSlots …) — deferred
  in the absorbed handoff, still deferred; they are not record planes.

---

## 7. Two calls I made, and one I did not

**Made — reveal, not skip** (§3.3). Skipping a collapsed fold makes records
keyboard-unreachable; that is a worse bug than the one being fixed. If you want
skip instead, it is one branch in `resolveRecordCursor`.

**Made — position readout is in scope.** It is the smallest thing that makes a
broken chevron visible, and §2.1 is the proof that invisible breakage survives
for months.

**Not made — does `j`/`k` go house-wide?** Today only the outbound queue binds
them; receiving binds bare arrows. Unifying the *mechanism* (Phase 3) does not
force one *binding*. I would ship arrows everywhere and `j`/`k` everywhere too,
but that changes muscle memory on the receiving benches, so it is a product call.
Flag it before Phase 2 lands; the store does not care either way.

---

## 8. Verify

Per phase: `npx tsx --test` on the touched pure modules, then

```bash
npx playwright test dashboard-bulk-actions dashboard-selection-handoff queue-inspector-non-modal receiving-row-planes --project=qa-desktop
```

```bash
npm run verify
```

**Known-red and NOT from this work** (carried from the handoff, re-check before
attributing): `ensure-outbound-docs.ts:122` bare `console.info` fails Lint;
`receiving-tech-modes` / `receiving-param-isolation` fail on a stale
`role="complementary"` anchor; `dashboard-inspector-non-modal` → *resizable,
clamps to the derived cap* on an unscoped `edge-resize-collapse` locator.

Guardrails: attach to the dev server on **`:3050`**, never start or kill one.
E2E on the **QA org** only. The user manages commits — stage only your own files.

---

## 9. Key files

Handoff prompt for Phases 2–6: **§10**.

| Role | Path |
|---|---|
| Grouping SoT (grows) | `src/lib/group-rows.ts` |
| Cursor model (new, pure) | `src/lib/record-cursor/cursor-model.ts` |
| Cursor store (new) | `src/lib/record-cursor/store.ts` |
| Absorbed resolver | `src/components/station/station-table-logic.ts:16` |
| Dashboard order derivation (reference) | `src/components/dashboard/orders-queue/useOrdersQueueRows.ts` |
| Receiving order derivation | `src/components/station/useReceivingGrouping.ts` |
| Fold primitive (already controlled-capable) | `src/components/ui/CollapsibleGroupRow.tsx:53` |
| ARIA index (stays fold-blind) | `src/design-system/components/grid/grid-row-index.ts` |
| Keyboard reference (the only correct one) | `src/hooks/useOutboundQueueKeyboard.ts:75` |
| Rail store / host / registrar | `src/lib/right-rail/store.ts`, `src/components/right-rail/*` |
| Cardinality resolver (sibling contract) | `src/lib/right-rail/selection-occupancy.ts` |
| Header primitives | `src/components/ui/pane-header/blocks.tsx` |
| Headers to merge | `…/details-panel/ShippedDetailsHeader.tsx`, `src/components/order-record/OrderIdentityHeader.tsx` |
| Parent display handoff | `docs/todo/right-panel-display-HANDOFF.md` |
| Laws | `.claude/rules/source-of-truth.md`, `.claude/rules/display/workbench.md`, `.claude/rules/display/motion-crossfade.md` |

## 10. Handoff prompt — Phases 2 – 6

Paste into a new session **after Phase 0 + 1 are green**. Do not start it before
then: every instruction below points at a reference that Phase 1 creates.

```
Implement Phases 2–6 of docs/todo/record-cursor-unification-PLAN.md.

Phases 0 and 1 are DONE and are your reference. Read them in code first:
  src/lib/record-cursor/cursor-model.ts   — the pure model (do NOT change its API)
  src/lib/record-cursor/store.ts          — the publisher store
  src/lib/group-rows.ts                   — flattenRenderOrder / GroupedRenderOrder
  src/components/dashboard/orders-queue/  — the golden surface: how a grid publishes
  src/components/shipped/ShippedDetailsPanel.tsx — how a panel consumes

Your job is REPETITION of that pattern, not redesign. If a surface seems to need
a model change, stop and report it instead of widening the API.

Phase 2 (receiving family) — the biggest collapse, do it first:
  - useReceivingGrouping flattens via flattenRenderOrder (delete the hand-rolled walk)
  - ReceivingLinesTable publishes the cursor; IncomingDetailsPanel and
    ReceivingDetailsStack consume it
  - DELETE channels: receiving-navigate-table, receiving-navigate-detail-overlay
    (it has ZERO listeners today — the chevrons are dead), receiving-highlight-line,
    testing-navigate-rail, and the tableNavEnabled arbitration boolean
  - WORKSPACE_MODES loses navChannel; its other fields stay
  - receiving-select-line gains a REQUIRED, UNDEFAULTED CursorIntent so
    scanMatchedRows clears on 'click' and survives 'step'. A default here re-creates
    the exact bug the second event name was minted to dodge
    (.claude/rules/backend-patterns.md — a safety classification takes no default).

Phase 3: delete the onMoveUp/disableMoveUp prop chains in RepairTable.tsx and
FbaOutboundWorkspace.tsx; those surfaces publish instead. useSidebarRail's
visibleIndices walk becomes a publication — it is the ONLY existing implementation
that already steps visible rows, so treat it as the behavioural reference, not a
casualty.

Phase 4: Unfound, SKU (panel variant), Support context, My Day, Search detail,
Testing box/manifest consume the cursor. Where no surface publishes, the header
correctly renders NO chevrons — honest absence, not a gap to fill.

Phase 5 (SectionTabsSlider): icon-over-label cells + far-right ⋯, eyebrow deleted,
membership measured via ResizeObserver instead of authored. This is a public API
change to a SHARED primitive → land it behind an opt-in `density="stacked"`,
migrate Unbox Displays only, and do not promote until a second surface adopts it.
Keep icons paired with labels (ui-design-system.md) and the label at
text-role-micro so the row does not outgrow min-h-9.

Phase 6: merge ShippedDetailsHeader + OrderIdentityHeader into one RecordPaneHeader
with a `tabs?` slot, then add src/lib/record-cursor/record-cursor.guard.test.ts
(shrink-only, house style) with the four checks in §4 Phase 6. The registrar check
must WALK THE CALL SITES ON DISK, not a hand list — see
grid-surface-capabilities.guard.test.ts for why the hand list alone stayed green
through two undeclared grids.

Traps, measured — do not rediscover these:
  - The dashboard's Pending/Tested lanes reach ShippedDetailsPanel with context
    'fulfillment', NOT 'dashboard', so isOrderRecord is false there. Two reverts
    have already been caused by assuming otherwise. Verify which branch renders.
  - grid-row-index.ts stays fold-BLIND on purpose (WAI-ARIA stable numbering under
    collapse). Do not "unify" it with the cursor; they answer different questions.
  - Every ambient arrow/Escape keydown you touch must call hasOpenOverlay().

Guardrails: attach to the dev server on :3050 — never start, restart or kill one.
E2E on the QA org only (--project=qa-desktop). Never raise a DS ratchet baseline.
The user manages commits; stage only your own files; never git stash. The tree
holds other sessions' work — check whether a red gate is yours before fixing it
(known-red list is in §8).

Verify per phase with npx tsx --test on touched pure modules, then:
  npx playwright test queue-inspector-non-modal receiving-row-planes dashboard-bulk-actions --project=qa-desktop
  npm run verify

Append a Status log line to the plan when each phase completes. Do not edit the
plan otherwise.
```

## 11. Status log

| When | Note |
|---|---|
| 2026-08-01 | **Phases 0 + 1 landed (uncommitted).** Phase 0: `GroupedRenderOrder` / `flattenRenderOrder` / `foldKey` / `singleBand` / `FoldState` in `group-rows.ts` (23 tests), `record-cursor/cursor-model.ts` (25 tests), `record-cursor/store.ts` (16 tests). Phase 1: `OrdersGridView` publishes and owns fold state, `QueueGroupRow` is controlled, `ShippedDetailsPanel` reads the cursor and shows `n / m`, the two `navigate-shipped-details` dashboard listeners are gone, `useOutboundQueueKeyboard` → `useRecordCursorKeyboard`. **Design amendments the contract review forced, all kept:** fold keys are band-qualified (`groupRowsBy` keys are band-LOCAL, so one order spanning two days produced one ambiguous key); `FoldState` carries its polarity (an untagged `Set` means "all collapsed" on the queue and "all expanded" on the rail); `recordIdKey` normalizes the string/number split a URL param introduces; `CursorScope` splits receiving's record and sibling cursors; `CursorIntent` gained `'auto'`; per-direction `revealFoldKey` (prev and next can sit in different collapsed folds). |
| 2026-08-01 | **Repairs after the run — the fan-out left the tree broken and I fixed it.** `useOutboundQueueKeyboard` had been deleted with three importers still live (5 `tsc` errors) and its replacement mounted nowhere; all three lanes now mount `useRecordCursorKeyboard` and do **not** publish, because the `OrdersGridView` each renders already does. `useShippedDetailsSelection` was made zero-arg without migrating its caller. `knip.config.ts` had gained `'src/lib/record-cursor/**'` under `ignore` — the same class of move as raising a baseline; removed, and the three genuinely-unused exported types de-exported instead. `cursor-model.test.ts` did not exist, so the gate command was **falsely green** (`node --test` silently ignores a nonexistent path) — written, 25 cases. Two Escape regressions fixed: the no-publisher bail sat above the Escape branch, and the branch was gated on `position !== null`, which killed dismissal during the `?openOrderId=` boot window. The deep-link reveal latch claimed its ref before the cursor had located the record, so a link into a collapsed fold left it collapsed — §2.2 in new clothes. `scope` was defaulted at both consumer seams and is now required. `CursorPositionReadout` moved from the shipped header into `ui/pane-header`. |
| 2026-08-01 | **Gate state: Lint ✓ Typecheck ✓ Unit+DS guards ✓ route-permission ✓ route-auth ✓ schema ✓ doc-catalog ✓; knip ✗ on `src/lib/packing/kit-part-document.ts → KitPartDocumentSource` — untracked, no git history, another session's file.** No baseline raised (knip count moved 3072→3035, downward). **E2E did not run:** `global-setup.ts:96` fails `account signin failed (401): INVALID_CREDENTIALS` against the QA org — an environment/credentials problem, unrelated to this change and not fixable from here. Phase 1 is therefore **verified by typecheck + unit tests only**; the collapsed-fold step and the `n / m` readout still need a browser assertion before §10's handoff starts. |
| 2026-08-01 | **Known-open in Phase 1, deliberately deferred to Phase 6:** close still renders in `PaneHeader`'s top-row `rightSlot` while prev/next sit in `belowSlot`, so `up · down · close` is not yet one cluster, and neither header passes `iconOnly`. Both headers must change identically until they merge, which is exactly why the merge is its own phase. Also low: `OrdersGridView`'s step-scroll uses an unscoped `[data-order-row-id]` selector, an attribute four grid families emit. |
| 2026-08-01 | Phase 5 added — the `SectionTabsSlider` display strip. Same failure family (membership + width authored per call site). Shipped-state evidence: the Unbox Displays strip paints "Checklist" and the "CLASSIFY" eyebrow on top of each other and the accent ⋯ covers the `rightSlot` pencil. Target = icon-over-label cells + far-right ⋯, behind an opt-in `density` prop because the primitive is shared. |
| 2026-08-01 | Plan filed. Inventory measured from live call sites: 7 channels, 5 duplicate resolvers, 2 flatten copies, 1 dead channel (`receiving-navigate-detail-overlay`, zero listeners), 1 of 4 ambient keyboard owners guarding the overlay stack. Nothing implemented. |
</content>
</invoke>
