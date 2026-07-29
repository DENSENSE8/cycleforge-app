# Execution plan — dashboard table → detail: non-modal contextual inspector

**Date:** 2026-07-28
**Lane:** `main` (WS-DOGFOOD) — dogfood-surface fix on an existing surface, no new parked build.
**Source rounds:** `dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md` → Gemini R1 → `dashboard-inline-detail-editing-GEMINI-FOLLOWUP.md` → Gemini R2.
**Status:** ready to build Phases 1–4. Phase 5 partially ready. §9 needs a decision before its slice.

---

## 0. What this plan is

The originating ask was: *stop the details panel from opening over a darkened background; make it a contextual display tied to the table selection, with per-table contextual actions.*

Outcome after two research rounds: **the darkening goes away, the layout push does not happen.** The inspector becomes a non-modal, resizable, instantly-swapping side surface; the table stays at its natural width and stays live underneath. Push/squeeze was declined on the merits (§2.5), not on the arithmetic — the arithmetic alone does not kill it.

This plan encodes what survived review of *both* rounds. Where it deviates from Gemini R2, §2 says why, so a future reader does not "restore" a corrected item.

---

## 1. Decisions locked

| # | Decision | Source |
|---|---|---|
| D1 | Inspector is **non-modal**: no scrim, no `backdrop-blur`, no `aria-modal`, no body scroll lock | R1, adopted |
| D2 | **No push/squeeze.** The collection map never reflows for the inspector | R2 §2, on the merits |
| D3 | Inspector is **resizable**, default 420px, width persisted **globally** (not per lane) | R2 §2.4 |
| D4 | **Plane-redundancy rule:** the record plane must be a complete superset of editable fields wherever the in-cell plane is *conditionally* unavailable | R2 R1 |
| D5 | Urgent **stays** in the inspector — do not fracture the shared quick-action SoT | R2 R2 |
| D6 | Row plane keeps exactly **OOS · Notes · Details** | R2 R2 |
| D7 | Product-label print belongs on **Pending/Tested**; shipping-label print is a **distinct** action on Packed/Shipped | R2 R3 |
| D8 | Row→row click **swaps inspector content instantly**, no exit animation. The order inspector is a deliberate exception to the host's per-entity crossfade | R2 R4 |
| D9 | `allocate` / `release` / `substitute` are **excluded from every dashboard plane** — station / full-record page only | R2 §3 Q1 |
| D10 | FBA selection gutter **collapses**; no selection is introduced there | R2 §3 Q2 |
| D11 | Delete both bulk stubs; **no batch-edit inspector** | R2 §7 |
| D12 | House rule: *actions and action bars diverge by lifecycle stage; column layout and grid components diverge only by data domain* | R2 §4 |

---

## 2. Corrections this plan encodes (do not "restore" these)

1. **No Playwright spec asserts modality.** R2 §6 guessed dropping the scrim "will likely invalidate `order-full-page` and `dashboard-search-exact-open`." Grepped all four specs for `scrim` / `aria-modal` / `backdrop` / `dialog`: **zero hits.** Phase 1 needs no spec changes.
2. **The keymap already ships.** [`useOutboundQueueKeyboard.ts`](src/hooks/useOutboundQueueKeyboard.ts) implements `j`/`k`/`↑`/`↓` navigate-and-open, Enter-opens-first, Esc-closes — capture-phase window listener, mounted on Pending (via `UnshippedShelfBoard`, which `UnshippedTable` renders), Packed, and Shipped. R2 §5 is a **diff**, not a build: the only new row is Enter-opens-the-*focused*-row.
3. **The scan hotkey default is `Insert`, not F2.** `DEFAULT_FOCUS_SCAN_HOTKEY = 'Insert'`; allowed set `/^(Insert|ScrollLock|F([1-9]|1[0-2]))$/`. Round 1 (ours) said F2 and R2 inherited it. The real hazard is different — see Phase 2.
4. **Escape is already correct for cell editors and already broken for popovers** — with a verified cause, see Phase 2. R2's "critical" resolution describes behavior that already works, and misses the case that doesn't.
5. **Push was declined for the right reason.** Accepted: an instantaneous un-animated reflow of a dense grid reads worse than a floating card, and the compliant alternative already exists in-house. Note for the record that the arithmetic *alone* does not decide it — with the sidebar collapsed a 432px push leaves 944px, clearing both column sets.
6. **`allocate`/`release`/`substitute` are not tier (c) "blocked."** They are fully built endpoints, **excluded by policy** (D9). Tier (c) invites someone to "unblock" them. Record them as *out of scope*.
7. **Bulk assignment does not need a batch-edit inspector and does not need a new picker.** `WorkOrderAssignmentCard` is already a **multi-row carousel** (prev/next across `rows`, drafts + localStorage, resume-to-next, confirm→advance) and is already mounted by the inspector. Wiring it to a selection action satisfies R2's ban on a batch-edit panel — it is a third pattern, per-row-in-sequence, not a mixed-value form.

---

## 3. Phase 1 — Non-modal inspector *(the whole originating complaint)*

**Goal:** the background stops darkening; the table stays scrollable and clickable while the inspector is open.

The non-modal path **already exists** in the host — it is hardcoded to one occupant's id (`isAssistantDock`). Generalize it to a flag.

### Changes

1. **`src/lib/right-rail/store.ts`**
   - Add `modal?: boolean` to `RightRailPanel` (default **true** — preserves today's behavior for all ~11 occupants).
   - Thread it through `registerRightRailPanel` and `updateRightRailPanelNode` (it participates in the change-detection compare alongside `node`/`onClose`/`elevated`).

2. **`src/components/right-rail/useRegisterRightPanel.ts`**
   - Accept + forward `modal`. Add to both effects' dep arrays (mount-claim deps: `[id, priority, enabled, elevated, modal]`).

3. **`src/components/right-rail/DetailStackRailRegistrar.tsx`**
   - Accept + forward `modal`.

4. **`src/components/right-rail/RightRailHost.tsx`** — replace the identity check with the flag:
   - `const isModal = renderable?.modal !== false && !isAssistantDock;`
   - `useBodyScrollLock(!!renderable && isModal)`
   - Backdrop renders only when `renderable?.onClose && isModal`.
   - Aside attrs: when `isModal` keep `role="dialog" aria-modal="true"`; otherwise `role="region"` + `aria-label` supplied by the occupant (add an optional `ariaLabel` to the store record; fall back to `"Details"`).
   - Keep `useEscapeClose` in both modes.

5. **`src/components/shipped/ShippedDetailsPanel.tsx`** — pass `modal={false}` (+ `ariaLabel={`Order ${meta.orderIdDisplay}`}`) on the registrar. **Only this occupant.** Every other panel keeps the default and is untouched.

### Notes / decisions inside Phase 1

- **Do not add `useFocusTrap`.** The host currently declares `aria-modal="true"` with **no** trap (`useFocusTrap` exists in `src/design-system/hooks/` and is never called there) — i.e. it lies to assistive tech today. Going non-modal makes the markup honest instead of adding a trap.
- **Do not move focus on open.** Focus stays on the grid so `j`/`k` keeps flowing. Known limitation to accept for now: the host renders at app root, so Tab-reaching the inspector means tabbing to the end of the document. Log it; do not solve it with a trap.

### Verify

- Open an order from Pending: no dim, no blur, page scroll still works, grid rows still clickable, header/sidebar still interactive.
- Assistant dock (⌘J) unchanged. Receiving Incoming details (elevated) still dims + locks.
- `npm run verify`.

---

## 4. Phase 2 — Escape ownership + the real hotkey conflict

### 4a. Escape: popovers must win over the inspector

**Verified cause.** [`useOutboundQueueKeyboard.ts:142`](src/hooks/useOutboundQueueKeyboard.ts:142) registers `keydown` in **capture** phase on `window` and calls `stopPropagation()` on Escape. `useEscapeClose` — which `AnchoredLayer` (and therefore every house `Popover`) uses for its own dismissal — registers on `window` in **bubble** phase. Capture always wins.

The hook's `isTypingTarget` bail-out covers `INPUT` / `TEXTAREA` / contenteditable / `role=textbox`, so **cell text editors are already safe**. It does **not** cover the condition-grade popover, the row info menu, or the Calendar — those hold focus on buttons/menu items. Result today: with the inspector open, Escape closes the **inspector** instead of the open popover.

**Fix — a tiny open-layer counter, mirroring the existing store pattern** (`right-rail/store.ts`, `scan-hotkey/store.ts`). **BUILT 2026-07-28:**

- `src/lib/overlay-stack/store.ts` — `pushOverlay()` (returns a release fn) / `hasOpenOverlay()` / `subscribeOverlayStack()` / `getOverlayDepth()`. Module-level, no React.
- `src/design-system/hooks/useOverlayStack.ts` — `useRegisterOverlay(active)` for overlays, `useAnyOverlayOpen()` for ambient owners that must yield reactively.
- `AnchoredLayer` calls `useRegisterOverlay(open)` — which covers every house Popover / DropdownMenu / ContextMenu / cell editor / Calendar for free. Its own `useEscapeClose` is unchanged, so a lone popover behaves exactly as before (no regression risk).
- `useOutboundQueueKeyboard` bails the **whole** handler on `hasOpenOverlay()`, not just Escape — `j`/`k` should not scroll the queue behind an open menu either.
- `RightRailHost` disables its `useEscapeClose` while `useAnyOverlayOpen()`, so Escape #1 closes the popover and Escape #2 closes the inspector (both are bubble-phase window listeners on the same node, so neither can stop the other — the host has to opt out explicitly).
- The rule to file: **"the innermost open editor or overlay owns Escape."** Not "any input."

### 4b. Shift+F2 double-fire

The Pending row binds **Shift+F2** to open the notes editor and calls `preventDefault()` **without** `stopPropagation()` ([OrdersQueueTableRow.tsx:911](src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx:911)). The global scan-hotkey listener early-returns on `metaKey`/`ctrlKey`/`altKey` but **not `shiftKey`**. So for any staffer who rebinds their scan hotkey to `F2`, Shift+F2 opens the note editor **and** the scan bar steals focus.

**Fix:** add `if (e.shiftKey) return;` to the global listener in `src/lib/scan-hotkey/store.ts`. One line. A scan wedge never sends Shift+<hotkey>, so nothing legitimate is lost.

### 4c. Keymap diff (everything else already ships)

| Key | Scope | Status |
|---|---|---|
| `j` / `↓` | grid | **ships** — next row + open |
| `k` / `↑` | grid | **ships** — prev row |
| `Enter` (nothing open) | grid | **ships** — opens first row |
| `Enter` (row focused) | grid row | **ships — but was hijacked.** The row already handles Enter/Space. The capture-phase hook's Enter branch only knows how to open `orderedRecords[0]`, so a focused row below the first opened the WRONG order. Fixed by bailing when the target is inside `[data-order-row-id]` |
| `Esc` | cell editor | **ships** — reverts draft, hook bails on typing target |
| `Esc` | open popover | **Phase 2a** |
| `Esc` | otherwise | **ships** — closes inspector |
| `Shift+F2` | grid row | **ships** — notes; fix 2b |

### Verify

- Inspector open + condition popover open → Escape closes the popover only; second Escape closes the inspector.
- Rebind the scan hotkey to F2 in settings, then Shift+F2 on a row: notes editor opens, scan bar does **not** take focus.
- `npx tsx --test` on any touched test files, then `npm run verify`.

---

## 5. Phase 3 — Instant record swap (D8) + the draft guard — **BUILT 2026-07-28**

> **`?openOrderId=` did not survive a reload — FIXED 2026-07-28.**
>
> **Symptom:** open a row → `/dashboard?unshipped=&openOrderId=5660`; reload →
> `/dashboard?unshipped=`, session snapshot absent, no inspector. The Workbench
> law that selection is durable and URL-addressable was broken on the dashboard.
>
> **Root cause** (traced by instrumenting `dispatchEvent` + `history.replaceState`,
> not guessed): `useOrdersQueueSelection`'s stale-selection cleanup. On boot,
> `?openOrderId=` resolves and dispatches `open-shipped-details` *before* the
> queue's own rows have arrived, so `visibleRecords.find(...)` misses, the effect
> reads that as "the record left the queue", calls `onCloseRecord` →
> `close-shipped-details` → `handleClose` → `clearSelectedOrder(true)`, which
> strips the param. A pure race: nothing was wrong with the record.
>
> **Fix:** the effect now distinguishes *"rows are not here yet"* from *"the row
> left"*. It only closes a selection it has actually **seen** in this queue
> (`seenSelectedIdRef`). Deleted / filtered-out rows still close as before,
> because those were seen first.
>
> **Attribution proven, not assumed:** the 7 unrelated queue-spec failures
> (frozen-header color, KPI scroll offset, mocked-feed row counts, column
> force-hide) reproduce **identically** with the committed version of this file
> restored — they belong to the in-flight ops-table / KPI work, not here.

**Goal:** arrowing down the queue swaps inspector content with no 0.8s empty slot (today: exit 0.4s → enter 0.4s under `mode="wait"`, keyed on `detail:order:<id>`).

### Changes

1. **`ShippedDetailsPanel`** registers a **stable** id — `detail:order` — instead of `detail:order:${shipped.id}`. The record arrives as content; `updateRightRailPanelNode` already keeps a mounted occupant fresh without remount (that is its documented purpose).
2. **Do not change the host's `mode="wait"`.** Other occupants keep per-entity crossfade. This is a per-occupant exception (D8), achieved purely by id stability.
3. **Add the draft guard.** `useShippedDetailState` already re-seeds every field in an effect keyed on `initialShipped` (so no stale values — verified), **but** it calls `setNotes(initialShipped.notes)` unconditionally, which silently discards an unsaved notes draft on swap. `useShippedPanelViewState` already resets `activeSection` / `activeInput` on `initialShipped.id`.
   - Track a dirty flag for notes (draft ≠ last-seeded value). On record change with a dirty draft: **flush the save** for the outgoing order before re-seeding. Do not block navigation and do not prompt — this queue is a throughput surface.

### Verify

- Hold `j` down the queue: content swaps with no blank gap, fields always match the highlighted row.
- Type a note, don't save, press `j`: the note persists to the order you left; the new order shows its own note.
- Open assistant (⌘J) then an order then a SKU detail: unrelated occupant swaps still crossfade.

---

## 6. Phase 4 — Resizable inspector (D3) — **BUILT 2026-07-28**

Compose the existing primitive; do not hand-roll geometry.

> **Finding: resize does NOT solve the occlusion, and cannot.** Measured at 1440
> with the inspector open: `title` runs to x≈1036 and the card starts at x=1008,
> so *every* column except Product sits behind it. Narrowing the panel to its
> 360px floor only moves the edge to x=1068 — the fixed tracks
> (ship-by · age · qty · cond · order · tracking ≈ 404px) are still covered.
>
> The cause is structural: `title` is the `1fr` column, so it absorbs all slack
> and the fixed tracks are always flush against the table's RIGHT edge — exactly
> where a right-anchored panel floats. Collapsing the sidebar does not help
> either, for the same reason: the extra 360px goes to `title`.
>
> So the only things that can reveal those columns are (a) a narrower panel
> (marginal), or (b) shrinking the grid's own scrollport — i.e. push, which D2
> declined. **Phase 4 gives the operator control over the trade; it does not
> remove it.** If occlusion turns out to be the real complaint in use, reopen D2
> scoped to the grid scrollport rather than the page layout — and price the
> column-collapse breakpoints (720 / 640 / 560px) that would then fire.

- `useHorizontalEdgeResize` already owns drag + `localStorage` persistence by `storageKey` (precedents: `ZohoSplitPane`, `RightPaneOverlay` / `DocumentSlideOver`).
- Apply in `RightRailHost` for **non-modal** occupants only: `storageKey: 'detail-inspector-width'` (global, per D3), `defaultWidth: 420`, `minWidth: 360`. Clamp max to `calc(100vw - 24px)`; keep the 12px insets.
- Drag handle on the **left** edge, matching `ZohoSplitPane`'s handle classes.
- Modal occupants keep the fixed `min(420px, 100vw - 24px)`.

**Verify:** drag, reload, width persists; drag to min and max; reduced-motion unaffected (resize is a gesture, not an animation).

---

## 7. Phase 5 — Planes and actions

### 7a. Plane boundary (D4, D5, D6) — mostly a no-op, deliberately

Under the plane-redundancy rule, **nothing is removed from the inspector.** Ship-by and Condition stay (in-cell editing is gated `gridEditable = gridSkin && !isMobile`, and the inspector body is shared with `/o/[orderId]`). Urgent stays (D5). OOS is already in the row menu.

The only change: **document the boundary** so the next contributor doesn't "de-duplicate" it. Add the rule to `.claude/rules/display/workbench.md`.

### 7b. Bulk actions — buildable now

Delete the two stubs, then add three, all through existing endpoints:

| Action | Surfaces | Endpoint | Notes |
|---|---|---|---|
| Assign tester / packer | Pending, Tested | `useOrderAssignment` | Wire the existing **`WorkOrderAssignmentCard` carousel** with the selected rows (§2.7). Not a batch-edit panel. |
| Set ship-by date | Pending, Tested | `useOrderAssignment` (accepts `orderIds[]`) | Calendar popover from the bar → one call |
| Print shipping labels | Packed, Shipped | `GET /api/orders/[id]/documents` → `printOutboundDocuments(docs[])` | The printer **already takes an array** — fetch N, print once |

Also: re-scope **Print product labels** to Pending/Tested (D7); it currently shows on all four lanes.

`SelectionAction` already supports `minSelected` / `maxSelected` / `enabled(rows)` / `disabledReason`, and `ContextualSelectionBar` hides actions whose constraints aren't met — so lifecycle scoping is declarative, no new chrome.

### 7c. FBA (D10)

Collapse the inert selection gutter on the FBA board. No selection, no bar.

### Verify

- Select 3 Pending rows → Assign opens the carousel across all 3; confirm advances.
- Select 5 → Set ship-by writes one request.
- Packed: Print shipping labels produces one print job for N orders.
- Shipped: no Assign / no ship-by / no product-label action offered.

---

## 8. Not yet (agreed)

- Push/squeeze in any form that animates or reflows the grid (D2).
- A batch-edit ("mixed values") inspector (D11).
- `allocate` / `release` / `substitute` on any dashboard plane (D9).
- Right-click context menus. Row hover + info menu covers it; revisit only on request.
- Rebuilding the keymap (§2.2 — it ships).
- A focus trap on the inspector (§3).

---

## 9. Receiving Triage / Unbox — RESOLVED 2026-07-28 (the question was wrong)

Two research rounds returned placeholders here. That is partly our fault: **round 1 §4b
described the receiving *domain's* selection mechanisms as if they were the dashboard's
inbound tabs.** They are not. Measured on `/dashboard?mode=inbound`:

| Claim in round 1 | Measured reality |
|---|---|
| "Triage — a separate, non-shared edit-mode/bulk mechanism" | `TriageWorkspaceView` is mounted by `TriageLineWorkspace` — the **station workspace**, not the dashboard |
| "Unbox — gated checkboxes; bulk bar whose only action is Dismiss" | `ReceivingBulkActionBar` is mounted by **`ReceivingSidebarPanel`** — the sidebar rail, not the dashboard |
| Two surfaces (6 and 7) | **One** table. `DashboardReceivingView` renders `<ReceivingLinesTable />` with **no props**, and the Triage/Unbox tab *is* the `?sort=` value (`scanned_newest` vs `unboxed_newest`) |

**Measured in the running app** (24 rows, 1440×900):

- **0 checkboxes.** `selectMode` defaults to `false` and nothing passes it, so there is no
  selection gutter and no bulk bar — the multi-select plane does not exist here.
- **Row click does nothing.** URL unchanged, no inspector, not even a selected style. It
  calls `dispatchSelectLine`, a cross-pane event with **no listener on this page** (the
  consumers are the receiving sidebar / workspace). The row plane is **inert**.
- The only live affordance is one in-cell editor: **Edit product title**.

### The ruling

**The dashboard's inbound mode is a Monitor region, not a Workbench** — an append-only
receiving-activity feed, read-mostly, filters (`?sort=`, week band, All/Unfound) as its
only state. It should not grow selection or a bulk bar; per the ratified rule it already
satisfies "real selection OR a collapsed gutter" by having neither. **No matrix rows are
owed for surfaces 6–7**, which is why both research rounds had nothing to say.

The real defect is smaller and worth fixing on its own: **a row click is a dead
affordance.** Two acceptable resolutions —

- **(a) Wire it, recommended.** Open the carton record in the right rail. `IncomingDetailsPanel`
  is already a right-rail occupant, so post-Phase-1 it can register `modal={false}` and get
  the same non-modal inspector the order lanes have. Cost: one registrar prop + a listener
  on this page. This makes the record plane real and leaves the other three planes empty,
  which is the correct shape for a Monitor with a drill-down.
- **(b) Make rows non-interactive** — drop the click handler and the hover/selected styling
  so the surface stops implying an affordance it does not have.

Do **not** promote it to a Workbench with selection + bulk actions: the inbound mutation
surface (`/api/receiving/**` — `advance`, `condition`, `putaway`, `move`, `acknowledge-unbox`,
`triage/complete`, `zendesk-claim/*`, …) is scan-driven Station work that belongs at the
bench, not batch-applied from a history feed.

**Round 3 is not needed.** If inbound wants its own action model, that is a receiving-lane
brief about the station/sidebar surfaces, not this dashboard one.

---

## 10. Verification & rollout

- Inner loop: `npx tsx --test <file>` per touched test; `npx tsc --noEmit -p tsconfig.json` when types move.
- **Before done / before any commit: `npm run verify`** (lint · typecheck · unit incl. DS ratchet guards · knip · route-auth drift · schema drift).
- DS ratchets: Phase 4 adds a drag handle — keep it on `focusRing(...)` and spacing intents; do not raise a baseline. If a genuinely bespoke value is needed, use the documented same-line escape (`ds-allow-spacing` / `ds-allow-focus`).
- E2E: no spec changes expected (§2.1). Run `order-full-page`, `order-tracking-edit`, `dashboard-search-exact-open`, `dashboard-search-order-detail` after Phases 1 and 3 anyway — Phase 3 changes occupant identity, which is the riskiest step.
- Rollout order is the phase order; Phase 1 alone resolves the originating complaint and is independently shippable.

---

## 11. House-rule additions — **FILED 2026-07-28**

1. ✅ `.claude/rules/source-of-truth.md` — new **Right-rail modality** section (one owner; `modal`
   defaults true; non-modal = `role="region"` + no scrim/scroll lock; don't add a focus trap;
   resize + derived cap; stable occupant id for queue inspectors).
2. ✅ `.claude/rules/display/workbench.md` — **Action planes** section: the four planes, the
   plane-redundancy rule (D4), lifecycle divergence (D12), selection-or-collapsed-gutter, and
   "bulk ≠ batch-edit panel".
3. ✅ `.claude/rules/display/workbench.md` — **Keyboard ownership** section: the innermost open
   overlay owns Escape, with the capture-vs-bubble cause named, plus "a capture listener must not
   claim a key the focused element already handles".
4. ✅ `.claude/rules/display/motion-crossfade.md` — **The exception: a queue-processing inspector
   swaps in place**, with its three preconditions (full re-seed, flush the outgoing draft, write
   nothing when navigating unedited) so the exception can't be cargo-culted.
5. ✅ `AGENTS.md` — three SoT rows: right-edge detail slot + modality, keyboard ownership (Escape),
   and collection-surface action planes carrying the divergence law verbatim.

Also recorded in project auto-memory (`dashboard-non-modal-inspector`, and an update to
`right-rail-single-slot-host`) so the *declined* push decision and the unsolved occlusion
survive into future sessions.
