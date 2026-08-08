# Research briefing — Displays character-select “addicting” game-feel (hit-marker class)

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-07
**Subject:** After shipping Station Displays Root Index **character-select** (wrap cursor +
armed lead nudge + traveling chevron), what **game-industry feedback grammar** (Call of Duty
hit marker / kill confirm class — and peers) can we **port into a dense scan-station list** so
moving the cursor and committing a leaf feel *addicting* — without breaking Kinetic Ledger,
wedge-safety, or reduced-motion law?
**Status:** SUPERSEDED for implementation by
[`displays-character-select-game-feel-HANDOFF.md`](./displays-character-select-game-feel-HANDOFF.md)
(2026-08-07 operator synthesis + phased checkpoints). Keep this file as the research frame /
evidence ask; do not start a second parallel juice design.

---

## Do not re-litigate — already decided and shipped (2026-08-07)

| Prior decision | Already shipped |
|---|---|
| Character-select keyboard | Absolute `cursorId`; ↑↓ **wrap**; Home/End ends; Enter/Space/click **commit** → leaf; autofocus on index open; no Tab trap; no bare Digit* (wedge-safe) |
| Armed face = option **2** (not reserved gutter on every idle row) | Idle icon+label **flush**; armed **lead** (icon+label only) nudges by `ARMED_CONTENT_NUDGE_X` (28 / `w-7`); tone chip stays **trailing sibling** (never translated — chip must not clip off column) |
| Traveling marker | One `layoutId` chevron FLIPs into cleared lead; CSS `animate-pulse` on **glyph only**; accent `border-l-2` always present (transparent → ink) |
| Pulse law (today) | One-shot `motionRole.feedback.pulse` wash on **cursor change**; **no** full-row `repeat: Infinity` (aligned with MasterNav D2/D3 one-shot settle) |
| Motion import | Feature code uses `@/design-system/motion` only; geometry settle composes `motionRole.push.rail` |
| SoT waist | `useArmedCursorList` + `armed-cursor-face.ts`; golden = `StationDisplayIndexList`; all scan stations inherit via `StationDisplaysPushStack` |
| Prose | `.claude/rules/display/station-workbench.md` → Displays Root Index; `source-of-truth.md` → Station Displays navigation |
| Guard | `station-display-index.guard.test.ts` requires nudge + wrap + chip-outside-cluster; bans Tab/Digit / raw `motion/react` / full-row Infinity |
| Out of scope this brief | MasterNav spine looping wash (separate open briefing); Digit absolute-index jump; rewriting every app list in one PR |

**Code anchors (for humans; model cannot read repo):**

- `src/components/station/displays/StationDisplayIndexList.tsx`
- `src/components/station/displays/useArmedCursorList.ts`
- `src/components/station/displays/armed-cursor-face.ts`
- `.claude/rules/display/station-workbench.md` → Displays Root Index
- `.claude/rules/display/motion-crossfade.md` → roles / import boundary
- Related open brief: `docs/todo/masternav-scan-station-detail-and-selection-pulse-GEMINI-RESEARCH-BRIEFING.md` (spine pulse — do not conflate)

---

## 0. How to use this brief

You do not have the codebase. Facts below describe the **shipped** face. Research **games and
high-skill interactive products**, then map patterns onto this surface.

**Four deliverables:**

1. **Hit-marker / confirm grammar** — Decompose Call of Duty–class feedback (crosshair hit marker,
   kill confirm, headshot vs body, multi-kill stack, damage direction) into **atomic channels**:
   shape, duration, color, opacity, scale, sound, haptics, spatial position. Name 5–10 other
   games/tools with a *comparable* “I did the thing” micro-reward (not full VFX showcases).
2. **Selection / cursor addiction** — Outside FPS: what makes **roster / character-select /
   inventory / ability wheel** cursors feel sticky (fighting games, ARPGs, racing menus, console
   system UIs, rhythm games)? Separate **arm** (cursor moved) from **commit** (Enter / click /
   confirm).
3. **Portability matrix** — For each promising atom, rate fit for a **420px scan-station Displays
   column** under Kinetic Ledger constraints (§3). Explicitly kill patterns that need fullscreen
   bloom, continuous screen shake, or loud audio by default.
4. **Answer §5 + take a side on §6** with sources and a **pasteable migration order** (roles /
   tokens / guard flips) — not a generic “juice” essay.

---

## 1. Product vocabulary

**Cycle Forge** — multi-tenant reseller-ops SaaS (USAV = first dogfood tenant only). House
identity is **Kinetic Ledger**: dense, state-colored, scan-aware chrome — legible throughput over
document calm. Regions: Station · Workbench · Monitor · Canvas.

**Station Displays Root Index** — right-edge push column navigator on scan benches (Unbox golden;
Arrival · Testing · Pack · Shipping · Review inherit). Grouped rows (Verification · Assets ·
Context). Operator ↑↓ arms a row; Enter opens a leaf (`?display=<leaf>`). Not a video game — a
**floor tool** that should feel as *responsive and rewarding* as a game HUD without looking like
one.

**Armed cursor** ≠ last opened leaf. `activeId` seeds; `cursorId` paints.

**Commit** = open leaf (navigation). **Arm** = move selection without opening. Game analogy:
arm ≈ crosshair over target; commit ≈ trigger / confirm.

---

## 2. Measured anatomy — what already ships (2026-08-07)

```
Idle row:   [ icon ][ label ………… ][ TONE CHIP ]
Armed row:  [▶][ icon ][ label …… ][ TONE CHIP ]
            ^marker   ^lead nudged +28px   ^chip NOT nudged
```

| Channel | Idle | On arm (cursor lands) | On commit (Enter/click) |
|---|---|---|---|
| Lead position | flush | tween `x → 28` (`push.rail`) | same (then leaf mounts) |
| Marker | absent | FLIP in + glyph CSS pulse | gone with index |
| Accent rail | transparent 2px | ink | — |
| Row wash | tone wash / none | one-shot opacity flash (~400ms) | — |
| Chip | trailing | trailing (stable) | — |
| Sound / haptics | none | none | none |
| Scale / shake | none | none | none |

**Operator complaint already fixed:** nudging the whole cluster (incl. chip) clipped “CLAIM
NEEDED” — law is lead-only nudge.

**User goal now:** make arm + commit feel **addicting** — “Call of Duty cursor kill” class —
while staying a professional Station Displays list.

---

## 3. Hard constraints (non-negotiable for any recommendation)

| Constraint | Why |
|---|---|
| **Wedge-safe** | Barcode scanners type digits / Enter into the page — no bare Digit hotkeys; no stealing scan-bar focus |
| **Motion SoT** | New juice must name a `motionRole.*` or grow the catalog with a **new JOB**; never inline springs in feature code; never `from 'motion/react'` outside `design-system/motion` |
| **No full-row Infinity glow** | Already banned (Displays + MasterNav D2/D3); chevron glyph pulse is the only looping CSS today |
| **Reduced motion** | Snap / crossfade; no travel that becomes a jarring cut |
| **Chip column stable** | Trailing tone chip never translates with the lead |
| **One marker** | Exactly one traveling armed marker — two markers = two selections |
| **Dense column ~420px** | No fullscreen killcams, no large radial hit markers that cover the leaf body |
| **Quiet floor** | Warehouse: audio optional / off by default; if you recommend sound, specify mute + preference path |
| **Kinetic Ledger** | State-colored, flush, no cyberpunk sky; juice must read as **ops confirmation**, not toy |
| **Propagation** | Recommendations must land in `armed-cursor-face` / hook / roles so MasterNav cohort can compose later — no Unbox-only twin |

---

## 4. Research questions (answer with named titles)

### A — FPS hit-marker class (primary analogy)

1. What is the **minimum viable hit marker** in CoD / similar (shape, ms, color change on kill vs
   hit)? Which channels are load-bearing vs cosmetic?
2. How do games distinguish **hit** vs **kill** vs **headshot** vs **assist** in ≤150ms?
3. What is the role of **audio** vs **visual** in the addiction loop? Cite designer talks / GDC /
   UX write-ups where possible.
4. Which FPS / hero-shooter markers **fail** in a 2D list (too spatial, too loud, too long)?

### B — Menu / roster / character-select addiction

5. Fighting-game / Smash-style fighter select: what makes cursor movement feel “juicy” without a
   3D stage?
6. Console system UI / Steam Big Picture / game launchers: arm vs confirm patterns?
7. Rhythm games / beat games: how does **timing feedback** differ from **selection feedback** —
   anything portable to ↑↓ wrap?

### C — Non-game pro tools with “addicting” selection

8. Name dense pro tools (IDEs, DAWs, trading, CAD, radio dispatch, aviation) that give a
   **micro-reward on selection change** without looking childish. What exactly fires?

### D — Port to Displays rows

9. Map top patterns onto our three moments: **arm**, **idle-while-armed**, **commit**.
10. For each: propose **visual-only** first; then optional audio/haptics as progressive
    enhancement.
11. Call out conflicts with one-shot-only wash law — when would a *short* armed idle (e.g. 2–3
    beat chevron) be justified vs banned looping sky wash?

---

## 5. Answer sheet (fill this)

For each recommended atom:

| Atom | Game source | Duration | Channels | Maps to (arm / idle / commit) | Fits 420px Station? | Needs new `motionRole`? | Risk |
|---|---|---|---|---|---|---|---|
| … | … | … | … | … | Y/N | Y/N + name | … |

Then:

- **Top 3 must-ship** for “addicting but still ops”
- **Top 3 never-ship** on this surface (and why)
- **Reduced-motion substitute** for each must-ship
- **Guard / SoT lines** that would need to flip (quote the *new* law in one sentence each)

---

## 6. Open decisions (take a side)

### D1 — Commit feedback intensity

Should **opening a leaf** get a distinct “kill confirm” (stronger flash / brief scale / checkmark
burst) separate from the arm wash?

- **Lean A:** Yes — arm = soft settle; commit = harder confirm (FPS hit vs kill).
- **Lean B:** No — commit is navigation; keep juice on arm only so leaves stay calm.

### D2 — Armed idle while parked on a row

Today: chevron CSS pulse + static wash after one-shot.

- **Lean A:** Keep as-is (glyph pulse only).
- **Lean B:** Add a **short, terminating** armed-idle (e.g. 2–3 opacity beats, then static) —
  still not Infinity full-row.
- **Lean C:** Stronger persistent cue (overturn MasterNav-aligned ban) — only with industry
  evidence from §4C/§4A.

### D3 — Audio / haptics

- **Lean A:** Visual-only for v1; document audio as prefs-gated follow-up.
- **Lean B:** Soft tick on arm + confirm click on commit, default on for desk, off for floor
  kiosk — specify how.

### D4 — Propagation

- **Lean A:** Displays-only until game-feel is proven; then promote tokens.
- **Lean B:** Any new atom lands in `armed-cursor-face` / roles **first** so MasterNav cohort
  cannot fork.

**Engineering working lean (overturn with evidence):** D1-A · D2-B · D3-A · D4-B.

---

## 7. Anti-goals

- Full-screen damage vignette, killcam, or blood FX
- Continuous screen shake or spring overshoot that moves sibling columns
- Content nudge of the **tone chip** (already a regression)
- Bare Digit jump keys
- A second page-local “Unbox juice” module
- Replacing Kinetic Ledger with neon / cyberpunk sky
- Conflating this brief with MasterNav spine color research — cite it; don’t merge answers

---

## 8. Success criteria for your report

A senior eng should be able to open a PR that:

1. Adds or composes ≤2 motion jobs / tokens under `@/design-system/motion`
2. Updates `armed-cursor-face` + `StationDisplayIndexList` only (waist stays shared)
3. Flips 2–4 guard assertions to the new law
4. Leaves wedge-safety and chip-trailing stability intact
5. Feels, in a hallway test, “I want to ↑↓ this list” — without anyone saying “this looks like a
   game UI slapped on a WMS”

---

## 9. Paste block (optional one-pager for the model)

```
Research addictive micro-feedback from games (Call of Duty hit/kill markers; fighting-game /
character-select cursors; rhythm confirm; 2–3 non-game pro tools) and port ONLY what fits a
dense 420px B2B scan-station list (Cycle Forge Station Displays Root Index).

Shipped already: ↑↓ wrap cursor; armed lead nudges 28px; traveling chevron; trailing chip fixed;
one-shot wash on move; no full-row infinite glow; no bare digit keys.

Deliver: atomic channel table; top 3 must-ship + top 3 never-ship; sides on commit-vs-arm juice,
armed-idle, audio, and SoT-first propagation; pasteable migration order for motion roles + guards.
Respect reduced motion, warehouse quiet defaults, Kinetic Ledger (ops not neon).
```
