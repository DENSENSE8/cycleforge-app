# Right panel (detail rail) — display rework + push HANDOFF

**Created 2026-08-01.** Single handoff for the right detail panel. It **absorbs
and supersedes** `queue-inspector-non-modal-rail-HANDOFF.md` (the non-modal
migration — done; its outcome is §2 here, its status log is §8) and coordinates
with `order-rail-selection-plane-PLAN.md` (the selection plane — Phases 0–3 done).

**One surface, one handoff.** The two documents were describing the same panel
from different angles and had begun to disagree: the non-modal handoff's §2 still
listed "Navigators push, inspectors float" as locked law, which the 2026-08-01
ruling reverses.

---

> **Note 2026-08-05:** `isOrderRecord` / `context==="dashboard"` body fork is **demolished**. Desk inspector is always tabbed `ShippedDetailsBody`. See `order-details-page-EXECUTION-PLAN.md` §1.

## Paste this into a new session

> Read `docs/todo/right-panel-display-HANDOFF.md`. Do not re-open §2 (settled) or
> the parent plan's D1–D8 except D-float, which §3 supersedes.
>
> Job: rework the right detail panel's display and simplify the code behind it.
> Three requirements, in priority order:
>
> 1. **Action icons are the TOP row of the panel header.** No labelled button
>    block anywhere in the panel.
> 2. **The far right of that row is `close · up · down`**, one right-aligned
>    cluster, in that order.
> 3. **The panel PUSHES the work surface.** It takes width from the LEFT first —
>    collapse/displace the spine, then the context rail — and only overlays if
>    the grid still cannot seat its minimum content width.
>
> The SoT docs are already amended for #3 (`AGENTS.md` hard laws +
> `.claude/rules/source-of-truth.md` → Right-rail modality). Implement to those.
> Verify by call site, not by docblock.

---

## 1. What is DONE (2026-08-01, uncommitted on `main`)

`tsc` clean on every touched file.

- **Action icons moved into the pane header.** `useRailHeaderActions()`
  (`src/components/dashboard/rail/OrderRailActions.tsx`) maps live selection
  actions → `PaneHeaderActionBarAction[]`; `ShippedDetailsPanel` appends them to
  `headerBarActions`. The footer `<RailActionRegion />` is gone from the inspector.
- **Duplicate Delete fixed** (2 red buttons on one record → 1). The rail action
  set drops `delete`: destroying the record in hand belongs to the record's own
  control, not to a multi-select set that happens to hold one row.
- **Close button added where it was missing.** `ShippedDetailsHeader` was
  *swallowing* the prop (`onClose: _onClose; void _onClose;`) behind a stale
  comment claiming "close lives on RightRailHost (backdrop / Esc)" — untrue since
  the panel went non-modal, so the lanes operators actually work (Pending /
  Tested) had **no visible dismiss at all**. `OrderIdentityHeader` never had one.
  Both now render `PaneHeaderCloseButton`; `RailSelectionBand` takes `onClose` too.
- **`FirstScanOnboardingCard` removed** from the outbound sidebar
  (`UnshippedSidebar`). Still mounted in `MyDayOnboardingPanel` — delete there too
  if unwanted everywhere.
- **Selection plane Phase 3 (compare pane)** landed alongside: pure
  `order-compare-model.ts` + 19 unit tests, `OrderRailCompare.tsx`
  (`detail:order-compare`), `tests/e2e/dashboard-rail-compare.spec.ts`.
- **A pre-existing D4 bug fixed:** clearing the rail left one row checked. The
  rail *opens* a record through the global detail-stack event but `closeRecord()`
  only cleared local state, so `detail:order` stayed registered, re-announced
  itself, and the adopt effect re-read it as an external open. Fixed with
  `dispatchCloseShippedDetails()` + a `railClosingIdRef` guard in `OrdersGridView`.

## 2. What is SETTLED — do not re-litigate (from the absorbed handoff)

The non-modal migration shipped 2026-07-31 → 2026-08-01. Every ops queue /
workbench record inspector and import-adjacent progress surface is a
`RightRailHost` occupant with `modal={false}` + named `ariaLabel` +
`role="region"`:

- **Phase A0/A1:** Incoming, Repair, Unfound, FBA board, SKU (panel variant),
  Support context, the `GlobalDetailStackHost` loading shell, Testing Box /
  Manifest. Stable occupant ids where row→row is the loop (`detail:incoming`,
  `detail:claim`, `detail:unfound`, `detail:fba-plan`); `detail:unfound` left the
  `detail:claim:` namespace.
- **Phase B:** `InventoryFulfillmentSyncDialog` → `detail:inventory-sync`.
  ⚠️ Unreachable — its only trigger `ShippedActionsButton` has zero mounts.
- **Phase C:** `ReceivingAuditModal` / `SendPhotoNoteModal` /
  `MovePhotosBetweenPoModal` → `*Rail` non-modal occupants. Unbox tools stay on
  `ReceivingToolPushStack`; Unbox Claim stays push.
- **`closeOnOutsideClick` is deliberately OFF everywhere** — the dismiss layer is
  `fixed inset-0` and would swallow the sibling-row clicks the flip exists to
  preserve. That is *why* every panel owes an explicit header close (§3.2).
- **One owner:** never hand-roll `fixed right-0 z-panel w-[420px]`.
  `RightRailHost` + `src/lib/right-rail/store.ts` only.
- **Still deferred:** LabelEditPopover / ProductLabelEditPopover /
  AsListedEditPopover / CatalogManagerPopover / UnitSlotsManageOverlay /
  PreboxWizard (anchored field editors + wizards — different contract).

## 3. What WAS open — all three closed 2026-08-02

§3.1, §3.2 and §3.3 are **done**. The sections below are kept as the record of
what was decided and why; read them before re-opening any of it.

### 3.1 Icon row + `close · up · down` — ✅ DONE 2026-08-02

Prev/next lived in `PaneHeaderActionBar` (the `belowSlot` row) and close sat in
`rightSlot` of the row *above*. They are now **one right-aligned cluster on the
top row**, with the action icons as that same top row.

**Fixed at the primitive, not per header.** `PaneHeaderActionBar` takes
`onClose` and renders `PaneHeaderCloseButton` at the HEAD of its trailing
cluster, so `close · up · down` is structural — a header cannot re-order it or
forget half of it. Every rail gets the grammar by passing one more prop.

**Close leads, and wears `>|` (`ArrowRightToLine`), not an `X`** (ordered
2026-08-02, after seeing it). Dismiss is reached for without looking, so it
takes the stable end — prev/next come and go with the queue behind the record,
and a trailing close shifts under the cursor whenever they do. The arrow says
the panel is parked back against the right edge it came from rather than
cancelled; `intent="dismiss"` restores the `X` where a pane genuinely goes away.

**The rows swapped roles**, per the SoT: row 1 is the icon action row (spanning
the full width so the bar's own spacer pushes the cluster to the far edge), row
2 is the dense `PaneHeaderLabel` identity, row 3 is the optional tab strip.
Open-full-page stopped being a lone `IconButton` beside close and became an
entry in the contextual action set — the loose-button-beside-the-icon-row shape
the grammar bans.

**Implemented once, because the two headers merged first** (§4) — see
`RecordPaneHeader`.

Grammar is now SoT: `.claude/rules/source-of-truth.md` → Right-rail modality →
**Panel header grammar**.

⚠️ `dashboard-bulk-actions.spec.ts` reads action **`aria-label`** strings off the
DOM. `PaneHeaderActionBar iconOnly` preserves `label` as `aria-label` — keep it.

### 3.2 FLAG / NOTES / "Add note" must not render in this panel — ✅ DONE 2026-08-02

`OrderTriageSection` is **deleted** (it had exactly one mount) and `showNotes`
is hard `false` on **both** branches — `ShippedDetailsBody` for the legacy
tabbed contexts, and the order-record branch's own `ShippedPanelEditorDock` in
`ShippedDetailsPanel`. The trap was real and is why both had to change: the dock
read `showNotes={!showTriage}`, so turning the section off alone would have
*moved* the composer down rather than removing it.

Note-writing now lives only on `/o/[orderId]`, reached from the open-full-page
action which §3.1 promoted into the header's icon row. `SupportOrdersWorkspace`
keeps its own composer — it is not this panel.

**The write path is untouched**, which is what keeps this a placement change
rather than a grain change: `order_notes` via `POST /api/orders/[id]/notes`,
one writable home. `order-note-grain.guard.test.ts` passes.

⚠️ **What was actually given up.** This also removed the row-flag readout — the
panel was the one place that said *which* tag, *why*, and *who* wrote the notes,
and the grid only says *that* a row is flagged. That trade is deliberate but it
is the part to revisit first if operators complain; the cheapest reversal is the
flag block alone, without the composer.

### 3.3 Push (the ruling)

**SoT already amended — implement to it, don't re-derive it.**

- `AGENTS.md` hard law now reads "The right edge PUSHES; it never floats over the
  work surface."
- `.claude/rules/source-of-truth.md` → Right-rail modality carries the **width
  order of sacrifice** (left spine → context rail → only then overlay) and the
  reversal rationale.
- Both right-edge grammars now push; they differ in scope, not in reflow.

**✅ SHIPPED — verified by call site 2026-08-02, not by docblock.** The four
items below were all owed; here is where each landed.

1. **The arithmetic is code, and unit-pinned.** It lives in
   `src/lib/right-rail/frame.ts` (`resolveRightRailFrame`, pure + DOM-free) with
   every worked number asserted in `frame.test.ts`. The constants:
   `MIN_WORK_SURFACE_PX = 784` (derived — the larger of the Outbound grid's 640
   show-all + `lg:px-8` gutters = 704, and the station workbench's 720 + `px-6`
   = 768), `CONTEXT_RAIL_PARKED_PX` = the 32px strip + margins,
   `RIGHT_RAIL_GUTTER_PX = 8`. Below a **1160px content row** the answer is
   overlay.
   **The ruling's three-rung ladder shipped as two**, and that correction is in
   the SoT: measured in the running app at 1440/1920, `[data-sidebar-nav-column]`
   reports width **0 on every route** (`navOpen` is unpersisted
   `useState(false)`), so a spine rung would be dead code in the common case and
   would fight `SidebarNavColumn`'s own no-auto-close rule. Rung 0 nothing
   yields → rung 1 the context rail parks → else overlay.
2. **Mechanism is the sanctioned PUSH toggle**, tween not spring, per
   `motion-crossfade.md`. Two `AnimatePresence` with two keys (outer keyed on a
   constant so the column joining/leaving the flow does not replay on a record
   swap; inner keyed on the occupant id), and an opacity-only presence preset —
   the width tween already owns arrive/leave, so an `x` translate would slide
   the column out of the slot it just reserved.
3. **Blast radius: HOST-WIDE, gated per occupant.** The decision lives in the
   frame store, so it serves every `RightRailHost` occupant rather than a
   dashboard special case — but `wantsPush` is per occupant, so the surfaces
   that must not push (station edge columns, the assistant, anything modal)
   resolve to overlay by construction. Enforced by
   `right-rail-push.guard.test.ts`: *"the push/overlay decision belongs to
   `resolveRightRailFrame`"*.
   **The park is an ephemeral MASK, never a write** — `ContextPanelLayout` ORs
   `parkRail` into its collapsed state and must never call `setCollapsed(true)`
   from that path, or opening a record would leave `context-panel-collapsed` in
   the operator's localStorage forever. A push-park therefore renders no expand
   strip and costs **0** in the ladder, while an operator-chosen collapse costs
   the 32px strip.
4. Docs: `AGENTS.md`, `source-of-truth.md` and the project memory were amended
   the same day. `dashboard-inline-detail-editing-EXECUTION-PLAN.md` still
   carries the old float rationale as history.

## 4. Code simplification worth doing while in here

Real duplications on this surface — each is a "two shapes for one job" the house
rules already ban:

- ✅ **Two order-panel headers → one.** `RecordPaneHeader`
  (`src/components/order-record/`) replaced `ShippedDetailsHeader` +
  `OrderIdentityHeader`, both deleted. Tabs are a `tabs?` slot. §3.1 was
  therefore implemented once, not twice. Three call sites migrated:
  `ShippedDetailsPanel` (both branches) and `OrderFullPageView`.
  `order-record-body.guard.test.ts` now pins that the full page mounts the
  merged header **and passes no `tabs`** — the eight-tab strip is slide-over
  chrome, and re-growing it on `/o/[id]` would put two navigations on one record.
- ❌ **`RailActionRegion` is NOT dead** — it still has two live consumers
  (`OrderRailCompare`, `OrderRailShell`), neither of which grew a pane header.
  Leave it; `useRailHeaderActions` and it are serving different surfaces.
- ✅ **`ShippedDetailsBody` reads ONE descriptor.** `showDispatchExtras`,
  `showDelete` and `showEditorDock` moved onto `OrderInspectorContext`, joining
  `documentsMode` / `recordCtas` / `showDocumentsTab`. The body no longer
  re-derives a lane set: `isFulfillmentPanel` / `isLabelsPanel` /
  `showDashboardExtras` are gone from its props, and `showDashboardDelete` /
  `showEditorDock` are gone as local expressions. (`showTriage` is gone with
  §3.2; `showQuickLinks` stays a prop — it is a slide-over-vs-full-page layout
  choice, not a lane fact.)
  Two findings worth keeping: `showDelete` and `showDispatchExtras` resolve to
  the **same lane set** today but are named apart because they are different
  jobs, and the old `showEditorDock` five-way disjunction was a **tautology** —
  it unioned to every context there is. Both are now pinned by tests in
  `order-inspector-context.test.ts` so a "simplification" cannot quietly change
  either.
- ⚠️ **Context trap — still true, still load-bearing.** The dashboard's
  Pending/Tested lanes reach this panel with context `'fulfillment'`, NOT
  `'dashboard'`, so `isOrderRecord` is FALSE and they render the tabbed branch.
  That is why the merged header had to serve both shapes rather than the
  order-record one absorbing the other. A comment at the mount site now says so.

## 5. Pattern checklist (every panel must satisfy)

1. Shell: `DetailStackRailRegistrar` / `useRegisterRightPanel` — geometry owned by
   `RightRailHost` only (or `UnboxPushColumn` for Unbox station tools).
2. `modal={false}` — no scrim, no `backdrop-blur`, no body scroll lock.
3. `role="region"` + `ariaLabel` — never `role="dialog" aria-modal`.
4. Resizable (`DETAIL_STACK_RESIZE`) + collapsible.
5. **Pushes** the work surface; left columns yield first (§3.3).
6. One right-edge secondary at a time; opening an inspector suspends intake/sync.
7. Stable occupant ids where row↔row is the loop.
8. Header carries the icon row + dense `PaneHeaderLabel` identity (short key — never a wrapping product title) + `close · up · down` (close first, `>|` glyph); explicit close mandatory. Never `SidebarIntakeFormShell` on a record peek (`display/right-rail-inspector.md`).
9. No private fixed panels.
10. Never raise DS ratchet baselines.

## 6. Key files

| Role | Path |
|---|---|
| Host / store | `src/components/right-rail/RightRailHost.tsx`, `src/lib/right-rail/store.ts` |
| Registrar API | `src/components/right-rail/DetailStackRailRegistrar.tsx` |
| Panel (golden) | `src/components/shipped/ShippedDetailsPanel.tsx` |
| Header (merged) | `src/components/order-record/RecordPaneHeader.tsx` |
| Push ladder | `src/lib/right-rail/frame.ts` (+ `frame.test.ts`, `right-rail-push.guard.test.ts`) |
| Header primitives | `src/components/ui/pane-header/blocks.tsx` (`PaneHeaderActionBar`, `PaneHeaderCloseButton`) |
| Rail actions / bodies | `src/components/dashboard/rail/{OrderRailActions,OrderRailCompare,OrderRailShell}.tsx` |
| Selection resolver | `src/lib/right-rail/selection-occupancy.ts` |
| Compare model | `src/lib/right-rail/order-compare-model.ts` |
| Triage block (§3.2) | deleted — `ShippedDetailsBody.tsx` carries the note explaining the removal |
| Plane descriptor (§4) | `src/lib/selection-context/order-inspector-context.ts` |
| Push recipe to copy | `src/components/sidebar/master-nav/SidebarNavColumn` + `framerTransition.sidebarNavColumnMount` |
| Laws | `AGENTS.md`, `.claude/rules/source-of-truth.md`, `.claude/rules/display/motion-crossfade.md` |
| Parent plan | `docs/todo/order-rail-selection-plane-PLAN.md` |
| Absorbed handoff | `docs/todo/queue-inspector-non-modal-rail-HANDOFF.md` (superseded) |

## 7. Guardrails + verify

- **Attach to the dev server on `:3050`** — never start, restart, or kill one.
- **E2E against the QA org only** (`--project=qa-desktop`), never the dogfood tenant.
- The user manages commits. Stage only your own files; never `git stash`.
- The tree often holds **another session's in-flight work** — during this session a
  `getLast4`→`getLast8` CopyChip rename and a `MultiSkuBarcodeWizard` extraction
  both turned gates red. Check whether a failing file is one you touched before
  attributing it.

```bash
npx playwright test dashboard-bulk-actions dashboard-selection-handoff dashboard-rail-compare queue-inspector-non-modal --project=qa-desktop
```

```bash
npm run verify
```

**Known-red, NOT yours:** `dashboard-inspector-non-modal` → *resizable, clamps to
the derived cap* (unscoped `edge-resize-collapse` locator matches both the context
rail's grip and the inspector's). Doc-catalog drift is another session's new file.
`ensure-outbound-docs.ts:122` bare `console.info` fails Lint — another file's owner.
`receiving-tech-modes` / `receiving-param-isolation` fail on a stale
`role="complementary"` anchor.

## 8. Status log (carried over from the absorbed handoff)

| When | Note |
|---|---|
| 2026-07-31 | Non-modal handoff filed after the Import / Add Order wave shipped. |
| 2026-07-31 | **Phase A0 + A1 done.** `modal={false}` + `ariaLabel` on Incoming, Repair, Unfound, FBA board, SKU (panel variant), Support context, loading shell, Testing Box / Manifest. Stable ids where row→row is the loop; `detail:unfound` left the `detail:claim:` namespace. `closeOnOutsideClick` left OFF everywhere — the `fixed inset-0` dismiss layer would swallow the sibling-row clicks the flip exists to preserve — so each panel gained an explicit header close instead. |
| 2026-07-31 | **Phase B done, but unreachable.** `detail:inventory-sync` ported off the centered Dialog; its only trigger `ShippedActionsButton` has zero mounts (both in `knip-baseline.json`), so nothing can open it and E2E cannot cover it. |
| 2026-07-31 | **Phase C done via the wrappers, not per host.** Audit / Send-photo / Move-photos → `*Rail` non-modal occupants, covering Testing, Triage, carton read, PhotoGallery, PhotoPeekFan at once. Unbox → `ReceivingToolPushStack`; Unbox Claim stays push; the Testing claim WIZARD stays modal. Anchored field editors + wizards deferred. |
| 2026-08-01 | **Incoming + History row-click planes split** (row body opens the record; gutter checkbox owns bulk). History opens `/carton/[id]`, the durable read record — not `/unbox`, which would drop a browse click into the scan bench. Unbox flipped as a set, and its feed clicks no longer claim the carton (`recordView` threaded as a required, undefaulted flag). |
| 2026-08-01 | Unbox tab strip renamed to the house vocabulary **Recent · Queue · History**; wire (`?unboxview=viewed`) deliberately unchanged — `viewed` is the SERVER's name for that feed. |
| 2026-08-01 | **Display rework begun (§1).** Header icon row, duplicate Delete removed, close buttons added to two headers that were swallowing the prop, onboarding card removed from the outbound sidebar. Selection-plane Phase 3 compare pane landed. Pre-existing D4 clear bug fixed. |
| 2026-08-02 | **§3.1 + §3.2 + §4 closed; §3.3 confirmed already shipped.** §4's header merge went FIRST so §3.1 was implemented once: `RecordPaneHeader` replaces both order headers (deleted), rows swapped so the icon action row is row 1 and dense identity is row 2, and `up · down · close` became one cluster owned by `PaneHeaderActionBar onClose` — a primitive-level fix, so every rail inherits it. Open-full-page became an action rather than a loose button beside close. §3.2: `OrderTriageSection` deleted and `showNotes` hard-off on BOTH branches (the `!showTriage` trap was real). §4: the body now reads one `OrderInspectorContext` descriptor; `RailActionRegion` turned out NOT to be dead (2 live consumers). §3.3 was verified by call site — `resolveRightRailFrame` + guard + the rail park are all live; the handoff was stale, and the ladder shipped with two rungs, not three, because the spine measures 0 on every route. **Not visually verified — no dev server on `:3050`.** |
| 2026-08-02 | **Unbox Displays rail simplified — the station right edge, ahead of §3.1 on the record rail.** `SectionTabsSlider` gained `density="icon"`: a flat icon row (no rail box), idle cells icon-only with the label as tooltip + accessible name, the SELECTED cell expanding to icon + label so exactly one display is ever named. ⋯ left `TabSwitch trailing` and became a right-aligned peer of `rightSlot` with a hairline between — the documented overlap (accent ⋯ covering the PO pencil) is gone. The one-day-old `density="stacked"` was **deleted** from `TabSwitch`, not left beside it: one call site, and two densities for one job is the drift these docs exist to close. Also fixed a collision this handoff had not catalogued — the pane-anchored More-details ring floats at `right-2` over this column's top-right corner, so the strip row now reserves derived clearance (`DISPLAYS_HEADER_RING_CLEARANCE`) instead of running under it. `record-cursor-unification-PLAN.md` Phase 5 amended with the reversal + why icon-only is the sanctioned nav-chrome exception here, not a paired-icons violation. **Not visually verified — no dev server was running on `:3050`.** |
| 2026-08-02 | **This handoff is complete for order rail + push.** Remaining product-wide inspector work (non-order header migration, collapse namespacing, dirty/URL law, modal→rail conversions) → [`right-rail-inspector-FINISH-HANDOFF.md`](./right-rail-inspector-FINISH-HANDOFF.md). |
| 2026-08-01 | **PUSH RULED IN, float ruled out.** Product owner overruled the 2026-07-28 float decision after seeing it in production; the mitigation the original refusal lacked is that the panel takes width from the LEFT first. `AGENTS.md`, `.claude/rules/source-of-truth.md` and the project memory amended the same day. Implementation open (§3.3). |
