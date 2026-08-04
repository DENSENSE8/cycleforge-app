# Gemini Deep Research brief — typed column track floors (DATE stamp)

**Paste everything below the line into Gemini Pro deep research.** It is self-contained; the
researcher has no access to this repo unless we later grant it — treat every path and constant
below as **embedded facts**, not things to invent or “look up.”

**Deliverable:** a decision brief we can execute, not an essay. Format is specified at the end.

**Related (do not re-litigate):** spreadsheet *actions* (highlight, in-cell edit) live in
`docs/todo/grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md`. This brief is **geometry only** —
how wide a typed fact column should be so it neither clips nor wastes horizontal budget.

**Date:** 2026-08-04  
**From:** Cycle Forge engineering  
**Subject:** Long-term SoT for LedgerGrid **typed track floors** — especially stamp-face DATE
(day + time on one line) on Unbox / Receiving History.

---

## Who is asking

I own the **ops spreadsheet surfaces** of **Cycle Forge**, a multi-tenant SaaS for used-goods
reseller operations (receiving → testing → listing → fulfillment). Operators use dense
**LedgerGrid** queues on warehouse benches (often 1080p / 1440p, barcode scanners). The product
identity is **Kinetic Ledger**: content-hard columns, Sheets-like flush planes, not Notion
whitespace theater.

USAV is the dogfood tenant only — design for a **sellable** multi-tenant product.

---

## The problem, stated plainly

We have a **clip ↔ slack** failure mode on the Receiving Unbox History **DATE** column:

| State | What the operator sees |
|---|---|
| Track too **narrow** | End-aligned day+time (`Aug 3 4:54 PM`) + `nowrap` + `overflow-hidden` → **left-clip** (`g 3 4:54 PM`) |
| Track too **wide** | Same stamp fully visible but a large empty band to the **left** of the end-aligned text (wasted queue width) |

We already shipped a **typed face floor** (`dateFace: 'stamp'` → **12rem** fixed
`minmax(12rem, 12rem)`). That fixed clip and created visible slack. Guessing **10.5rem** next is
a tactical patch. We need a **durable industry-aligned rule** so we stop rem-tuning forever.

```text
DATE cell face (today)
  day label  +  time          →  "Aug 3 4:54 PM"
  type: date
  dateFace: stamp
  align: end  (magnitude — compare down the column)
  whitespace-nowrap
  overflow-hidden (grid cell inset)
  row height: h-10 (fixed)
```

Longest realistic stamp we care about is on the order of **`Sep 30 12:59 PM`** (or locale
equivalents under 12h clock), plus horizontal cell padding (`px-2` both sides).

---

## Current house state (ground truth — do not contradict)

### Geometry model

- Fact columns are **content-hard**: `minmax(Xrem, Xrem)` — not `1fr` fillers on Product/title
  for Receiving (Sheets/Notion overflow unlock).
- Leftover **sheet** width is absorbed by a trailing structural **`_fill`** track
  (`minmax(0rem, 1fr)`) — empty header/body; not an “add column” door.
- Column display (show/hide optional registry fields) lives in triage chrome / header menus —
  **not** inventing freeform DB columns.

### Typed display SoT already landed

Sibling to type→align and type→glyph:

| Mechanism | Role |
|---|---|
| `ColumnType` (`date`, `number`, …) | Presentation kind |
| `dateFace`: `day` \| `stamp` \| `duration` | DATE subtypes (Incoming By = day; Age = duration; Receiving DATE = stamp) |
| `resolveGridColumnMinTrackRem(column)` | Face → rem **floor** |
| Today: `day=4.5`, `stamp=12`, `duration=3` | Declared constants |
| Receiving DATE | `dateFace: 'stamp'`, `width: minmax(12rem, 12rem)` |
| Drag-resize | Clamps to ≥ type floor (house 64px absolute min still applies underneath) |
| Double-click resize grip | **Reset to SoT** — content Autofit on the grip is **banned** |

### Known coupling bugs (must address in recommendations)

1. **Grid zoom / density** sets `--cf-density`, which scales `text-role-*` and spacing tokens.
   Column rem tracks do **not** scale. Zoom **in** can re-introduce clip; zoom **out** can
   increase perceived slack.
2. **Staff prefs** can persist `--cf-col-date` px wider/narrower than SoT until reset — so a SoT
   change may not show until prefs clear.
3. **Virtualized** LedgerGrid — measuring “all rows” for Autofit is expensive; Telerik-class
   guidance prefers fixed widths for dates/numbers and Autofit only for variable text.

### Hard product laws (Never / Ask-first)

- Do **not** recommend adopting AG Grid / Handsontable / MUI DataGrid as the shell.
- Do **not** invent tenant-authored freeform column types.
- Do **not** undo content-hard Receiving tracks by making Product the flex fill again.
- Do **not** put Autofit on the resize **grip** (double-click = reset to SoT; Autofit was why
  double-click used to grow columns wrongly).
- Motion / chrome packages stay out of scope; this is column geometry only.

---

## 0. Method

### 0.1 Your job

1. **Survey** how industry products size **fixed-format** columns (dates, numbers, IDs) vs
   variable text.
2. **Reconcile** recommendations with the house constraints above. Where industry conflicts,
   pick a side and defend the deviation — or tell us to change a constraint.
3. **Force-rule D1–D6** below. One durable model — not a menu of “it depends” without a pick.
4. Treat § “Current house state” as ground truth. Label speculation `my reasoning:`.

### 0.2 Sources to cover (minimum)

Cite **named systems** and **primary sources**. Prefer docs / design systems / changelogs
**2024–2026**.

| Class | Examples | Use for |
|---|---|---|
| Spreadsheets | Excel / Microsoft 365, Google Sheets | Autofit once → lock; date format vs width |
| Hybrid DBs | Notion databases, Airtable, Coda, Smartsheet | Typed property **minimum** widths |
| Enterprise grids | AG Grid, Telerik Grid, DevExpress Grid | `minWidth` + flex; Autofit perf guidance for dates |
| Ops SaaS tables | Linear, Stripe Dashboard, Retool, Polaris IndexTable, Carbon DataTable, Fluent 2 | What dense B2B queues actually ship |
| CSS / layout | CSS Grid `minmax`, `min-content` / `max-content`, intrinsic sizing writeups | Whether intrinsic tracks are viable under virtualization |

Where industry splits, give **both** positions, when each wins, then pick for **this** product.

**Hard fork:** what a general spreadsheet does ≠ what a **virtualized, scan-driven warehouse-ops
queue on a floor monitor** should do. We are the latter.

### 0.3 Seed findings (verify, extend, or refute — do not rubber-stamp)

These are starting hypotheses from our own survey; you must cite primary sources and correct us:

| Seed | Claim |
|---|---|
| **Telerik / DevExpress** | Prefer **fixed optimal widths** for predictable content (dates, numbers); Autofit variable text only — Autofit-all is expensive at large page sizes |
| **AG Grid** | `minWidth` (+ optional `flex` / size-to-fit strategies); columns can suppress autofit / size-to-fit |
| **Notion** | Typed properties enforce **minimum** widths so date faces stay usable when dragged narrow |
| **Excel / Sheets** | Autofit measures **displayed** format; then operators often **lock** widths; consistent short date formats reduce width pressure |
| **CSS Grid** | `max-content` / `minmax(N, max-content)` can hug content but fights predictable scroll floors and virtualization budgets |

---

## 1. Candidate durable models (you must pick ONE primary)

Rank and pick a **primary** for Cycle Forge stamp-face DATE (and say what generalizes to other
fixed types). Reject the rest with one line each.

| # | Model | Sketch |
|---|---|---|
| **M1** | **Measured rem SoT** | Design-time measure longest stamp face (+ inset + density headroom) → pin rem in `MIN_TRACK_REM_BY_DATE_FACE`; guard asserts SoT ≥ floor |
| **M2** | **Runtime measure once** | On first paint / “Fit stamp columns”, sample visible (or N) rows → write floor px/rem; not per-pointer Autofit |
| **M3** | **`minmax(floor, max-content)`** | Floor prevents clip; track may grow to intrinsic content |
| **M4** | **Density-coupled tracks** | Track rem or px scales with `--cf-density` / zoom so zoom-in cannot clip |
| **M5** | **Compact stamp format** | Shorter cell string (e.g. `Aug 3 · 4:54p`) → smaller floor; tooltip keeps full absolute |
| **M6** | **Split day / time** | Two columns again (or stacked lines) — undo the day+time merge |

Also evaluate hybrids (e.g. M1 + M4, or M5 + M1) if you defend them — but still name a **primary**.

---

## 2. Forced decisions (must rule)

### D1 — Fixed rem vs intrinsic `max-content` for stamp faces on a **virtualized** LedgerGrid

Imperative ruling: which track declaration should Receiving DATE use long-term?

### D2 — Should zoom / `--cf-density` scale column rem?

Today type scales and rem does not. Rule: scale tracks with density, keep rem fixed and size for
max zoom, or another approach.

### D3 — Autofit affordance

Keep grip Autofit banned? Allow one-shot “Fit to content” only from the column context menu /
Column display rail? Never runtime continuous measure?

### D4 — Stamp face **format** SoT

Keep `Aug 3 4:54 PM`? Compact? Locale / 24h implications for floor math?

### D5 — Floors × trailing `_fill` × staff width prefs

When SoT floor changes, should persisted prefs below/above floor migrate, clamp on load, or only
on next drag? Who owns slack — fact tracks or `_fill` only?

### D6 — Scope

Receiving stamp only, or every surface that should declare `dateFace: 'stamp'` (and how to find
them)?

---

## 3. Constraints checklist (every recommendation must pass)

- [ ] Works with **virtualization** (no O(all rows) measure on every scroll)
- [ ] Preserves **end-align** magnitude scan for dates (or explicitly overturns that house law)
- [ ] Preserves **h-10** rows (no multi-line wrap that overlaps neighbors)
- [ ] Keeps **`_fill`** as sheet slack absorber (fact columns stay content-hard unless you overturn)
- [ ] Compatible with **resize clamp ≥ floor** and **reset = SoT**
- [ ] Tenant-safe, no second table engine
- [ ] Guardable (unit/DS ratchet) — name what to assert

---

## 4. Bench evidence we already have (2026-08)

| Rem (approx) | Observation |
|---|---|
| ~7.5 | Wrap / bleed into next row (before nowrap) |
| ~9.5 | Left-clip under end-align + overflow-hidden (`g 3…`) — possibly also stale prefs |
| **12** | No clip; **visible left slack** (current ship) |

Do **not** treat 12 as proven optimal — treat it as an upper bound that overshot. Propose how to
**measure** the correct floor once (tooling, ch math, canvas measure, Playwright screenshot
assert) so the constant is evidence-backed.

---

## Evidence bar

- Cite products + what you observed and **when** (docs version / changelog date).
- Prefer primary sources over blog roundups.
- Where products disagree, explain by product type (spreadsheet vs ops queue vs database UI).
- Stated gaps beat confident guesses.

---

## Required output format

Produce one markdown report in this order:

1. **Executive verdict** (≤15 lines) — primary model (M#) + the one geometry law to tattoo on
   LedgerGrid fact columns.
2. **Industry survey** answering how each source class sizes date/number columns (citations).
3. **Model scoreboard** for M1–M6 against the constraints checklist (pass/fail + notes).
4. **Forced rulings D1–D6** using this template:

```
### D<n> — <one-line ruling in the imperative>

**Verdict:** <specific enough to implement>
**Evidence:** <products / docs / dates>
**Why it beats rem-guessing:** <mechanism>
**What it costs:** <honest trade>
**Rejected alternatives:** <and why>
**Confidence:** high / medium / low — what would change your mind
```

5. **Phased plan** — Wave 0 measure/tooling → Wave 1 Receiving stamp → Wave 2 generalize other
   faces/types → Wave 3 density/zoom if ruled. Each wave: outcomes, risks, proof (guard / E2E).
6. **Explicit Never / Defer** list.
7. **Ask-first questions for the human** (max 5).
8. **Appendix** — citation list.

### Anti-patterns for your answer

- “Just set it to 10.5rem” without a measurement method or density story.
- “Use `1fr` on DATE so it fills” (breaks magnitude column rhythm; slack belongs in `_fill`).
- “Adopt AG Grid for autosize.”
- Continuous Autofit on every data refresh.
- Re-merging status+time or undoing typed faces without evidence.
- Treating Notion table mins as a license to float gutters / island cards (our depth law differs).

---

## Success criteria

Research is done when an engineer can:

1. Implement **one** primary track-sizing law for stamp-face DATE without further rem debate.
2. Know whether density/zoom must couple to track width.
3. Know where (if anywhere) Autofit is allowed.
4. Know the stamp **string** format SoT and how floors are **measured** going forward.
5. Know migration behavior for existing staff width prefs.

---

## One-line mission

> Deep-research 2024–2026 industry patterns for sizing fixed-format (especially date/stamp)
> columns in dense virtualized ops grids; pick one durable Cycle Forge SoT that ends the
> clip↔slack rem-guessing loop — without a second table engine or freeform columns.
