# Handoff — Unbox Displays column + the emptied centre (Lane E follow-through)

**For:** implementing agent (Claude Code / Cursor)
**From:** Lane E
**Date:** 2026-08-01
**Status:** Lane E **shipped** (`7d014d37a`, docblocks `33a3eb609`) — this is the follow-through
**Lane index:** [`unbox-LANES-INDEX.md`](./unbox-LANES-INDEX.md)
**Origin plan:** [`unbox-E-tabs-to-right-rail-PLAN.md`](./unbox-E-tabs-to-right-rail-PLAN.md) · [prompt](./unbox-E-tabs-to-right-rail-EXECUTION-PROMPT.md)

---

## 0. One-sentence state

The Unbox workbench body no longer has a tab strip: the centre is the carton
(PO lines → label preview), the eight other displays plus the PO-pairing pencil
live in the right-edge **Displays** push column, and the bottom dock is
carton-terminal (Print · Receive) — what remains is **durability, discoverability
and one unresolved grammar collision**, not more relocation.

---

## 1. What shipped — locked, do not re-litigate

| Decision | Where | Why it is not up for debate |
|---|---|---|
| Displays is a **push column**, not a `RightRailHost` occupant | `ReceivingDisplaysPushStack` | The occupant slot is single-occupancy and Unbox already contended it three ways. A fourth registrar is a contract violation (`source-of-truth.md` → Right-rail modality). |
| All four Unbox right-edge columns compose **one shell** | `UnboxPushColumn` | Ticket / Claim / tool were three copies of the same 60 lines. A fifth hand-rolled aside is the fork `pattern-evolution.md` bans. |
| The dock is **carton-terminal** | `STATION_TERMINAL_REGISTRY.unbox` = `hasSectionTabs: false` + `defaultKind: 'mode-default'` | A right-panel click re-labelling the bottom primary is cross-region action-at-a-distance. `UNBOX_TAB_TERMINAL` and all three tab bridges are deleted. |
| A tab-scoped action is a **local control in its own body** | `LinePoNoteCard` Save/Sync · `LineChecklistTab` Check all · `CartonUnitsRollupBody` Prebox | Same reason. Never re-thread a bridge to the dock. |
| `null` **is** closed | `resolveUnboxSideTab` | One piece of state, so there is no "active tab while hidden" to drift. Do not add an `isOpen` boolean. |
| Displays is **lowest precedence** on the edge | `LineEditPanel` `showDisplays` | An exception surface (Claim / Ticket) or a just-launched tool outranks reference reading. |

Law is written down in `.claude/rules/display/station-workbench.md` and
`source-of-truth.md` → Right-rail modality. **Change the code and the rule together
or not at all.**

---

## 2. Read first

| Concern | Path |
|---|---|
| The anatomy you are extending | `.claude/rules/display/station-workbench.md` |
| Right-edge occupancy + modality | `.claude/rules/source-of-truth.md` § Right-rail modality |
| URL-as-state (item 3.1 depends on it) | `.claude/rules/display/workbench.md` § URL-as-state |
| The shell | `src/components/receiving/workspace/UnboxPushColumn.tsx` |
| The column | `src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx` |
| Which tab / open-closed | `src/components/receiving/workspace/line-edit/unbox-side-tabs.ts` (+ `.test.ts`) |
| Tab bodies + the centre | `line-edit/terminal/unbox-tabs.tsx` (`buildUnboxOverview` / `buildUnboxSideTabs`) |
| Wiring + exclusion | `LineEditPanel.tsx`, `line-edit/unbox-right-edge.ts` |

---

## 3. Open work — ranked, with the reason each is real

### 3.1 — Displays has no URL state — **DONE**

Shipped as `?display=<tab>` via `useUnboxDisplayView`, registered on
`UNBOX_ROUTE_PARAMS`, covered by `useUnboxDisplayView.test.ts` +
`receiving-param-isolation.spec.ts`. **Absence is closed** — no second flag.

**It surfaced a live bug worth knowing about.** Opening Claim did *not* drop
`?display=`, so a reload reopened two right-edge surfaces at once. Cause: the
panel cleared the display in a sibling `useEffect` while `setClaimView` wrote the
URL, and both built from the same stale `searchParams` snapshot — the second
`router.replace` resurrected what the first deleted. Fix: the exclusion is now
**one URL write**, `clearPeerRightEdgeParams(next, keep)` in
`line-edit/unbox-right-edge.ts`, called inline by all three hooks.
**Never clear a peer's param from an effect.** Pinned by
`unbox-right-edge.test.ts`, including a registry test so a fourth push column
cannot be added without joining the exclusion.

<details><summary>original write-up</summary>

`requestedSideTab` is local `useState` ([LineEditPanel.tsx:189](../../src/components/receiving/workspace/LineEditPanel.tsx)).
Ticket and Claim are URL-durable (`?ticketView=1` / `?claimView=1`, via
`useReceivingTicketView` / `useReceivingClaimView`); Displays is not. So a reload,
a deep link, or a shared "look at this carton's Zoho note" URL all land with the
column closed — and `display/workbench.md` says durable selection belongs in the URL.

**Do:** add one param (suggest `?display=<tab>`, absent = closed) with a hook that
mirrors the two existing ones, register it on the Unbox route spec in
`src/lib/routing/receiving-routes.ts` (the scan-surface set already carries
`lineId` / `openReceivingId`), and extend `tests/e2e/receiving-param-isolation.spec.ts`
— a bogus value must be dropped exactly like `?unboxview=not-a-tab` is today.
`resolveUnboxSideTab` already handles the "requested tab is gated off" case, so the
parser only has to reject non-members.

**Don't:** reuse `?unboxview=` — that is the queue/viewed **browse** tab and the
collision is exactly the `?sort=` mistake the grid rules call out.

</details>

### 3.2 — The only entry is the parked strip; discoverability is unproven

Displays opens from `ReceivingPushExpandStrip` (Layers icon, right edge) or from
the identity header's tracking / listing / classify faces. That is the standard
house collapse-strip grammar, but **no operator has used it yet.** The strip is
32px of chrome carrying the single most-used secondary surface.

**Do:** bench-trial before adding a second entry point. If it fails, the cheapest
fix is a labelled control in `StationMoreDetails` (the sanctioned home for corner
utilities), **not** re-growing a strip in the workbench body.

### 3.3 — The pencil is remote from its effect

`PairingTogglePill` sits in the Displays strip `rightSlot`, but Package Pairing
renders in the **centre** (`POUnboxingSection`). That is action-at-a-distance of
the same shape §1 forbids for the dock — accepted here only because the operator
asked for the pencil to move with the tabs. `openPoPairing` on the identity `#`
chip keeps pairing reachable with the column closed, so the affordance is not lost.

**Decide:** either move the pencil back beside the thing it opens, or move
Package Pairing into a display. Do not leave it undecided a second time.

### 3.4 — Two right-edge grammars — **DONE (the premise died)**

Written up expecting a decision rule for "ambient region vs push column". By the
time it was picked up, **one grammar had won**: the ambient region built for the
Unbox procedure (`procedure-store.ts`, `RightRailProcedureRegion`,
`useRegisterRightRailProcedure`, `UnboxProcedureRail`) was deleted, and the
procedure became the **`checklist` display inside the Displays push column**
(`UnboxProcedureChecklist`, primary).

So the rule recorded in `source-of-truth.md` → Right-rail modality is not a
chooser — it is a **closed door**: exactly two grammars (RightRailHost float ·
station push column), no ambient always-on region, and the reason it must not be
rebuilt (a second permanent consumer of an edge whose host renders exactly one
occupant by construction). The positive form: *a surface that should stay
visible while the operator works is a DISPLAY the operator picks, not a region
that outranks the picker.*

Also corrected `procedure-divergence.guard.test.ts`, which still called it "the
right-rail checklist at the bench".

**Note for whoever reads this next:** the retirement rationale above is
**structural — inferred from the code**, not quoted from the lane that did it.
If that lane wrote down a different reason, theirs wins; fold it in.

### 3.5 — Promote the expand strip to a DS primitive

`ReceivingPushExpandStrip` is the **second** consumer of
`CONTEXT_PANEL_COLLAPSE_STRIP_CLASS` (the first is `ContextPanelLayout`), and it
adds stacking (`gap-1.5`) that the original does not have. Two call sites is the
house threshold.

**Do:** promote to a DS `EdgeExpandStrip` that takes N controls; migrate both.
Guard lives at `src/components/sidebar/context-panel-collapse.guard.test.ts`.

### 3.6 — Two affordances were dropped, not relocated

Cutting the tab→dock coupling retired two dock actions with no local home:

- **Units → "Add serial"** — it switched to `overview` and focused the scan input. The scan input is now permanently on screen, so the jump is redundant. Believed safe.
- **Timeline → "Copy tracking"** — the identity chip and the timeline's own `CopyChip` refs already copy it. Believed redundant.

**Do:** confirm both at the bench. If an operator reaches for either, add it as a
local control in that display — never back onto the dock.

### 3.7 — Permanent E2E for the column — **DONE**

`tests/e2e/unbox-displays-column.spec.ts` exists (4 tests: empty centre + strip
opens · dock label byte-identical across a tab switch · display survives reload ·
Claim takes the edge and clears `?display=`).

**Status:** all 4 green on `qa-desktop` against `:3050`, plus 4 in
`receiving-param-isolation.spec.ts`.

Two things learned writing it, both worth keeping:

- **Do not pin which displays sit on the strip vs under ⋯.** That split is a
  per-lane taste call (`classifyOnStrip`) and it moves — Checklist went
  strip-ward the moment it started deriving step states, breaking a spec that
  navigated through the ⋯ menu. `selectDisplay()` tries the strip, then the
  menu. What the test asserts is that the DOCK does not move.
- **Do not route a param-ownership assertion through the header Mode menu.**
  Ownership is a property of the ROUTE, so assert it by landing on a surface
  that does not declare the param. The `switchMode` helper is currently red for
  two *pre-existing* tests while GlobalHeader is being reworked; a route-level
  assertion is immune to that.

### 3.8 — Narrow viewport and centre width — **DONE, nothing to fix**

Measured 2026-08-01 in Playwright at the real runner (not the preview pane), on
`qa-desktop`:

| Config | Displays | Centre content column | Frame |
|---|---|---|---|
| 1440, closed | — | **720** (its max) | — |
| 1440, open @ 420 default | push (`relative`) | **636** | workspace width unchanged |
| 1440, open @ 560 ceiling | push (`relative`) | **496** | workspace width unchanged |
| 900, open | **overlay** (`absolute`) | 516 | workspace width unchanged (524) |

**No configuration produced horizontal document scroll**, and the narrow overlay
path — proven for Ticket / Claim but never exercised for Displays — works. The
worry that a 560 ceiling plus a 360 rail would crush the carton does not
materialise: the squeeze lands on the content column, which is `min-w-0` and
yields to 496 without overflowing. **No cap change is warranted.**

Pinned by three tests in `unbox-displays-column.spec.ts` as **invariants, not
pixels** — push vs overlay, workspace width unchanged either way, and no
sideways page scroll including at the ceiling. The measured widths live in a
comment there as the record; they are deliberately not asserted, so a rail or
ceiling re-tune does not fail a test that is really about the frame holding.

### 3.9 — Support tab loses composer state on switch *(pre-existing, now visible)*

The Support hub is gated `activeSideTab === 'support'`, so it unmounts when another
display is selected and a half-typed reply is lost. `SectionTabsSlider` keeps panels
mounted-but-hidden precisely to avoid this; Support opts out for weight. Now that
Support is one click from every other display, the cost is higher than it was.

---

## 4. Hard rules for this surface

- **No new right-rail occupant.** No change to `RightRailHost`, `src/lib/right-rail/store.ts`, or `DetailStackRailRegistrar`.
- **No fifth hand-rolled push aside** — compose `UnboxPushColumn`.
- **Never re-introduce a tab→terminal map** for Unbox, and never re-thread a tab bridge to the dock.
- **`SectionTabsSlider` stays** — ~10 other consumers.
- **One right-edge surface at a time**: Displays ▸ tool ▸ Ticket ▸ Claim ▸ `detail:receiving`.
- `npm run verify` green; **never raise a ratchet baseline**.
- Dev server on **`:3050`** — attach; never start, restart, or kill it.
- E2E on the **QA org** (`qa-desktop`), never the dogfood tenant.
- Commit only when asked; **stage only your own files** — see §6.

---

## 5. Verification bar

- `npm run verify` green, no baseline raised.
- Screenshot proof from `:3050` via Playwright `qa-desktop` — the emptied centre and the populated column.
- The dock label is unchanged across every tab switch (assert it, don't eyeball it).
- Ticket / Claim / tool / Displays / `detail:receiving` mutual exclusion holds.
- Triage / Testing / Shipping / Pack unaffected.

---

## 6. Tree hazard — read before you commit

This checkout has had **four lanes writing it simultaneously**. During Lane E alone,
files were deleted, renamed, and re-imported underneath a running verify more than
once, and `git status` showed another session's staged `git mv`s sitting in the index.

- **Commit by pathspec** (`git commit --only -- <your files>`), not `git add -A` — a plain add sweeps other sessions' staged renames into your commit.
- **Never `git stash`.**
- A red `verify` is not automatically yours. Attribute each gate before fixing anything: at the time of writing, the lint error was `InventoryFulfillmentSyncDialog.tsx` (unclosed JSX), the typecheck errors were stale `.next` types for a deleted `src/app/studio/layout.tsx`, and every knip finding was in the in-flight procedure / right-rail work.
- `.claude/rules/source-of-truth.md` is edited by nearly every lane. Diff it before staging; commit only your own hunk.
