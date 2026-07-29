# Follow-up brief — dashboard table → detail interaction, round 2

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-07-28
**Prior round:** `dashboard-inline-detail-editing-GEMINI-RESEARCH-BRIEFING.md` + your response (`dashboard_inline_editing_research.md`)
**Deliverable:** (1) the **per-table action matrix** — the main ask of round 1, delivered for 1 of the 7 surfaces; (2) a re-ruling on push/squeeze, because you closed it using half of the arithmetic table; (3) rulings on four items where your recommendation would break a measured behavior.

---

## 0. How to use this brief

Your round-1 verdict is **adopted** (§1). Do not re-argue it.

Two things went wrong, and they are different in kind:

- **The matrix.** Round 1 asked for surface × plane across **seven** surfaces with build tiers and a named endpoint per entry. You returned one flat 9-row table for the outbound family, and every entry came from the two endpoints already wired. That was the deliverable most needed and least delivered. §4 gives you corrected ground truth — including a correction to *our* endpoint list, which overstated what is actionable.
- **The push arithmetic.** You declined push as "structurally impossible," citing the 1440-with-sidebar-open row of our table. The row directly beneath it — sidebar collapsed — yields **944px**, which clears both column sets. Push is not arithmetically dead. If you still want to decline it, decline it **on the merits** (§3).

Answer §2–§5 only. Where an answer reverses something you already ruled, say so explicitly.

---

## 1. Adopted from round 1 — do not revisit

- **Non-modal inspector.** Drop the scrim, `backdrop-blur`, `aria-modal="true"`, and the body scroll lock; the panel becomes a non-modal region. **This is stronger than you argued:** the host declares `aria-modal="true"` while implementing **no focus trap** (`useFocusTrap` exists in our design system and is never called there). So today we tell assistive tech the panel is modal while tab order walks out into the dimmed background. Removing it ends a false claim rather than trading one preference for another.
- **Implementation is cheaper than your plan assumed.** The non-modal path already exists — the host branches on the assistant occupant's *id* to skip both the scroll lock and the backdrop. The work is generalizing that identity check into a per-occupant `modal?: boolean` flag on the store record (~15 lines), not introducing a new mode.
- **No in-row expansion.** Accepted, for the reasons you gave.
- **Delete both stubs** ("Send to staff", "Send to phone").
- **Deferred re-sort** while a row is focused / the inspector is open. Confirmed relevant: row order and day-band keys are re-derived from the sort param, so an optimistic ship-by edit re-bands the row under the cursor.
- **Floating bottom-center bulk bar** stays as the multi-select plane.
- **Right-click is never the only path** to an action.

---

## 2. Four rulings that would break a measured behavior

### R1 — "Remove Ship-by and Condition from the inspector (redundant)"

**Measured:** in-cell editing is gated `gridEditable = gridSkin && !isMobile`. Remove those fields from the inspector and there is **no way to edit ship-by or condition** on mobile, on non-grid-skin consumers, or on the full record page `/o/[orderId]` — which renders the **same** `ShippedDetailsBody` component as the slide-over.

Plane redundancy here is a **fallback for a plane that is conditionally unavailable**, not duplication.

**Ruling needed:** what is the rule when a field's primary plane is unavailable on some viewports/surfaces? Options: (a) the record plane is always the complete superset and "redundancy" is correct by design; (b) fields may be plane-exclusive only where the plane is unconditionally available; (c) something else. Give the rule, not a per-field verdict — we will apply it ourselves.

### R2 — "Move Urgent / Out-of-stock to the row menu, remove from the inspector"

**Measured:** out-of-stock is *already* in the single-selected row info menu (Notes · OOS · Details). Urgent is not. But the inspector's header quick-action order is a shared source-of-truth constant — `['urgent', 'notes', 'out_of_stock', 'status']` — consumed by the **full record page header** as well as the slide-over. House law makes a public-API change to a shared primitive with multiple call sites **ask-first**, not a week-2 cleanup.

**Ruling needed:** is promoting Urgent to the row plane worth changing a cross-surface SoT, or should Urgent stay a record-plane action and the row plane keep only OOS + Notes + Details?

### R3 — "Print labels → lifecycle validity: Packed, Shipped"

**Measured:** that bulk action calls the **product**-label printer (SKU + serial → product label), not a shipping-label printer. It is most useful on **Pending / Tested**, which is where you excluded it.

**Ruling needed:** re-place it, and say whether a *shipping*-label bulk action is a distinct row in the matrix (we have an outbound documents endpoint per order — see §4).

### R4 — "Clicking a second row swaps panel contents without closing/reopening"

**Measured:** the occupant id is `detail:order:<id>` and **doubles as the `AnimatePresence` key**, with `mode="wait"`. The store's contract states the id "must change only when the slot content genuinely swaps to a different entity" — i.e. per-record exit-then-enter is the *design*, not an oversight. At `0.4s` each, a row→row click costs ≈ **0.8s of empty slot**. The store already exposes a node-update path that keeps an occupant mounted, so the mechanism exists; using it means reversing the documented contract for all ~11 occupants of the shared host.

**Ruling needed:** for a **queue-processing inspector** specifically, is instant content swap (stable per-kind id, no exit animation) the 2026 standard — and if so, does that generalize to every occupant of a shared right-rail host, or does the order inspector become a deliberate exception? Name products that do each.

---

## 3. Push/squeeze — re-ruled on the merits, not the arithmetic

The full table from round 1 §6. You quoted row 1 only.

| Viewport | Sidebar | Table scrollport today | After a 432px push | Result |
|---|---|---|---|---|
| 1440 | open (360px) | 1016px | **584px** | below the 596px Pending minimum → h-scroll + all three column-collapse breakpoints fire |
| **1440** | **collapsed** | **1376px** | **944px** | **Pending (596) fine; Tested lane (852) fits with ~92px slack** |
| 1920 | open | 1496px | 1064px | both fit |
| 1280 | open | 856px | 424px | unusable |

**The sidebar is already a first-class collapsible.** There is a collapse toggle in the global header and a left-edge hover-peek that re-opens it after ~2s of pointer rest.

So the honest framing is: *push does not fit **while also** keeping a 360px navigator on screen.* That is a budget conflict between two chrome regions, not a structural impossibility.

**Rule on all four:**

1. **Is "opening an inspector auto-collapses the navigator" a recognized 2026 pattern?** Who does it (VS Code, Figma, Gmail, Linear, Notion, Retool, Superhuman)? Is reclaiming width from a navigator to fund an inspector standard practice, or a smell that means the inspector should overlay instead?
2. **If adopted, what is the restore contract?** Does the sidebar return on inspector close, or stay collapsed? And what happens to the hover-peek — does it re-open and re-squeeze the table mid-task, and if so must the peek be suppressed while the inspector is open?
3. **Does the motion law survive?** Our law bans animating layout (`width`/`height`/`padding`). The compliant form is: inspector animates on `transform`+`opacity`, the table reflows **un-animated in one frame**. Is an instantaneous un-animated reflow of a dense grid acceptable, or is it *worse* perceptually than the scrim we are removing? Cite evidence if any exists.
4. **The real alternative you didn't price.** We already own a **resizable, pane-anchored, optionally-backdropped** slide-over primitive with drag-to-resize and persisted width (`RightPaneOverlay` / `DocumentSlideOver` + `useHorizontalEdgeResize`), plus a `fixed`-aside precedent with a draggable left edge and persisted width. Is a **resizable non-modal overlay** strictly better than push for this job — such that push should be declined a second time, on the merits? If yes, say what the default width should be and whether the operator's resize should persist per-lane or globally.

We are not asking you to reverse yourself for its own sake. We are asking you to decline push for the right reason, or adopt it with the navigator-budget contract spelled out.

---

## 4. The matrix gap — corrected ground truth

### 4a. Our round-1 endpoint list was wrong. Use this one.

Round 1 §5 listed ~30 order endpoints as "API-available and UI-absent." That conflated reads, no-ops, and admin jobs with operator actions. Corrected:

**Real operator mutations (matrix-eligible):**

| Endpoint | What it does | Bulk-capable |
|---|---|---|
| `useOrderAssignment` waist | 16 fields: tester, packer, ship-by, out-of-stock, notes, urgent, tracking, item number, condition, quantity, product title, SKU, SKU-catalog link, … | **yes — accepts `orderIds[]` today** |
| `PATCH /api/orders/[id]` | general order field update | no |
| `POST /api/orders/[id]/tracking` | tracking batch ops + cache/realtime/audit side-effects | per-order (takes an order-ids op internally) |
| `POST /api/orders/[id]/allocate` | reserve specific serial units — FIFO by unit id within (SKU, optional grade) among `STOCKED` | no |
| `POST /api/orders/[id]/release` | close all open allocations, return units to `STOCKED` (cancel-before-pick / unwind) | no |
| `POST /api/orders/[id]/substitute` | audited re-allocation: release original + allocate substitute + record ordered-vs-fulfilled delta | no |
| `POST /api/orders/[id]/packing-checks` | persist one packing-checklist tick, idempotent | no |
| `POST /api/orders/[id]/amazon-refresh` | single-order channel reimport → stamps item number/title/SKU. Gate: `orders.create` | no |
| `POST /api/orders/set-item-number` | set item number on one row | no |
| `POST /api/orders/missing-parts` | move order to missing-parts status | no |
| `POST /api/orders/delete` | delete (branches order vs. packer-log row) | yes |
| `POST /api/orders/import-csv` | bulk intake | n/a |

**Read-only — NOT actions** (we mislabeled these): `orders/verify` (GET by tracking), `[id]/pick-tasks` (GET), `[id]/pack-checklist` (GET), `[id]/amendments` (GET; writes go through `substitute` + a separate decision route), `[id]/documents` + `/fetch`, `[id]/timeline`, `queue-counts`, `check-shipped`, `next`, `recent`, `lookup/[orderId]`, `batch` (an AI-chat lookup).

**Dead:** `orders/skip` — documented in-file as a **no-op** since its column was dropped.

**Admin/back-office, not an operator table action:** `integrity-check` (report-first dryRun → fix dedupe), `backfill/ebay`, `backfill/ecwid`.

### 4b. The seven surfaces, with measured current state

| # | Surface | Grid | Selection today | Actions today |
|---|---|---|---|---|
| 1 | `shipping` › **Pending** | shared `OrdersGridView` | always-on checkbox gutter, shift-range | in-cell: title, qty, ship-by, condition, note, listing link · row menu: Notes · OOS · Details · bulk: copy, print(product), delete (+2 stubs) |
| 2 | `shipping` › **Tested** | same component, tester/tested-at column set | same | same |
| 3 | `shipping` › **Packed** | same component | same | same |
| 4 | `shipping` › **Shipped** | same component | same | same (delete branches to packer-log) |
| 5 | `shipping` › **FBA** | own board table | **none** (explicitly opts out) | one row action: remove the only line from a plan; empty-state "plan first shipment" CTA |
| 6 | `inbound` › **Triage** | receiving lines table | a **separate, non-shared** edit-mode/bulk mechanism | its own set |
| 7 | `inbound` › **Unbox** | receiving lines table | gated checkboxes (armed via edit mode) | shared receiving bulk bar whose **only** action is "Dismiss" |

Surfaces 1–4 share **one component and one persisted column layout** (`tableId='orders'`). Surface 5 is a different family. Surfaces 6–7 are a different domain (inbound cartons, not orders) and a different selection mechanism.

### 4c. What we need from you

**A full surface × plane matrix.** Rows = actions. Columns = the four planes (in-cell / row-scoped / multi-select / record). For every entry:

- the **surface(s)** it appears on, and where it must **not** appear (lifecycle-inappropriate),
- the **plane** it belongs in — exactly one primary,
- **build tier**: (a) wired today, (b) needs wiring, name the endpoint from §4a, (c) blocked, say on what,
- for (b) entries on a bulk row: whether the existing `orderIds[]` capability makes it a bar action or whether it needs a batch-edit inspector (your Q7 answer said leaders do both — pick for us).

**Four specific questions inside the matrix:**

1. **Do `allocate` / `release` / `substitute` belong in a table plane at all?** They mutate physical unit reservations. Candidates: table row menu, record inspector, or station-only (never on the dashboard). Pick, and say why.
2. **Should FBA (surface 5) and Receiving (6–7) get a selection gutter?** A sibling ratified ruling says the empty selection gutter should **collapse** on surfaces with no selection. So the choice is: give them real selection + a real bar, or collapse the gutter. Not both.
3. **Is "Dismiss" an acceptable sole bulk action for Unbox**, or is a one-action bar worse than no bar?
4. **Make "per table" a rule, not a footnote.** You footnoted that "per table" means the shared grid family. But surfaces 1–4 are four *lifecycle* stages sharing one component. State the rule for when a lane deserves a divergent action set — e.g. "actions diverge by lifecycle stage; columns and layout do not" — so we can apply it to future lanes without asking again.

---

## 5. Still unanswered from round 1

- **Keymap (round-1 Q18).** Unanswered beyond Escape. Note the conflict is already live: **Shift+F2** is bound *inside the grid row* to open the notes editor, while plain **F2** is the global scan-focus hotkey claimed by the most recently mounted scan bar, and ⌘K is the global command bar. Give the full map: open inspector, close, next/prev record, commit, revert.
- **Reduced-motion form.** Our motion presets route through hooks that collapse transforms to opacity under `prefers-reduced-motion`. State the reduced form of whatever you recommend in §3.
- **Citations.** Round 1 asked for named products with cited sources and versions checked. The round-1 response contained none. Please cite this round — particularly for §3.1 (navigator auto-collapse), R4 (instant swap vs. crossfade), and the ~360px minimum inspector width claim.
- **Test surface.** Four Playwright specs assert current panel behavior (`order-full-page`, `order-tracking-edit`, `dashboard-search-exact-open`, `dashboard-search-order-detail`). Flag which of your recommendations invalidate an assertion.

---

## 6. Deliverable format

1. **§2 rulings** — R1 as a *rule*, R2/R3/R4 as decisions with reasoning. Mark any reversal of round 1 explicitly.
2. **§3 push re-ruling** — adopt-with-contract or decline-on-merits, answering all four sub-questions, with the navigator-budget contract or the resizable-overlay spec (default width + persistence scope).
3. **The matrix** — surface × plane, every entry carrying plane + build tier + endpoint, plus the four questions in §4c answered inline.
4. **The "per table" rule** — one sentence we can put in a house rules file.
5. **Keymap table** — key, scope, action, conflict resolution.
6. **Citations** — inline, with the version/date checked.
7. **A "not yet" list** — anything in this brief you think we should not build.
