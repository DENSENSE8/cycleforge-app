# Research briefing — Unbox dock **two-band flush floor** (geometry goal for Claude Code)

**For:** Gemini Deep Research / Gemini Pro — **you have read access to this repository.** Paths below are pointers; open the real files.  
**From:** Cycle Forge engineering  
**Date:** 2026-08-08  
**Repo state:** `main` working tree after partial dock tear-down (dogfood lane; attach `:3050`, never start/restart). Tip SHA at brief authoring: `d9e22dbb1` — **verify live files; lines may have moved.**  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Supersedes / continues (read; do not re-litigate closed picks):**

| Doc | Owns | Status vs this brief |
|---|---|---|
| [`unbox-dock-step-studio-only-GEMINI-RESEARCH-BRIEFING.md`](./unbox-dock-step-studio-only-GEMINI-RESEARCH-BRIEFING.md) | Kill Print·Receive during capture; settle-state commit | **Partially landed** — terminal yield exists; **geometry failed** |
| [`unbox-dock-flush-floor-entry-GEMINI-RESEARCH-BRIEFING.md`](./unbox-dock-flush-floor-entry-GEMINI-RESEARCH-BRIEFING.md) | Flush floor · serial-dominant · DenseCompose notes | **Partially landed** — Panel/gutters stripped; **floor still collapsed to a chip** in dogfood |
| This brief | **Acceptance geometry + Claude Code finish goal** | **Authoritative for “done”** |

**Sibling (do not mix):** Testing QC Lane 2 — do not import `UnboxDockHost` into Testing.

> **What we want back is a RULING that defines DONE for Claude Code**, plus paste-ready SoT/guard patches and a **≤40-line Claude Code P0 prompt** whose acceptance criteria are **visual and structural** — not “files touched.” Where prior briefs over-optimized contextual XOR (studio vs terminal) and under-specified geometry, **say so**, and force geometry-first.

---

## The report that started this (operator + screenshot)

**Screenshot (local, 2026-08-08 ~12:59):**  
`~/.cursor/projects/Users-icecube-repos-cycleforge-app/assets/Screenshot_2026-08-08_at_12.59.04-1922c8fc-3a7d-445f-8d0e-04dec4349f7c.png`

Operator dogfood on `/unbox` with a **RECEIVED** carton. Bottom of the station paints as:

- A **tiny white chip** bottom-left: placeholder text **"Enter to continue"**
- **No** full-width floor plane
- **No** visible hairline separating canvas from dock
- **No** under-row with step name + prev/next
- **No** progress control on the bottom-right

Product reaction (locked): *“This is an absolutely terrible update. I must be able to see a bottom hairline between the bottom row, bottom row being the current step and the progress bar on the right hairline, then full row for the current step. Must simplify the bottom dock first before making it contextual.”*

Additional hard constraint (prior turn, still locked):

- **A button in the bottom dock must never navigate to another page** (the “Move to Labels” CTA was a regression — deleted; do not resurrect route hops).

---

## Locked product goal (Claude Code must reach THIS — not a mood)

### G0 — Geometry first (non-negotiable DONE)

The Unbox bottom dock is a **full-width flush floor instrument** bolted to the workbench column. It always paints **two bands**:

```
┌──────────────────────────────────────────────────────────────┐  ← hairline border-t (canvas | dock)
│  BAND 1 — CURRENT STEP (full row, fixed h-11)                │  ← w-full; wedge/CTA fills ≥80%
├──────────────────────────────────────────────────────────────┤  ← hairline between bands
│  BAND 2 — ‹ step name · change ›              [progress %]   │  ← left step pager · right ring
└──────────────────────────────────────────────────────────────┘  ← safe-area pb only; no px gutters
```

**Acceptance (operator can fail the PR from a screenshot alone):**

| # | Criterion | Fail if |
|---|---|---|
| A1 | Dock plane is **full width** of `STATION_WORKBENCH_COLUMN` | Content-sized chip / island / shrink-wrapped button |
| A2 | **Hairline** `border-t border-border` visible between sunken canvas and Band 1 | Seamless blend into grey canvas; no edge |
| A3 | Band 1 is a **full h-11 row** for the current step entry/CTA | Tiny `w-30` / `max-w-44` input floating alone |
| A4 | Band 2 always mounts: **left** = exact step + prev/next (or settled “Complete”); **right** = live procedure progress ring | Missing left face, missing ring, or ring elsewhere |
| A5 | Hairline between Band 1 and Band 2 | Bands visually fused / under-row absent |
| A6 | Zero decorative float gutters (`px-4` / `sm:px-6`); no raised `Panel` / `radius="2xl"` / `elevation="raised"` | Chat-island chrome returns |
| A7 | **No dock control navigates away from `/unbox`** | `router.push`, `Link href` to Labels / other pages |

### G1 — Contextual (only after G0 is green)

Once geometry is unmistakable in dogfood:

1. **Capture vs settle:** while `activeKey !== null`, Band 1 is the step studio (wedge + step CTA). Print·Receive may claim Band 1 trailing **only when settled** (`!activeKey`) — still in-station (Print label after receive is OK; page hop is not).
2. **One derivation:** checklist (Displays leaf) · Band 2 step face · Band 1 entry meaning all read `useUnboxProcedureSteps` / `activeKey`.
3. **Notes escalate** via `DenseComposeFields` (may grow Band 1); never Omnichannel raised shell; Done closes notes — does not fire carton commit mid-capture.
4. Serial dominance: on `activeKey === 'serial'`, field ≥80% of Band 1; FileText demoted/hidden.

**Do not** ship G1 “contextual” behaviors that break A1–A7.

### G2 — Anti-goals (never “done” if present)

- Remount centre `ProcedureDeck` / `UnboxProcedureDeck` on main dogfood
- Import `UnboxDockHost` into Testing
- “Move to Labels” / any dock CTA that leaves `/unbox`
- Raising DS / knip baselines to pass
- Keeping a content-sized chip “but with a ring somehow”
- Dual full-width right columns; page-local motion twin; bare-digit hotkeys

---

## 0. How Gemini must work

### 0.1 Verify in the repo (mandatory)

Open every path in §2 before asserting. Quote `file:line`. Mark inference `[UNVERIFIED]`. If a line moved since tip SHA, say so.

### 0.2 Search the web (mandatory for D1)

Industry RF / MES / WMS 2024–2026: persistent **full-width floor bars** (status + action) vs floating composers; two-band “action + status” chrome (SAP EWM RF, Manhattan Active, Blue Yonder, Oracle WMS Cloud RF, Zebra Workstation Connect). Cite primary docs. Transfer standing-desk + wedge Fitts constraints.

### 0.3 Deliverables (keep separate)

| # | Deliverable |
|---|---|
| **D1** | **Industry ruling** — name the grammar for a two-band floor instrument (action row + status row). When does geometry-first beat “contextual collapse”? |
| **D2** | **Failure autopsy** — why dogfood painted a chip (cite current `UnboxDockHost` / float / `UnboxDockScanEntry` width). Name the exact CSS/layout mistakes (`inset-x-0` without `w-full`, chip `max-w-*`, under-row unmount, etc.). |
| **D3** | **DONE contract** — refine G0 A1–A7 into a pass/fail checklist Claude Code must paste into the PR body. No soft language. |
| **D4** | **ASCII golden** — final Band 1 / Band 2 anatomy for: (a) active capture step, (b) settled Print·Receive, (c) notes escalate. |
| **D5** | **Deletion-ordered build plan** — `file:line` steps. Geometry patches **before** any further contextual XOR. |
| **D6** | **Paste-ready SoT patches** — `.claude/rules/display/station-workbench.md` + `source-of-truth.md` Unbox centre / dock polymorphism: **two-band floor is the law**; contextual yield is secondary. |
| **D7** | **Guard flip list** — `unbox-dock-one-shell.guard.test.ts` (+ right-edge if needed): assert `w-full`, dual `border-t`, always-mounted Band 2, wedge `w-full flex-1`, ban `max-w-44` / `w-30`, ban Labels route hops. |
| **D8** | **Claude Code P0 prompt** ≤40 lines — attach `:3050`, geometry-first, screenshot acceptance A1–A7, then `npm run verify`. |

### 0.4 Paste prompt (give this entire file to Gemini)

```
Read docs/todo/unbox-dock-two-band-floor-GEMINI-RESEARCH-BRIEFING.md end-to-end.
Open every cited repo path. Deliver D1–D8 as separate sections.
The Claude Code goal is G0 geometry (A1–A7) — not more contextual XOR.
Forced picks only. Quote file:line. Mark [UNVERIFIED].
No invented paths. No “Move to Labels” page hops.
```

---

## 1. Product frame

**Cycle Forge** — multi-tenant reseller-ops SaaS. `/unbox` is the Station golden: scanner-driven, one active carton, Displays push for reference, **bottom dock for action + procedure status**.

House pattern evolution (`.claude/rules/pattern-evolution.md`): compose named SoT → grow SoT when wrong. **This brief expects SoT growth** that elevates **two-band floor geometry** above “trailing terminal never hidden” nostalgia and above over-eager unmounting of Band 2.

---

## 2. What exists now (open these — do not invent)

### 2.1 Host + float (geometry surface)

| Piece | Path | What to verify |
|---|---|---|
| Host | `src/components/receiving/workspace/line-edit/UnboxDockHost.tsx` | Two-band intent, `w-full`, dual hairlines, Band 2 always mounted |
| Mount / float | `src/components/receiving/workspace/LineEditPanel.tsx` (`data-unbox-dock-float`) | `absolute inset-x-0 bottom-0`; **no** `px-4`/`sm:px-6`; column `w-full` |
| Column token | `src/components/station/workbench/workbench-layout.ts` → `STATION_WORKBENCH_COLUMN` | Must be edge-to-edge of center |

### 2.2 Band 1 contents

| Piece | Path | What to verify |
|---|---|---|
| Step CTA swap | `…/line-edit/UnboxStepDock.tsx` | Crossfade on `activeKey` |
| Wedge | `…/line-edit/UnboxDockScanEntry.tsx` | Must be `w-full flex-1` — **not** chip widths |
| Serial surface | `…/line-edit/steps/UnboxSerialStepSurface.tsx` + `…/steps/dock/SlotDockControls.tsx` | ≥80% band on serial |
| Notes | `…/line-edit/UnboxDockNotesEntry.tsx` | DenseComposeFields escalate |
| Terminal | `StationTerminalDock` via `LineEditPanel` `trailing={!activeKey ? embeddedTerminal : null}` | Settle only; in-station |

### 2.3 Band 2 contents

| Piece | Path | What to verify |
|---|---|---|
| Step face | `…/line-edit/UnboxProcedurePager.tsx` | Never collapse Band 2; settled → “Complete” face OK |
| Progress | `…/UnboxScanProgressControl.tsx` → `ScanStationProgressControl` | Live % from `useUnboxProcedureSteps`; opens Checklist Displays **in-station** |
| Pointer SoT | `…/line-edit/useUnboxProcedureSteps.ts` | One derivation |

### 2.4 Guards / SoT

| Piece | Path |
|---|---|
| One-shell guard | `…/line-edit/unbox-dock-one-shell.guard.test.ts` |
| Right-edge guard | `…/unbox-right-edge-chrome.guard.test.ts` |
| Station workbench | `.claude/rules/display/station-workbench.md` |
| SoT Unbox centre | `.claude/rules/source-of-truth.md` → Unbox centre (main) |
| AGENTS hard law | `AGENTS.md` Unbox centre one-liner |

---

## 3. Known failure modes Claude Code already hit (do not repeat)

1. **`inset-x-0` without `w-full`** on an in-flow host — CSS no-op → shrink-wrap to content → chip.
2. **Wedge chip caps** (`w-30` / `max-w-44`) — Band 1 reads as a floating button, not a floor.
3. **Band 2 unmount** when pager returned `null` — progress + step face disappeared; floor looked empty.
4. **Contextual before geometry** — terminal XOR / Procedure Complete / “Move to Labels” shipped while the plane itself was wrong.
5. **Page hop from dock** — banned. Print label after receive stays on `/unbox` via `StationTerminalDock`.

---

## 4. Forced picks (do not re-open)

| # | Pick |
|---|---|
| Q1 | Geometry (G0 / A1–A7) **before** further contextual polish |
| Q2 | Band 2 **always mounted** whenever the dock is visible (notes mode may hide Band 2 only while DenseCompose owns the floor) |
| Q3 | Progress ring **stays** under-dock right (live derivation) — not Displays `rightSlot`, not deleted |
| Q4 | Step pager **stays** under-dock left — exact step + change |
| Q5 | No dock CTA navigates off `/unbox` |
| Q6 | Print·Receive trailing only when `!activeKey` (settle) — never co-mounted as the only chrome during active capture |

---

## 5. Claude Code finish line (what “reached the goal” means)

Claude Code is **done** only when **all** are true:

1. Dogfood screenshot on `:3050` matches the ASCII in G0 (full-width two bands + hairlines + left step + right progress) for an **in-procedure** carton and a **settled** carton.
2. Guards in D7 pass.
3. `npm run verify` green (no baseline raises).
4. No `router.push` / `Link` from dock children to Labels or other pages.
5. SoT paragraphs from D6 landed (or D6 proves current SoT already matches — quote it).

If Claude Code only “moves files” but the screenshot still shows a chip — **the goal was not reached.**

---

## 6. Non-goals

- Remount centre ProcedureDeck
- Testing Lane 2 host sharing
- Archive \| Reticle \| Queue redesign
- Electron print pipeline
- Second search engine / bare digits / page-local motion
- Raising knip / DS baselines

---

## 7. Suggested Claude Code P0 skeleton (Gemini must rewrite into D8 ≤40 lines)

Gemini: replace this skeleton with a paste-ready prompt after your autopsy.

```
/attach :3050
Read docs/todo/unbox-dock-two-band-floor-GEMINI-RESEARCH-BRIEFING.md (G0 A1–A7 + D8).
GEOMETRY FIRST — do not add contextual features until the screenshot shows:
  full-width Band 1 (h-11) + hairline + Band 2 (step left · progress right).
1. UnboxDockHost: w-full two-band plane; dual border-t; Band 2 always mounted.
2. UnboxDockScanEntry: w-full flex-1; ban chip max-width.
3. UnboxProcedurePager: never return null (settled → Complete face).
4. LineEditPanel float: no px gutters; column w-full.
5. Flip unbox-dock-one-shell guards for A1–A7; ban Labels hops.
6. npm run verify. Screenshot dogfood before claiming done.
Never restart the dev server. Never raise baselines.
```
