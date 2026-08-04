# Typed column track floors — verdict reconciliation + SoT update plan

**Date:** 2026-08-04 · **Status:** plan, nothing built · **Lane:** main (WS-DOGFOOD)
**Answers:** [`ledgergrid-typed-column-track-floors-GEMINI-RESEARCH-BRIEFING.md`](ledgergrid-typed-column-track-floors-GEMINI-RESEARCH-BRIEFING.md)
**Related:** [`grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md`](grid-industry-actions-GEMINI-RESEARCH-BRIEFING.md) (sibling — spreadsheet *actions*; this doc is geometry only) · [`grid-surface-descriptor-plan.md`](grid-surface-descriptor-plan.md)

This reconciles the external research verdict (M1 + M4, D1–D6) against the **actual repo state
as of 2026-08-04**. The verdict's *primary model* is right and is what ships. Its *current-state
model* is wrong or incomplete in five places that change what Wave 0–3 actually have to build —
read §1 before touching a file. §3 is the literal SoT edit. §4–§6 are the file-by-file work.

---

## 1. Corrections to the research verdict

### 1.1 `--cf-density-scale` does not exist — the house has TWO independent scale axes, not one

The verdict's D2 says "inject `--cf-density-scale` into the column track CSS Grid definition." No
such token exists. What exists, verified in the running app:

| Token | Range | Set by | Scales |
|---|---|---|---|
| `--cf-density` | `1` (default) → `0.92` (`compact`) — **never above 1** | `[data-density='compact']` (`src/styles/globals.css:53`) | `role-*` type sizes (`tailwind.config.ts:188-194`) + the density-aware spacing scale (`spacing.mjs`) |
| `fontScale` | `0.9` / `1.0` / `1.1` / `1.2` (UI presets), `0.8`–`1.4` (stored range) | `AppearanceSettings` → `document.documentElement.style.fontSize = 16 * fontScale` (`src/lib/settings/appearance.ts:70-77`) | **every `rem` value in the app**, because it overrides the root font-size the `rem` unit resolves against |

**This changes D2 entirely.** A column track declared as a bare number of rem
(`MIN_TRACK_REM_BY_DATE_FACE.stamp = 12`, consumed as `minmax(12rem, 12rem)`) already rescales
with `fontScale` **for free** — no track-side change needed, because `rem` is root-relative and
`fontScale` is the mechanism that moves the root. The verdict's "zoom-in re-introduces clip" risk
is real for `fontScale` (which can exceed 1) and **not currently possible** for `--cf-density`
(which can only shrink text to 0.92, never grow it past 1 — so it cannot by itself cause new clip;
it can only ever add slack, since the track stays at the rem literal while text gets smaller).

The one place this genuinely breaks: `--cf-density` scales the **text** inside the cell but the
track floor constants are bare numbers, not wrapped in `calc(Xrem * var(--cf-density, 1))` the way
`spacing.mjs` and the CF Type plugin wrap every other density-aware value. So `compact` mode
shrinks the stamp text by 8% while the track holds its full-size floor — the coupling bug is real,
but it is a **slack** bug in compact mode, not a **clip** bug, and it is about `--cf-density`, not
about zoom. Ruling in §3 reflects this: couple the constant to `--cf-density` (matches every other
density-aware token in the codebase); do not invent a `--cf-density-scale` variable that already
has a name in this codebase for a different axis.

### 1.2 Digits are already `tabular-nums` — the verdict's Ask-first Q1 is answered, and the
measurement surface is smaller than assumed

`GridDateCellValue` (`src/components/ui/grid-cells.tsx:123`) hard-codes
`'tabular-nums normal-case tracking-normal text-text-muted'` on the value span, independent of
the type-role binding. (Separately: `text-role-display` / `-title` / `-data` bind `tabular-nums`
intrinsically per the CF Type plugin, `role-caption` — what the DATE cell actually uses,
`ReceivingDateCell.tsx:33` — does not; the explicit utility class is what makes this cell
tabular, not the role.) Digits (day, hour, minute) render at a fixed per-glyph width in Inter.
**Only the letter glyphs vary**: the 3-letter month abbreviation and `AM`/`PM`. The width-measurement
problem the verdict frames as "measure the whole string" is really "measure three short,
enumerable letter runs (12 months × `AM`/`PM`) against a fixed digit skeleton" — a closed,
enumerable set, not an open-ended string-length guess.

### 1.3 The stamp format is NOT fixed — it is per-staffer 12h/24h, and 12h is provably the wider case

`formatStageClockTimePST` (`src/utils/date.ts:653-658`) documents that it **"FOLLOWS the user's
clock-format preference: `HH:mm` in 24-hour mode, `h:mm AM/PM` in 12-hour mode"**, resolved by
`resolveHour12()` from the live `staff_preferences.timeFormat` setting (see
`time-format-preference-12h-24h.md` memory — DISPLAY formatters only, one column, two renderings).
**This answers the verdict's Ask-first Q5 without asking the human**: both formats are live
simultaneously across one tenant's staff, so there is no format to "pick." What follows
mathematically: 12h adds a literal `" AM"`/`" PM"` (3 chars) that 24h never has, for the same
date/time; the hour digit count is the same or smaller in 24h (`hour: 'numeric'` in 12h mode has
no leading zero — `"4:54 PM"` not `"04:54 PM"`, confirmed at `intlTimeOptions`,
`src/utils/date.ts:225-228`). **12h strictly dominates 24h in width for every value.** The floor
only needs to be measured once, against the 12h worst case; a 24h-preference staffer's stamps will
always fit under it with room to spare.

The day half is `formatDateKeyShort` (`src/utils/date.ts:102-111`): `Intl.DateTimeFormat('en-US',
{ month: 'short', day: 'numeric' })` → `"Sep 30"` / `"May 1"` (no leading zero on day). Combined:
worst-case string is a 3-letter month + 2-digit day + 2-digit hour + `"PM"`, e.g. **`"Sep 30 12:59
PM"`** — the exact string the verdict already picked as its worst case (§4 of the brief). That
choice was right; the reasoning for *why* it's the worst case (12h ⊇ 24h) was missing and is now
recorded so nobody re-derives it.

### 1.4 The `fontScale`-vs-`--cf-density` split changes what D5's "migrate stale prefs" actually has to fix

Staff width overrides are **not** stored in rem. `useGridColumnWidths`
(`src/components/ui/table-column-config/useGridColumnWidths.ts:60-67`) persists
`staff_preferences.tableColumns[t].widths` in **px** and emits them as `--cf-col-<key>: <px>px`,
which wins over the rem-based CSS fallback by construction. A px override is a physical pixel
count — it does **not** rescale when `fontScale` changes, unlike the untouched rem default. So the
real failure mode D5 must fix is narrower than "the SoT floor changed": **a persisted px pref can
go stale either because the SoT floor moved, or because the staffer's `fontScale` changed after
they last dragged the column** (their prefs are pinned in px from whatever root size was live at
drag time). Both need the same fix — compare the persisted px against the *current* live floor
(`gridTrackRemToPx(minTrackRem)`, which already reads the live root font-size,
`grid-column-type-track.ts:52-58`) — but the second cause is new information: a pref clamp keyed
only on "did the SoT constant change" would still leave a staffer clipped after they change their
own font scale, with no SoT edit involved at all.

**The resize-time clamp already exists and already reads the live root size.**
`LedgerGridColumnHeader.tsx:289` and `OrdersQueueColumnHeader.tsx:442` both call
`resolveGridColumnMinTrackRem` → `gridTrackRemToPx` on every render, purely to size the drag
handle's clamp. **What is missing is a load-time check** — nothing today compares a *persisted* px
pref against that live floor before painting the grid; the clamp only ever engages mid-drag. That
is the exact gap the bench evidence in the brief's §4 (`~9.5rem` clip row) is describing.

### 1.5 The external "headless state library" research (TanStack `getSize()` / CellMeasurer / TanStack
Virtual) is a rejected alternative, not new information — cite the existing house ban

A follow-up dump (outside the Gemini brief) proposed sourcing column widths from TanStack Table's
`column.getSize()` px state, or from `react-virtualized`'s `CellMeasurer` (off-screen render +
measure), or from TanStack Virtual's absolute-position matrix. All three are the **second
width-management system** `ui-design-system.md:64` already bans by name: *"never give TanStack
widths/markup/grouping"* — TanStack in this codebase (`useGridSurface` /
`buildLedgerColumnDefs`, `grid-surface-descriptor.ts`) is scoped to **column/sort/visibility STATE
only**; width lives in CSS (`grid-template-columns: minmax(...)`) driven by `--cf-col-*` vars, on
purpose, so a resize reflows through the compositor with zero React render
(`ColumnResizeHandle.tsx` docblock). Adopting `getSize()` as the width source of truth would mean
threading TanStack state back into the CSS var path it was deliberately kept out of, for a job
(picking one fixed floor per typed face) that needs to run **once, at design time**, not on every
render. `CellMeasurer` / `TanStack Virtual`'s DOM-measurement approach is the same *category* of
"virtualized-grid autofit" the brief's own D1/D3 already rejects (continuous or per-scroll
measurement against a 10k-row dataset) — it does not survive contact with the house ban any better
imported from a different library than it did as a hand-rolled Autofit.

The character-heuristic (`string.length × avgCharWidth`) is rejected for a narrower reason: Inter
is a proportional variable font (`src/lib/fonts.ts:1-55`), so an *average* char width is wrong for
a string that mixes fixed-width tabular digits with proportional letters (§1.2) — it would either
over-allocate (padding digits to letter-width) or under-allocate (the reverse), and either way
produces a guessed constant exactly like the "10.5rem" the brief opened by rejecting. Canvas
`ctx.measureText()` is legitimate and cheap, and the codebase already uses it once
(`src/lib/print/labelCommands.ts:142-148`, label rendering) — but that call site hard-codes `Arial`,
not `Inter`, so it is not reusable as-is and does not exercise the real `text-role-caption` +
`tabular-nums` cascade. **Ruling (folded into Wave 0, §5): a real-DOM Playwright measurement is
primary** — it renders the actual `GridDateCellValue` under the actual CSS (role, tabular-nums,
`px-2` inset, current `fontScale`), which a synthetic canvas context cannot guarantee stays in
sync as those change. A canvas `measureText` script is an acceptable **secondary** cross-check
(fast, no browser), not the SoT-generating step.

---

## 2. What already exists — do not rebuild

| Piece | Where | Note |
|---|---|---|
| Face → floor map | `MIN_TRACK_REM_BY_DATE_FACE` in `grid-column-type-track.ts:29-33` | `day: 4.5, stamp: 12, duration: 3` — Wave 1 changes `stamp` only |
| Resolver | `resolveGridColumnMinTrackRem(column)` in same file | `minTrackRem` override → `dateFace` map → `0` for other types |
| Rem→px | `gridTrackRemToPx(rem, rootPx=16)` in same file | Already reads the **live** root font-size via `getComputedStyle` — already `fontScale`-aware, nothing to add here |
| Track parse (reverse direction) | `gridColumnTrackRem(column)` in `grid-column-geometry.ts:63-69` | Parses the rem literal back out of a `minmax(Xrem, …)` width string |
| Resize-time clamp | `LedgerGridColumnHeader.tsx:289`, `OrdersQueueColumnHeader.tsx:442` | Computes `minWidthPx` and hands it to `ColumnResizeHandle`; **no load-time clamp exists** (§1.4) |
| Width override var | `gridColVar(key)` → `--cf-col-<key>`, px, `grid-column-geometry.ts:53-55` | Set from `useGridColumnWidths`; wins over the rem fallback |
| Persisted staff prefs | `useGridColumnWidths` in `src/components/ui/table-column-config/useGridColumnWidths.ts` | px only, `staff_preferences.tableColumns[t].widths`; `resetWidths()`/`clearWidth()` already exist |
| Absolute floor | `clampColumnWidth(px, minPx=64)` in `useColumnWidths.ts:13-16` | The house-wide 64px hard floor under every type floor |
| Guard | `grid-column-tier.guard.test.ts:162,178` | Already asserts `resolveGridColumnMinTrackRem(dateStampColumn) === 12` — **must update to the new constant in the same change**, or it fails the moment Wave 1 lands |
| Unit tests | `grid-column-type-track.test.ts` | Covers resolve + override + rem→px; Wave 1/2 extend, don't replace |

---

## 3. The SoT edit — literal before/after

**File:** `.claude/rules/source-of-truth.md`, under `## Grid column visibility + sort` (the bullet
immediately after "Receiving leftover width", immediately before "Never call
`useIsColumnHidden()`").

### Before

```markdown
- **Typed date track floors (2026-08-04):** `dateFace` (`day` · `stamp` · `duration`) +
  `resolveGridColumnMinTrackRem` in `grid-column-type-track.ts` — same discipline as
  `ALIGN_BY_TYPE` / `ColumnTypeGlyph`. Stamp = day+time (`Aug 3 4:54 PM`) → **12rem**; day
  default 4.5rem; duration 3rem. SoT width must clear the floor; drag-resize clamps to it.
  Receiving History DATE declares `dateFace: 'stamp'`.
```

### After (Wave 1 lands with this edit, not before)

```markdown
- **Typed date track floors (2026-08-04, floor remeasured <WAVE-1-DATE>):** `dateFace`
  (`day` · `stamp` · `duration`) + `resolveGridColumnMinTrackRem` in `grid-column-type-track.ts` —
  same discipline as `ALIGN_BY_TYPE` / `ColumnTypeGlyph`. Stamp = day+time (`Aug 3 4:54 PM`) →
  **<MEASURED>rem** (Wave 0 measured against the 12h worst case, `"Sep 30 12:59 PM"` — 12h
  strictly dominates 24h in width for the same instant, `formatStageClockTimePST` follows the
  per-staffer `timeFormat` preference, so one measured floor covers both clock formats); day
  default 4.5rem; duration 3rem. **The floor is a MEASUREMENT, not a guess** — regenerate it with
  `<WAVE-0-TOOL-PATH>` rather than hand-picking a new rem value; a PR that edits the constant
  without re-running the tool is reviewed as a regression. SoT width must clear the floor;
  drag-resize clamps to it live (`gridTrackRemToPx` reads the current root font-size, so the clamp
  already tracks a staffer's `fontScale`); **a persisted px pref narrower than the current floor is
  clamped on LOAD, not just on drag** (`<LOAD-CLAMP-FILE>`) — `fontScale` changes the effective
  floor in px even when the rem constant does not. Receiving History DATE declares
  `dateFace: 'stamp'`; `<SCOPE-LIST-FROM-WAVE-2>` also declare `dateFace: 'stamp'`.
```

Fill the four placeholders (`<WAVE-1-DATE>`, `<MEASURED>`, `<WAVE-0-TOOL-PATH>`,
`<LOAD-CLAMP-FILE>`, `<SCOPE-LIST-FROM-WAVE-2>`) from the Wave 0/1/2 outputs below — **do not
pre-fill them now**; a plan that writes a specific rem number without having run the measurement
is exactly the "guess a new constant" failure mode this whole effort exists to end.

### Secondary edit — `useGridColumnWidths` docblock

`src/components/ui/table-column-config/useGridColumnWidths.ts:29-40` currently documents only the
drag-commit path. Add one sentence recording the load-time clamp once Wave 3 lands it, so the next
reader does not have to re-derive §1.4 from the code.

---

## 4. Rulings D1–D6, reconciled against §1, and what each one edits

| # | Verdict (unchanged) | Correction from §1 | What actually changes |
|---|---|---|---|
| D1 | Fixed `minmax(floor, floor)`, no `max-content` | None — confirmed correct against the virtualized `LedgerGrid` architecture | Nothing to build; already the shape. Wave 1 only changes the **constant**. |
| D2 | Scale tracks with density/zoom | **Corrected**: couple to `--cf-density` (matches every other density token), not an invented `--cf-density-scale`; `fontScale` already scales the rem literal for free (§1.1) | `grid-column-type-track.ts` |
| D3 | Grip Autofit stays banned; one-shot "Fit to content" only from a menu, if ever | None | No code change unless Wave 2/3 chooses to add the menu action — **out of scope for this plan**, tracked as a Defer |
| D4 | Keep `Aug 3 4:54 PM`; measure against realistic worst case | **Corrected**: the worst case is provably the 12h reading, not a guess — no localization/24h branch needed for the floor itself (§1.3) | Confirms the Wave 0 target string; no format code change |
| D5 | Clamp undersized prefs on load; preserve oversized | **Extended**: must also cover a pref that goes stale purely from a `fontScale` change, not just a SoT constant change (§1.4) — same fix, wider trigger set | `useGridColumnWidths.ts` (or its call site) |
| D6 | Scope to every `dateFace: 'stamp'` declaration | Unchanged; **confirmed by grep, not audit**: `receiving-grid-layout.ts:125` is the ONLY `dateFace: 'stamp'` in the tree today. `incoming-grid-layout.ts:95,98` declares `dateFace: 'day'` (Expected/By) and `dateFace: 'duration'` (Age) — neither is stamp, neither is affected by Wave 1 | Nothing to scope in Wave 2 beyond re-running the grep before merge, in case another surface grew a stamp column since this plan was written |

---

## 5. Phased plan

### Wave 0 — measure, don't guess

**Outcome:** one number, produced by a script, not a person.

1. Build a Playwright component/page test that renders `GridDateCellValue` with `label="Sep 30
   12:59 PM"` under the real cascade (`text-role-caption`, the `px-2` grid cell inset from
   `ledgerGridCell`, default `fontScale` = 1.0), then reads `clientWidth` off the rendered span +
   its inset ancestor. This is the **primary** SoT-generating measurement (§1.5) — it is real DOM,
   real font, real CSS, not a synthetic canvas context.
2. Cross-check with a `ctx.measureText()` script using the **real** font stack
   (`--ds-font-sans`/Inter, the actual `text-role-caption` computed `font-size`/`font-weight`, not
   `labelCommands.ts`'s hard-coded Arial) as a fast, no-browser sanity check — secondary only, per
   §1.5.
3. Enumerate the closed set from §1.2 (12 month abbreviations × `AM`/`PM`) rather than one string,
   and take the max — a proportional font can render `"Sep"` and `"May"` at different widths even
   though both are 3 letters.
4. Convert the measured px to rem at the **default** root size (16px × `fontScale` 1.0); this is
   the constant that ships in `MIN_TRACK_REM_BY_DATE_FACE.stamp`.
5. **Proof:** the Playwright test itself becomes the regression guard — assert `SoT floor rem ×
   16px ≥ measured px` and keep it in the repo so a future font change re-runs the same check
   instead of prompting another rem-guess.

**Risks:** Inter is a variable font (`src/lib/fonts.ts:50`) — confirm the deployed weight/axis
settings match what's measured, or the measurement is against the wrong glyph metrics.

### Wave 1 — Receiving stamp floor

**Outcome:** `MIN_TRACK_REM_BY_DATE_FACE.stamp` set to Wave 0's measured constant (expected
somewhere below 12, above the ~9.5 clip line from the brief's bench evidence — do not pre-commit
to a number here); `.claude/rules/source-of-truth.md` edited per §3's literal template with the
placeholders filled from Wave 0's actual output.

- `grid-column-type-track.test.ts` — update the `stamp` assertion to the new constant (currently
  hard-codes `12` at line 17 in the "resolves stamp / duration faces" test, and again at
  `grid-column-tier.guard.test.ts:178`); add a test that the new constant is `<` the old `12` (so a
  future accidental revert to a wider guess is caught, not just a narrower one).
- No component changes — `ReceivingDateCell.tsx` / `LedgerGridColumnHeader.tsx` read the constant
  indirectly through `resolveGridColumnMinTrackRem`.

**Risks:** existing persisted staff `--cf-col-date` px prefs at the OLD floor stay put until Wave 3
lands the load clamp — expect zero visible change for staff who already have a stored width until
Wave 3 ships.

**Proof:** Playwright visual/geometry assertion on `/receiving/history` — no left-clip
(`clientWidth` of the text ≥ rendered scrollWidth) and a bounded slack budget (e.g. `< 1rem` of
empty space at end-align), for both a 12h-preference and a 24h-preference staff fixture.

### Wave 2 — generalize to every `dateFace`

**Outcome:** the same measured-not-guessed discipline applied to `day` (4.5rem, used by
`incoming-grid-layout.ts:95` Expected/By) and `duration` (3rem, `incoming-grid-layout.ts:98` Age)
— **not** a re-scoping exercise; §4's D6 row already confirmed by grep that `stamp` has exactly one
declaration in the tree (`receiving-grid-layout.ts:125`), so there is nothing to migrate onto the
new discipline besides those two other faces.

- Re-run the `dateFace: 'stamp'` grep before merging Wave 2, in case a surface grew one since this
  plan was written — a one-line check, not the audit originally scoped here.
- `resolveGridColumnMinTrackRem` stays a pure function keyed on `dateFace` — no interface change
  needed; only the constants and their provenance change.
- **Proof:** `resolveGridColumnMinTrackRem(...)` unit tests assert every constant against a Wave-0
  style measured baseline (not just a hard-coded number), one test per face.

### Wave 3 — the load-time clamp (D5, §1.4)

**Outcome:** a persisted `--cf-col-<key>` px pref narrower than the *current* live floor
(`gridTrackRemToPx(resolveGridColumnMinTrackRem(column))`, evaluated at the *current* root
font-size) is clamped **on load**, not only rescued the next time the staffer drags it.

- Likely landing site: `useGridColumnWidths.ts`'s `columnVars` `useMemo` (lines ~62-67) — filter
  or clamp each `[key, px]` entry against its column's live floor before emitting the CSS var. This
  needs the column model (for `dateFace`/`type`) at that call site, which it does not have today —
  confirm whether to pass the resolved column list in, or move the clamp to the surface that
  already has both (`LedgerGridSurface.tsx`, which already resolves `visible` columns and already
  consumes `useGridColumnWidths`).
- Preserve, don't discard: a clamp corrects the **rendered** width; it should not silently rewrite
  the persisted pref to the new floor (that would erase evidence the staffer once wanted this
  column even wider, if the floor later needs to widen again) — clamp the CSS var output, leave
  `staff_preferences` alone, unless product explicitly wants the stored value corrected too (ask
  first — this is a data-write decision, not a render decision).
- **Proof:** unit test on the clamp function with a synthetic stale pref (px below floor) → CSS var
  output equals the floor, not the stale pref; a fixture at/above floor is passed through
  unchanged.

**Risks:** if the clamp needs the resolved column model and that is not cheaply available at
`useGridColumnWidths`'s current call sites, this could force a small prop-threading change across
the same ~13 grid views Phase A of the column-control handoff already touched — check
`docs/todo/grid-header-column-control-HANDOFF.md` before landing, in case the surface shape moved
again since this plan was written.

---

## 6. Guards this plan must touch (do not skip)

| Guard | Change |
|---|---|
| `src/design-system/components/grid/grid-column-type-track.test.ts` | Wave 1: update the `stamp` constant assertion; add "new constant < old constant" |
| `src/lib/tables/grid-column-tier.guard.test.ts:178` | Wave 1: same constant, second call site — **will fail Wave 1 if not updated in the same commit** |
| New: Wave 0's Playwright measurement spec | Becomes a standing regression guard, not a one-off script — keep it in `tests/e2e/` |
| New: Wave 3's load-clamp unit test | Per §5 Wave 3 |

---

## 7. Explicit Never / Defer

- **Never** adopt TanStack Table `getSize()`, `react-virtualized` `CellMeasurer`, or TanStack
  Virtual's absolute-position matrix as the width source of truth — rejected in §1.5, restates the
  existing `ui-design-system.md:64` ban in this plan's own terms so it survives independently of
  that file.
- **Never** a character-length × average-width heuristic for the stamp face — Inter is
  proportional; digits are already tabular via `GridDateCellValue`, letters are not, so an average
  is wrong in both directions (§1.5).
- **Never** re-litigate `_fill` as the slack absorber, or make Product/title the flex track on
  Receiving — untouched by this plan.
- **Defer** the one-shot "Fit to content" menu action (D3's allowed exception) — no consumer asked
  for it; do not build it speculatively while landing Wave 1–3.
- **Defer** true i18n width scaling (non-English month names, different date orderings) until the
  multi-tenant product requires it — matches the brief's own Defer list; §1.3's 12h⊇24h proof does
  not extend to other locales' AM/PM equivalents without re-measuring.

---

## 8. Ask-first questions — narrowed

The brief listed five. §1 answers three from code with no ambiguity:

- ~~Q1 (tabular vs proportional numerals)~~ — **answered**: tabular via `GridDateCellValue`'s
  explicit class; letters are proportional (§1.2).
- ~~Q3 (how is `--cf-density` wired to CSS Grid today)~~ — **answered**: it isn't yet for track
  floors; every other density-aware token uses `calc(Xrem * var(--cf-density, 1))` and D2's fix
  should match that existing pattern, not invent a new one (§1.1).
- ~~Q5 (12h vs 24h format)~~ — **answered**: both are live per-staffer; 12h is provably the wider
  case, so there is nothing to pick (§1.3).

Two remain genuinely open, for a human:

1. **D5's write-vs-render scope** (§5 Wave 3): when a load-time clamp fires, should it *only*
   affect what renders, or should it also correct the stored `staff_preferences` value so the
   staffer's next session doesn't re-trigger the same clamp? Rendering-only is the safer default
   (never silently mutates stored prefs) but leaves a permanent "clamped every load" cost for
   anyone who saved a pre-Wave-1 narrow width. Product call.
2. **Wave 3's prop-threading cost** (§5 Wave 3 risk): if the load clamp needs the resolved column
   model at `useGridColumnWidths`'s call sites and that requires touching the same grid views
   `grid-header-column-control-HANDOFF.md`'s Phase A already collapsed, should Wave 3 land as part
   of *this* plan or be sequenced after whatever Phase B of that handoff ships, so the two don't
   edit the same 13 files out of order? Sequencing call, not a technical one.
