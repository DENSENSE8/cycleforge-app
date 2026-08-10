# RFC — Scan-station cockpit: the DO / KNOW split

**Status:** proposed · needs ratification before any code · **Lane:** main (dogfood) · **Opened:** 2026-08-09

**One line:** For every scan station, the **work plane (centre + dock) holds the one armed action** for the current beat, and the **right-edge Displays column becomes a step-driven cockpit** that auto-shows *exactly the reference the current step needs* — the manual, the spec, the position, the one de-risking fact.

This overturns "**deck = centre hero**" and evolves "**no ambient always-on right-edge region**." It does **not** add a third right-edge grammar: the cockpit is the *same* `StationDisplaysPushColumn`, made default-open and step-aware.

---

## 0. The principle (new)

> **A scan station separates DO from KNOW.** The centre + dock are what the operator's **hands** do right now — the single armed action (scan-to-print, capture the serial, pick the grade). The right rail is what the operator's **eyes** need to do it — the current step's reference (manual, spec, checklist position, key fact). One derivation drives both; the rail follows the step.

Grounding: instrument-panel P2 (*procedure is the product*), P5 (*one commit per beat*), P7 (*calm instrument*). The centre stays "the screen serves the scan" (Station contract).

**The word that does NOT survive: "everything."** We move the **reference** to the rail and keep the **action** in the centre. Everything-important-in-the-rail rebuilds the noticeboard problem the retired region had.

---

## 1. The ruling (proposed SoT edits — approve wording before I touch `source-of-truth.md`)

### 1a. Rewrite — `source-of-truth.md` → *Scan-station procedure focus deck*

**Before (today):** "The Procedure Focus Deck remains the hero on the `unbox-work` lane … the centre column shows this deck." Prominence table ranks the centre deck **#1 Primary**.

**After (proposed):** The deck **splits** into two jobs and stops being a centre list:

| Job | Home | Was |
|---|---|---|
| *What do I do now* (the armed action) | **Work plane** — centre + dock's active-step control | centre deck row |
| *Where am I / what do I need* (position + reference) | **Cockpit rail** — default-open `StationDisplaysPushColumn`, step-driven | right-edge checklist Display (operator-opened) |

- The centre `ProcedureDeck` as a **list of steps** is **retired** (main Unbox already doesn't mount it — main becomes the model, not the exception).
- The step *pointer* (`resolveActiveStep`) and *vocabulary* (`deriveProcedureSteps`) are unchanged — still **one derivation**. It now yields, per step, both the **action** (dock control) and the **rail leaf** (which Display the rail auto-shows).
- Prominence is re-ranked: **#1 the armed action (work plane)**, **#2 the cockpit rail (step reference + position)**. No centre step-list.

### 1b. Evolve — `source-of-truth.md` → *Right-rail modality*

**Keep** "exactly two right-edge grammars; no third." **Keep** "a surface visible while working is a Display, not a region that outranks the picker."

**Add the step-cockpit clause:**

> A Station Displays column **MAY open by default and auto-select its leaf from the active procedure step** — the *step cockpit*. This is **not** the retired ambient region: it is the same `StationDisplaysPushColumn` (still exclusive, still operator-closable via `→|` / ⌘]), and it is **driven by the step** rather than pinned beside the picker as a second permanent consumer. The distinction that keeps it legal: it is the picker's **own** edge showing the picker's **current step's** reference — not a second edge outranking it. The moment the operator closes it, it stays closed until the next carton (auto-follow yields to explicit close, same precedence as "do not fight a manual Displays close" today).

This is the crux: **we do not reinstate the region we retired.** We make the *existing* Displays column smart about *which leaf* and *when*.

### 1c. Evolve — the checklist / progress

The procedure **checklist ("where am I")** folds into the default-open cockpit rail as a compact **position header**; the scan-progress **ring** stays the position indicator and the manual re-open control. Still a Display, now default-open + step-driven (an evolution of "the checklist is a Display the operator picks").

### 1d. New detail file — `.claude/rules/display/scan-cockpit.md` (contract outline)

- **Work plane = the armed action.** Centre + dock render the current step's single control (scan-to-X). Never a reference wall in the centre; never two competing primaries (P5).
- **Rail = the step's reference, single-purpose.** It shows *only* what THIS step needs and **auto-swaps** as the step changes. A rail that shows "everything important" is a noticeboard and is banned.
- **One derivation drives both.** A step declares `action` (dock control — existing `UNBOX_STEP_DOCK_CONTROLS`) **and** `railLeaf` (the Display leaf that is its reference). A step with no rail reference declares that with a reason (mirror the dock's `UNBOX_STEPS_WITHOUT_DOCK_ACTION` either-or) — neither map, or both, fails CI.
- **Auto-follow yields to explicit close.** Rail opens/swaps on step advance; operator `→|` / ⌘] close wins until next carton. Wedge focus is never stolen when the rail opens (existing rule).
- **No new region, no new grammar.** The cockpit IS `StationDisplaysPushColumn`. Frame budget unchanged (center locks 720; Displays fills leftover — both-open is already the sandwich).
- **Paint order unchanged.** Rail strip chrome is P3; leaf **bodies** stay `dynamic()` (manual/timeline never enter the P1 path).

### 1e. Guards to add

- `scan-cockpit.guard.test.ts` — (a) rail opens by default when the active step declares a `railLeaf`; (b) the step→railLeaf and step→action maps are both total-or-declared-absent; (c) the cockpit is `StationDisplaysPushColumn` (no new region component); (d) auto-follow yields to explicit close.
- Extend `procedure-step-dock.guard.test.ts` — add the step→`railLeaf` either-or beside the existing step→action either-or.
- `station-displays-reachability.guard.test.ts` — unchanged, still green (rail leaves are declared Displays).

---

## 2. Unbox-first plan (golden)

**Phase 0 — Ratify.** This RFC approved; I edit `source-of-truth.md` (1a–1c) + write `display/scan-cockpit.md` (1d). No station code yet.

**Phase 1 — Unbox golden.**
1. **Extend the derivation:** add `railLeaf?` per step in the step vocabulary; one resolver returns `{ activeKey, action, railLeaf }` from `useUnboxProcedureSteps` (no second store).
2. **Default-open, step-driven rail:** on carton open + on `activeKey` change, `openDisplays(step.railLeaf)` — unless the operator has explicitly closed the column this carton (respect close; reset on next carton).
3. **Rail body = step reference + position:** the active step's leaf (e.g. manual / spec / units / photos) plus a compact step-position header folding in the checklist; ring stays the indicator.
4. **Centre = armed action only:** PO lines + label preview stay; confirm the dock's active-step control is the single armed CTA (scan-to-print etc.). No centre step-list.
5. **Guards:** add `scan-cockpit.guard.test.ts`; extend `procedure-step-dock.guard.test.ts`.
6. **Copy:** rail auto-opens; `→|` / ⌘] closes; reopening lands the current step's leaf. Wedge focus preserved.
7. **Dogfood-tune the step→railLeaf map** at the bench (which reference each step needs is tuned, not frozen in this RFC).

**Phase 2 — Siblings, one at a time, only after Unbox is bench-verified.**
- **Testing** — already has `units · ticket · listing · …` Displays; add step→railLeaf + default-open.
- **Shipping** — finish moving the centre `Units` tab to a Display (already flagged), then add step→railLeaf + default-open; drop the `Pack · Units` `SectionTabsSlider` (Pack becomes the lone centre surface).
- **Pack, Arrival** — same contract; Arrival's door-flow reference (Pairing/Classify) becomes its step rail.
- Each behind `scan-cockpit.guard.test.ts`; never port N stations in one pass (pattern-evolution).

**Phase 3 — Retire.**
- Park/retire the centre `ProcedureDeck` on the `unbox-work` lane; update `display/station-workbench.md` deck sections and remove the deck-as-centre-hero prose.
- Prune the superseded "no always-on region" absolute where the cockpit clause replaces it (keep the "no third grammar" half).

---

## 3. Open questions / risks

- **Auto-follow vs. operator intent** — precedence is "explicit close wins until next carton." Confirm that's the behavior you want (vs. auto-reopen on every step).
- **Which reference per step** — dogfood-tuned in Phase 1; not frozen here. Sane start: serial→units, condition→condition/manual, contents→PO contents, label/print→label face + manual.
- **LCP** — rail default-open must keep leaf bodies `dynamic()` so the manual/timeline never enter first paint.
- **Per-station maps** — step→railLeaf is per-station (like the dock map), not one global table.
- **Non-procedure benches** (Labels) — out of scope; they keep their flush centre tabs.

---

## Anchors
- Laws to edit: `.claude/rules/source-of-truth.md` → *Scan-station procedure focus deck* · *Right-rail modality* · new `.claude/rules/display/scan-cockpit.md`; `.claude/rules/display/station-workbench.md` (deck sections) · `.claude/rules/display/instrument-panel.md` (P2/P5/P7 reinforce).
- Unbox: `useUnboxProcedureSteps`, `deriveProcedureSteps`, `resolveActiveStep`, `UNBOX_STEP_DOCK_CONTROLS`, `LineEditPanel` (openDisplays), `StationDisplaysPushStack`.
- Guards: `scan-cockpit.guard.test.ts` (new) · `procedure-step-dock.guard.test.ts` · `station-displays-reachability.guard.test.ts`.
