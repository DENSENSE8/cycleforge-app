# Research briefing — Unbox bottom dock as **step studio only** (kill Print-label terminal + hardcoded metrics)

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers; open the real files.
**From:** Cycle Forge engineering
**Date:** 2026-08-08
**Repo state:** `main` @ `16d13846e` (dogfood lane; attach `:3050`, never start/restart)
**Continues / supersedes for dock intent:**  
[`unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md`](./unbox-input-locus-inversion-GEMINI-RESEARCH-BRIEFING.md) ·  
[`unbox-dock-listing-compare-LANE1-HANDOFF.md`](./unbox-dock-listing-compare-LANE1-HANDOFF.md) ·  
plan `unbox_dock_step_sync` (activeKey sync · under-dock pulse · `UnboxDockScanEntry` — **landed in working tree**)  
**Sibling (do not mix):** Testing QC Lane 2 — [`testing-qc-dock-works-as-listed-LANE2-HANDOFF.md`](./testing-qc-dock-works-as-listed-LANE2-HANDOFF.md)

> **What we want back is a RULING that destroys the SoT blockers**, plus paste-ready **source-of-truth / station-workbench rewrites** and a deletion-ordered build plan — not a mood board. Where house law currently forbids the product ask, **say the law is wrong**, write the replacement law, and name every guard that must flip.

---

## The report that started this (operator + screenshot)

Operator dogfood on `/unbox` (2026-08-08). Bottom floating dock paints as a **Print-label-only** shell:

- Elevated white `Panel` (rounded, raised)
- Trailing split primary: chevron + printer + **"Print label"**
- Notes FileText may be present; **no step CTA, no dock keyboard entry, no under-dock step face**
- Far-right Displays / utility chrome unrelated to the step machine

That is the failure mode this brief exists to kill.

**Product ask (locked intent for this brief):**

1. The bottom dock is a **step-by-step studio** — contextual to the shared procedure pointer (`activeKey`).
2. **No Print label / Print · Receive terminal in this dock** while the operator is in the procedure. Commit/print is not the dock’s job during capture.
3. **No hardcoded display metrics** in the dock (no % ring that is not the live procedure derivation; no vanity KPI; no stale “1/9” chrome that disagrees with the pointer).
4. **Exact updates** — checklist (Displays), under-dock step face, step CTA, and dock keyboard entry are one derivation; selecting a step from the checklist updates the dock face + pulse + entry meaning immediately.
5. Always a wedge-owned keyboard entry on every step (serial surface *is* the entry on `serial`; no dual field).

Screenshot artifact (local):  
`~/.cursor/projects/Users-icecube-repos-cycleforge-app/assets/Screenshot_2026-08-08_at_11.55.20-*.png`

---

## 0. How to use this brief

### 0.1 Verify in the repo (mandatory)

- Open every path in §2–§4 before asserting.
- Quote `file:line` for load-bearing claims.
- Mark inference `[UNVERIFIED]`.
- If a line has moved since `16d13846e`, say so.

### 0.2 Search the web (mandatory for §6)

Industry RF / MES / WMS station chrome 2024–2026: where Print / Receive / Confirm live vs the step prompt; whether a scan waist ever co-mounts a carton terminal; how “procedure complete” surfaces commit without polluting mid-procedure chrome. Cite primary docs.

### 0.3 Deliverables (keep separate)

| # | Deliverable |
|---|---|
| **D1** | **Industry ruling** — name the grammar (RF prompt · wizard · guided work · …). Where does commit (print/receive) live when capture is step-driven? |
| **D2** | **Blocker destruction** — for each SoT / guard in §3 that forces Print·Receive always-on or metric chrome in the dock, either (a) rewrite the law (paste-ready markdown for `.claude/rules/…`) or (b) prove the product ask is wrong. **No “keep both forever.”** |
| **D3** | **Hardcoded-metrics inventory** — list every metric/face in the Unbox dock float that is not the live procedure pointer + step evidence; mark delete / relocate / keep. |
| **D4** | **Step-studio composition** — ASCII anatomy of the dock after the cut (keyboard · step CTA · notes · under-dock pulse). Explicitly **omit** Print·Receive. |
| **D5** | **Where Print · Receive go** — one home only (identity band · Displays leaf · post-settle dock mode · centre label · …). Deletion-ordered migration with `file:line`. |
| **D6** | **Paste-ready SoT patches** — full replacement paragraphs for the rows named in §5 (not “update the docs”). |
| **D7** | **Guard flip list** — every `*.guard.test.ts` assertion that must change, with before→after regex or assert intent. |
| **D8** | **Claude Code P0 prompt** ≤40 lines an implementing agent can paste on `:3050` dogfood. |

### 0.4 Non-goals (DO NOT PROPOSE)

- Remount centre `ProcedureDeck` / `UnboxProcedureDeck` on main dogfood.
- Import `UnboxDockHost` into Testing (Lane 2).
- Archive \| Reticle \| Queue redesign of the dock.
- Bare Digit hotkeys; second search engine; page-local motion twin; raising DS/knip baselines.
- Keeping Print·Receive in the dock “but smaller” if D2 ruled it out — that is not destruction.

### 0.5 Paste prompt (give this entire file to Gemini)

```
Read docs/todo/unbox-dock-step-studio-only-GEMINI-RESEARCH-BRIEFING.md end-to-end.
Open the cited repo files. Deliver D1–D8. Where house law blocks the product ask,
rewrite the law (D2 + D6) — do not preserve Print·Receive-in-dock as sacred.
No invented paths. No “it depends” without a forced pick.
```

---

## 1. Product frame

**Cycle Forge** — multi-tenant reseller-ops SaaS. USAV is dogfood only.  
`/unbox` is the **Station** golden: scanner-driven, one active carton, Displays push for reference, bottom dock for **action**.

House pattern evolution (`.claude/rules/pattern-evolution.md`): compose named SoT → grow SoT when wrong → compound. **This brief expects SoT growth** — the current “trailing terminal never hidden” law is the primary blocker against the product ask.

---

## 2. What already exists (2026-08-08) — do not re-invent

### 2.1 Procedure pointer (one derivation)

| Piece | Path |
|---|---|
| Pure pointer | `src/lib/receiving/procedure-pointer.ts` — `resolveActiveStep`, `shouldReleaseFocusAfterEvidence` |
| Hook | `src/components/receiving/workspace/line-edit/useUnboxProcedureSteps.ts` |
| Checklist | `UnboxProcedureChecklist` → DS `ProcedureChecklist` with **`activeKey`** (selection paint follows focus override) |
| Under-dock face | `UnboxProcedurePager` — amber track + `framerTransition.selectionPulse` on `activeKey` |
| Step CTA band | `UnboxStepDock` + `UNBOX_STEP_DOCK_CONTROLS` (`steps/dock/`) |
| Keyboard entry | `UnboxDockScanEntry` — `[data-unbox-dock-scan]`; hidden on `serial` (serial surface owns wedge) |
| Host | `UnboxDockHost` — leading · FileText notes · **trailing terminal** · under-dock pager + ring |
| Mount | `LineEditPanel.tsx` — `embeddedTerminal` = `StationTerminalDock` |

### 2.2 Why the screenshot can show Print-label-only

Read `useUnboxLineController.ts` (~740–773): when the line **is already received**, primary label collapses to **`Print label`**.

Combined with:

- `UnboxProcedurePager` returns `null` when `!active` (settled / no `activeKey`)
- `UnboxDockScanEntry` returns `null` when `!settled || !activeKey || activeKey === 'serial'`
- `UnboxStepDock` may render empty leading for actionless / unsettled

…the dock **honestly collapses to notes + Print·Receive**. That collapse is exactly what the operator sees as “hardcoded Print label chrome” — a carton-terminal dock with no step studio.

### 2.3 Metrics currently in/near the dock

| Face | Source | Live? | Problem |
|---|---|---|---|
| Under-dock `%` ring | `UnboxScanProgressControl` → `done/total` from `useUnboxProcedureSteps` | Live derivation | Competes with step studio; reads as KPI; opens checklist — **metric-as-jump** tension with nav-keys law |
| Checklist `done/total` chip | `UnboxProcedureChecklist` header | Live | OK on Displays; must not reappear as dock vanity |
| Pager summary (`Use › when ready`, `Once for line`, `N of M`) | `useUnboxProcedureSteps` summaries | Live / intentional | Keep if it names the **step ask**, not a dashboard metric |
| Displays “Show checklist · 1/9” | edge chrome | Live | Outside dock float — out of scope unless it yanks focus |

**“Hardcoded display metrics”** in the operator ask means: anything in the **dock float** that is not the active step’s ask + keyboard + CTA — especially Print-label and the % ring when they dominate an empty leading zone.

---

## 3. The SoT / guard blockers (destroy these or the product cannot ship)

### 3.1 Laws that force Print·Receive in the dock

Embedded today (must open and quote):

| Law | Location | Load-bearing sentence |
|---|---|---|
| Unbox centre dock = step CTA · notes · **Print · Receive** | `.claude/rules/source-of-truth.md` → **Unbox centre (main)** | Host lists Print · Receive as first-class dock contents |
| Trailing terminal **never hidden** | `.claude/rules/display/station-workbench.md` → dock zones table | “Print · Receive. **Never re-labelled, never step-scoped, never hidden, never animated.**” |
| Cross-region ban | same file | Displays must not re-label the bottom commit — used to justify carton-scoped terminal |
| AGENTS one-liner | `AGENTS.md` / SoT map | Unbox dock includes Print · Receive |
| Guard | `unbox-dock-one-shell.guard.test.ts` | Asserts `StationTerminalDock` in host trailing |
| Guard | `unbox-right-edge-chrome.guard.test.ts` | Prose expects Print · Receive in UnboxDockHost |
| Terminal registry | `STATION_TERMINAL_REGISTRY` / `useStationTerminalAction` surface `unbox` | `hasSectionTabs: false`, `defaultKind: 'mode-default'` → always Print·Receive VM |

**Your job in D2:** either relocate commit (D5) and rewrite these laws (D6), or prove the operator must keep Print in-dock during capture (then rewrite the product ask — unlikely given the screenshot).

### 3.2 Laws that already support step studio (keep / grow)

| Law | Location |
|---|---|
| Card reads; dock acts | `station-workbench.md` → leading = step ACTION |
| One procedure derivation | `useUnboxProcedureSteps` + checklist + pager |
| Display metrics ≠ jump targets | `source-of-truth.md` → Nav keys / metrics in under-dock |
| Wedge focus hand-back | `receiving-focus-scan` + `[data-unbox-dock-scan]` sidebar skip |
| Motion | `@/design-system/motion` + `selectionPulse` for selected step |

### 3.3 Partial landings that must not be abandoned

- `UnboxDockScanEntry` + owner marker
- Checklist `activeKey` selection paint
- Pager selection pulse / armed track
- Photo Compare leaf (Displays) — capture stays dock; do not yank Ticket/Move/Send

---

## 4. Forced product questions (answer each with one pick)

**Q1 — Commit home.** While capture steps remain, Print · Receive lives in:  
(A) nowhere visible until procedure settles · (B) identity / context band · (C) Displays leaf · (D) dock trailing only after `activeKey === null` · (E) centre under label preview.  
**Pick one.** If (D), define the settle signal precisely (all capture done vs received stamp vs label step).

**Q2 — Empty leading.** On actionless `arrival_check` / `classify`, dock shows:  
(A) keyboard entry only · (B) keyboard + › · (C) honest empty + pager.  
(Landed code ≈ A+B via entry + pager.)

**Q3 — Progress ring.** Under-dock `%` ring:  
(A) delete · (B) keep as checklist opener only (no % numeral) · (C) keep % but demote visually under step face · (D) move to Displays only.  
Must reconcile with “no hardcoded metrics” and nav-keys “metrics are not jump targets.”

**Q4 — Received cartons.** When `isReceived` and primary would be Print label:  
(A) hide dock terminal; show “procedure complete” studio · (B) swap dock to print-only mode (current) · (C) leave Unbox for Labels station.  
The screenshot is this state — **ruling must make that screenshot illegal on a capture-focused Unbox open.**

**Q5 — Notes.** FileText notes toggle: keep in dock / move / delete from procedure dock?

**Q6 — Family blast.** Does “no terminal in procedure dock” apply only to Unbox, or to every Tier-A station that copies `UnboxDockHost`? Name the blast radius.

---

## 5. Paste targets — SoT files Gemini must rewrite (D6)

Produce **replacement markdown blocks** (full paragraphs) for:

1. `.claude/rules/source-of-truth.md` → **Unbox centre (main)** (dock contents bullet)
2. `.claude/rules/source-of-truth.md` → any **Print · Receive in UnboxDockHost** one-liners in the map table
3. `.claude/rules/display/station-workbench.md` → **The Unbox dock is carton-terminal** section + zones table (Leading / Trailing)
4. `.claude/rules/display/station-workbench.md` → ASCII dock diagram (`[step CTA] … [Print · Receive]`)
5. `AGENTS.md` hard-law one-liner for Unbox centre / dock (if present)
6. Guard intent comments in:
   - `unbox-dock-one-shell.guard.test.ts`
   - `unbox-right-edge-chrome.guard.test.ts`
   - `procedure-step-dock.guard.test.ts` (only if terminal assumptions appear)

Also name follow-ons:

- `src/lib/station-terminal/` — new kind or Unbox exemption
- `LineEditPanel.tsx` — stop mounting `embeddedTerminal` during capture
- `useUnboxLineController.ts` — Print label collapse must not empty the studio

---

## 6. Industry research asks (D1)

Against SAP EWM RF, Manhattan / Blue Yonder / Oracle WMS RF, Tulip / Parsable guided work, Zebra/Honeywell bench UX:

1. Is **commit (print / putaway / receive)** co-mounted with the **active prompt**, or gated after the prompt list?
2. Do RF menus show a persistent “Print label” when the operator is mid serial/photo capture?
3. What is the industry name for “fixed scan waist + swapping prompt + Enter advances”?
4. How do systems show **progress** without turning the prompt bar into a KPI dashboard?

Scale: small multi-tenant reseller SaaS, wedge scanner at a desk — not a dedicated RF gun fleet.

---

## 7. Proposed target anatomy (strawman — Gemini may replace, not dilute)

```
┌─────────────────────────────────────────────────────────────┐
│ [dock scan entry]  [step CTA / pills / Link·Send / ack] [📝] │  ← h-11 Panel only
└─────────────────────────────────────────────────────────────┘
  ‹ SHIPPING LABEL · 0 shots ›          (pulse + armed track)
       ↑ under-dock step studio — NOT % KPI, NOT Print
```

- **No** `StationTerminalDock` in this Panel during capture.
- Checklist click ↔ `focusStep` ↔ pager pulse ↔ entry placeholder/meaning.
- After settle (Q1/Q4): either a **commit mode** that mounts Print·Receive once, or navigate to Labels — Gemini picks in D5.

---

## 8. Deletion-ordered migration (strawman for D5/D8 to refine)

1. **SoT rewrite** (D6) + guard flips (D7) — laws first, then code.
2. Gate `embeddedTerminal` in `LineEditPanel`: mount only when commit mode (Q1/Q4).
3. Ensure unsettled / in-procedure always mounts `UnboxDockScanEntry` + pager (never Print-only empty leading).
4. Relocate or demote `%` ring per Q3.
5. Received + Print label: illegal as sole dock face on Unbox capture open.
6. Dogfood `:3050` full carton walk; `npm run verify` — no baseline raises.

---

## 9. Acceptance (definition of done for the eventual implement)

- [ ] Opening any in-procedure carton never shows Print-label-only dock.
- [ ] Dock face = keyboard + step CTA + notes; under-dock = pulsed step context.
- [ ] Checklist selection updates dock within the same pointer tick.
- [ ] No `%` / vanity metric that is not live procedure ask (per Q3 ruling).
- [ ] Print · Receive has exactly one new home (D5); guards enforce it.
- [ ] SoT files match code; Lane 2 Testing untouched.
- [ ] Full `npm run verify` green for lane-owned files.

---

## 10. Related code anchors (open these)

```
src/components/receiving/workspace/LineEditPanel.tsx
src/components/receiving/workspace/line-edit/UnboxDockHost.tsx
src/components/receiving/workspace/line-edit/UnboxStepDock.tsx
src/components/receiving/workspace/line-edit/UnboxDockScanEntry.tsx
src/components/receiving/workspace/line-edit/UnboxProcedurePager.tsx
src/components/receiving/workspace/line-edit/UnboxProcedureChecklist.tsx
src/components/receiving/workspace/UnboxScanProgressControl.tsx
src/components/receiving/workspace/line-edit/hooks/useUnboxLineController.ts
src/components/station/terminal/
src/lib/station-terminal/
src/design-system/components/procedure/ProcedureChecklist.tsx
.claude/rules/source-of-truth.md
.claude/rules/display/station-workbench.md
AGENTS.md
src/components/receiving/workspace/line-edit/unbox-dock-one-shell.guard.test.ts
```

---

**End of briefing.** Prefer destroying the always-on Print·Receive dock law over preserving a screenshot the operator already rejected.
