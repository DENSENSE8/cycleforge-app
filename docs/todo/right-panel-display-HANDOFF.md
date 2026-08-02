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

## Paste this into a new session

> Read `docs/todo/right-panel-display-HANDOFF.md`. Do not re-open §2 (settled) or
> the parent plan's D1–D8 except D-float, which §3 supersedes.
>
> Job: rework the right detail panel's display and simplify the code behind it.
> Three requirements, in priority order:
>
> 1. **Action icons are the TOP row of the panel header.** No labelled button
>    block anywhere in the panel.
> 2. **The far right of that row is `up · down · close`**, one right-aligned
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

## 3. What is OPEN

### 3.1 Icon row + `up · down · close`

Today prev/next live in `PaneHeaderActionBar` (the `belowSlot` row) and close
sits in `rightSlot` of the row *above*. They must end up as **one right-aligned
cluster on the top row**, with the action icons as that same top row.

Grammar is now SoT: `.claude/rules/source-of-truth.md` → Right-rail modality →
**Panel header grammar**.

⚠️ `dashboard-bulk-actions.spec.ts` reads action **`aria-label`** strings off the
DOM. `PaneHeaderActionBar iconOnly` preserves `label` as `aria-label` — keep it.

### 3.2 FLAG / NOTES / "Add note" must not render in this panel

`OrderTriageSection`, mounted from `ShippedDetailsBody.tsx:312` behind
`showTriage = showDashboardDelete && Number(shipped.id) > 0`.

**Trap:** the sibling dock reads `showNotes={!showTriage}`, so flipping
`showTriage` alone *moves* the composer instead of removing it. Turn both off.
Note-writing then lives only on `/o/[orderId]` (the header's external-link icon).
That is a deliberate capability removal — `order-note-grain.guard.test.ts`
governs the write path and should still pass, but run it.

### 3.3 Push (the ruling)

**SoT already amended — implement to it, don't re-derive it.**

- `AGENTS.md` hard law now reads "The right edge PUSHES; it never floats over the
  work surface."
- `.claude/rules/source-of-truth.md` → Right-rail modality carries the **width
  order of sacrifice** (left spine → context rail → only then overlay) and the
  reversal rationale.
- Both right-edge grammars now push; they differ in scope, not in reflow.

Engineering still owed:

1. **Measure and record** the arithmetic at 1280 / 1440 / 1920, spine open and
   closed, against the grid's own minimum content width. Write the numbers into
   this file. (Known from the 2026-07-28 round: with the sidebar collapsed a
   432px push leaves 944px, which cleared both column sets.)
2. **Mechanism = the deliberate PUSH toggle** in
   `.claude/rules/display/motion-crossfade.md` — tween (never a spring: it would
   rubber-band the width every sibling lays out against), explicit gesture, and
   fixed-width edge-anchored content inside an `overflow-hidden` host. Copy
   `SidebarNavColumn`; do not invent a second recipe.
3. **Decide the blast radius before editing the host.** `RightRailHost` serves
   one occupant app-wide (assistant, SKU, repair, receiving, FBA, support …).
   Say in this file whether push is host-wide or scoped to the dashboard
   occupants, then implement that.
4. The old float rationale lives on in
   `docs/todo/dashboard-inline-detail-editing-EXECUTION-PLAN.md` and the project
   memory `dashboard-non-modal-inspector` (memory already updated). Fix any
   other doc that still asserts "inspectors float".

## 4. Code simplification worth doing while in here

Real duplications on this surface — each is a "two shapes for one job" the house
rules already ban:

- **Two order-panel headers.** `ShippedDetailsHeader`
  (`src/components/shipped/details-panel/`) and `OrderIdentityHeader`
  (`src/components/order-record/`) render the same identity band + action bar and
  diverge only in tabs; `ShippedDetailsPanel` picks on `isOrderRecord`. Should be
  one component with a `tabs?` slot — and §3.1 has to be implemented twice until
  they are merged.
- **`RailActionRegion` may now be dead-ish** — after the header move it survives
  only in `OrderRailCompare` / `OrderRailShell`. If those gain pane headers,
  delete it and keep only `useRailHeaderActions`. Check `npm run knip`.
- **`ShippedDetailsBody` gates on five booleans** (`showDashboardExtras`,
  `showQuickLinks`, `showTriage`, `showEditorDock`, `documentsMode`) resolved from
  `resolveOrderInspectorContext`. Push the decision into that resolver so the body
  reads one descriptor.
- **Context trap:** the dashboard's Pending/Tested lanes reach this panel with
  context `'fulfillment'`, NOT `'dashboard'` — `isOrderRecord` is false there.
  That mismatch has already caused two reverts. Verify which branch renders.

## 5. Pattern checklist (every panel must satisfy)

1. Shell: `DetailStackRailRegistrar` / `useRegisterRightPanel` — geometry owned by
   `RightRailHost` only (or `UnboxPushColumn` for Unbox station tools).
2. `modal={false}` — no scrim, no `backdrop-blur`, no body scroll lock.
3. `role="region"` + `ariaLabel` — never `role="dialog" aria-modal`.
4. Resizable (`DETAIL_STACK_RESIZE`) + collapsible.
5. **Pushes** the work surface; left columns yield first (§3.3).
6. One right-edge secondary at a time; opening an inspector suspends intake/sync.
7. Stable occupant ids where row↔row is the loop.
8. Header carries the icon row + dense `PaneHeaderLabel` identity (short key — never a wrapping product title) + `up · down · close`; explicit close mandatory. Never `SidebarIntakeFormShell` on a record peek (`display/right-rail-inspector.md`).
9. No private fixed panels.
10. Never raise DS ratchet baselines.

## 6. Key files

| Role | Path |
|---|---|
| Host / store | `src/components/right-rail/RightRailHost.tsx`, `src/lib/right-rail/store.ts` |
| Registrar API | `src/components/right-rail/DetailStackRailRegistrar.tsx` |
| Panel (golden) | `src/components/shipped/ShippedDetailsPanel.tsx` |
| Headers (merge candidates) | `…/details-panel/ShippedDetailsHeader.tsx`, `src/components/order-record/OrderIdentityHeader.tsx` |
| Header primitives | `src/components/ui/pane-header/blocks.tsx` (`PaneHeaderActionBar`, `PaneHeaderCloseButton`) |
| Rail actions / bodies | `src/components/dashboard/rail/{OrderRailActions,OrderRailCompare,OrderRailShell}.tsx` |
| Selection resolver | `src/lib/right-rail/selection-occupancy.ts` |
| Compare model | `src/lib/right-rail/order-compare-model.ts` |
| Triage block (§3.2) | `src/components/shipped/details-panel/OrderTriageSection.tsx`, `ShippedDetailsBody.tsx:312` |
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
| 2026-08-01 | **PUSH RULED IN, float ruled out.** Product owner overruled the 2026-07-28 float decision after seeing it in production; the mitigation the original refusal lacked is that the panel takes width from the LEFT first. `AGENTS.md`, `.claude/rules/source-of-truth.md` and the project memory amended the same day. Implementation open (§3.3). |
