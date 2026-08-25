# Identifying consumers for `@chenglou/pretext`

**Status:** Phase 2 SHIPPED 2026-08-25. Phases 3 and 4 remain deferred, for the
reasons already recorded below. Written 2026-08-25, after the library was
installed at the operator's instruction with no consumer wired.

`@chenglou/pretext` v0.0.8 — "Fast, accurate & comprehensive text measurement
& layout". 240K, zero dependencies, ESM, `sideEffects: false`. Its premise is
that it computes text dimensions **without touching the DOM**, so it never
forces the layout reflow that `getBoundingClientRect` / `offsetHeight` /
`scrollHeight` do.

That premise is unusually well aligned with this codebase's constitution: M1
exists specifically to keep reflow off the operator's critical path. But
alignment of philosophy is not a consumer. This plan is how to find real ones.

---

## Phase 0 — the honest baseline (DONE, 2026-08-25)

Every reflow-forcing read in `src/`, excluding tests:

| API | count |
| --- | --- |
| `getBoundingClientRect` | 4 |
| `scrollHeight` | 4 |
| `clientHeight` | 3 |
| `measureText` | 2 |
| `offsetHeight` | 1 |
| `getComputedStyle` | 1 |

**15 total.** That is a small number, and it is the first finding: this
codebase does not have a diffuse measurement problem. It has two concentrated
ones. A blanket "replace DOM measurement with pretext" sweep would be
answering a question nobody asked.

Call sites:

```
shell/AssistantFeed.tsx:296          scroll anchoring (scrollHeight/clientHeight)
shell/AssistantFeed.tsx:314          scroll to floor
design-system/hooks/useMoreBelow.ts  overflow affordance      [tree being deleted]
design-system/hooks/useVerticalSplitDrag.ts  drag math        [tree being deleted]
design-system/primitives/AnchoredLayer.tsx   popover anchor   [tree being deleted]
lib/ui/portal-anchor.ts:75           popover anchor
lib/support/support-chat-utils.ts:116  stick-to-bottom
lib/print/labelCommands.ts:145       shrink-to-fit  ← CANDIDATE
lib/print/productLabelCommands.ts:76 shrink-to-fit  ← CANDIDATE
```

---

## Phase 1 — triage rule

A call site is a pretext candidate only if **all three** hold:

1. **It needs TEXT dimensions**, not box dimensions. A popover anchor needs to
   know where a box is; pretext cannot help and should not be used.
2. **The current answer is wrong, guessed, or expensive** — a magic number, a
   character count standing in for a width, or a loop that re-measures.
3. **Replacing it is observable** — a number moves, or a defect stops
   reproducing. If the only benefit is architectural tidiness, skip it.

Applying that rule:

- **Popover/anchor sites** (`portal-anchor`, `AnchoredLayer`) — FAIL rule 1.
  They measure boxes. Leave them.
- **Scroll anchoring** (`AssistantFeed`, `support-chat-utils`) — FAIL rule 1.
  They need the scroller's own geometry, which pretext does not model.
- **`design-system/**`** — out of scope regardless: that tree is being deleted
  by a parallel lane. Anything wired there is wired into a grave.
- **The two label printers** — PASS all three. Detailed below.

---

## Phase 2 — the primary consumer: label printing

`src/lib/print/labelCommands.ts` and `src/lib/print/productLabelCommands.ts`.
These render TSPL2 raster jobs for physical labels that get stuck on boxes in
the warehouse. Two defects, both text-measurement defects:

### 2a. `wrap()` wraps by CHARACTER COUNT, not width

```ts
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  ...
  if (candidate.length > maxChars) { ... }
}
```

Called as `wrap(notes, 22, 3)` and `wrap(title, 24, 2)`.

Three problems, in increasing severity:

1. **Character count is not width** in a proportional font. `"WWWWWWWWWWWWWWWWWWWWWW"`
   and `"iiiiiiiiiiiiiiiiiiiiii"` are both 22 characters and differ by roughly
   3x in printed width. The 22 is tuned for average text and is wrong at both
   tails — it either overflows the label or wastes half of it.
2. **`.split(/\s+/)` cannot wrap CJK at all.** CJK has no spaces, so a Chinese
   or Japanese product title is a single "word" that never wraps and silently
   overflows the label edge. Pretext ships kinsoku line-breaking
   (`kinsokuStart` / `kinsokuEnd` are in its public API) precisely for this.
3. **It silently truncates** — `lines.slice(0, maxLines)`. Text disappears
   from a printed label with no signal to the operator holding it.

It is also **duplicated verbatim** in both files, so any fix has to land twice
or be extracted first.

**Replacement:** `prepareWithSegments(text, font)` once, then
`layoutWithLines(prepared, labelWidthPx, lineHeight)`. Real width-based
wrapping, correct segmentation, and `lineCount` tells you when you are about
to truncate so it can be surfaced instead of swallowed.

### 2b. Shrink-to-fit is a linear search

```ts
do {
  context.font = `${weight} ${size}px Arial, sans-serif`;
  if (context.measureText(text).width <= maxWidth || size <= 8) break;
  size -= 1;
} while (size > 8);
```

Decrements 1px at a time, mutating `context.font` and re-measuring on every
iteration. From an initial 28px that is up to 20 canvas font mutations plus 20
measurements per field, per label.

**Replacement:** `measureLineStats(prepared, width).maxLineWidth` returns the
tightest width that fits the text — the "multiline shrink wrap" the README
calls out. Solve for the size ratio directly instead of searching for it.

### What actually landed (2026-08-25)

Both defects were real, and one of them was worse than this plan described.

`wrap()` and `drawFittedText()` now live once, in
[`src/lib/print/labelText.ts`](../../src/lib/print/labelText.ts). Both label
command modules import from it; neither carries a copy.

The correction to the plan: a label has **two** font models, and the single
shared `wrap(text, maxChars, maxLines)` was wrong for both, differently.

- The **raster face** (`build*BitmapCommands`) draws real proportional Arial
  onto a canvas. That is measurable, so it is measured — `wrapToWidth()` is
  pretext (`prepareWithSegments` + `layoutWithLines`). This is the path the
  CX418 actually takes for TSPL, so it is the path that matters most.
- The **native command languages** (TSPL `TEXT`, ZPL `^FD`, ESC/POS) hand the
  string to printer-resident firmware fonts that nothing in this process can
  measure. Pretext cannot help there and is not used; measuring Arial to
  predict TSPL font `"2"` would be the "looks authoritative" failure this plan
  already warned about. `wrapMonospace()` counts cells instead — but segments
  with `Intl.Segmenter`, not `/\s+/`, so CJK gets real break opportunities.

Because the wrap moved out of `fieldsFor()` / `productFieldsFor()` and into
each renderer, the per-language budgets could stop being a guess:

| path | old budget | new budget | basis |
| --- | --- | --- | --- |
| TSPL notes/title | 22 / 24 chars | `cellsForDots(207, 12)` = **17** | font `"2"` is a 12-dot fixed-pitch firmware font. Exact. |
| ZPL notes/title | 22 / 24 chars | `zplCellsForDots(216, 20)` = **18** | `^A0` is scalable and proportional; budgeted at 0.6 of the declared cell. The only approximation in the file, and labelled as one. |
| ESC/POS notes | 22 chars | **42** | 80 mm roll, Font A, 12-dot cells across 576 dots. |
| ESC/POS title | 24 chars | **21** | same, halved: the title prints at `ESC ! 0x18` (double width). |
| raster face | 22 / 24 chars | measured | pretext, against the font the canvas actually paints. |

The old TSPL number was not merely imprecise — 22 cells of font `"2"` is 264
dots on a line that has 207, so every full-width note row was already printing
over the DataMatrix.

**Truncation** is now reported (`FittedLines.truncated` / `.overflow`) and
marked on the sticker: `…` on the raster face, ASCII `...` on the native
languages, because `sendRaw` encodes the command string as UTF-8 while TSPL
runs `CODEPAGE 1252` and U+2026 would arrive as three garbage cells.

**Shrink-to-fit** is solved, not searched: measure once at the initial size and
divide, since canvas advance widths scale linearly with px size. A test pins it
against the old 1px-at-a-time walk and asserts they agree on every case.

### Why this one first

- It is a **correctness** problem, not a performance one. A misprinted label is
  a physical object on a physical box that an operator will scan later.
- It is **off the scan path entirely**, so a regression cannot stall the wedge.
  Contrast the composer, below.
- It is **testable without a browser** for the wrapping logic, and the existing
  `test:zip` / label test conventions already cover this area.

---

## Phase 3 — the secondary consumer, and why NOT yet

**Composer auto-grow** (`.occ-editor`, `max-height: 140px`, `overflow-y: auto`).

If the field ever needs to grow to fit its content rather than scroll, the
normal implementation reads `scrollHeight` — a forced reflow **on every
keystroke, in the field the scan gun types into**. That is the exact scenario
M1 is written against, and pretext's `layout()` replaces it with arithmetic.

**Do not do this yet.** Three reasons:

1. The field currently **scrolls** rather than grows, so there is no reflow to
   remove. This is a candidate for a feature that does not exist.
2. `OmniCommandComposer` is Lexical. Its measurement would have to interoperate
   with Lexical's own reconciler, which is a research task, not a swap.
3. It is on the scan path (I2/I3, T20/T21). Any change there needs the wedge
   burst test green before and after, and that is a bigger safety budget than
   this is worth today.

Revisit **only if** auto-grow is actually specified.

---

## Phase 4 — the speculative consumer: deriving the tile floors

`--tile-min-session: 784px` and `--tile-min-table: 520px` are documented in
`tokens.css` as "the application's real minimums, not a guess." They are
hardcoded numbers, which means the comment is currently an assertion rather
than a measurement.

`walkLineRanges()` gives the widest line — the tightest container width that
still fits the text. That is exactly the quantity those tokens claim to be.

**Shape of the work:** a build-time or test-time script that takes the real
column headers and representative row content, asks pretext for the shrink-wrap
width at the shell's actual font stack, and asserts the token is >= that. Then
the comment becomes true and the number stops drifting.

**Blocker:** pretext measures using the browser's font engine as ground truth;
the README lists server-side rendering as "soon", not shipped, at v0.0.8. So
this has to run in a Playwright context, not in Node. That is doable — the e2e
harness already exists — but it is the reason this ranks third, not first.

---

## Phase 5 — acceptance criteria (MET, 2026-08-25)

- [x] **A CJK title wraps correctly where it previously overflowed.** Measured
      in a real browser at the real geometry, 19px Arial, 214-dot info column:

      | title | BEFORE | AFTER |
      | --- | --- | --- |
      | 30 CJK chars | 1 line, shrunk to **12px** | 2 lines at **19px** |
      | 40 CJK chars | 1 line, shrunk to **9px** | 2 lines at 19px, cut marked |
      | 40 `W` | 1 line at the **8px floor, 348 dots — overflows by 134** | 2 lines at 19px, fits |

      The plan predicted overflow; what the old code mostly did first was
      *shrink*, because `drawFittedText` rescued the bad wrap by walking the
      font size down. That is its own defect — 19px design text printed at 9px
      on a 203-DPI thermal head, with the label's second line left empty — and
      the 40-`W` row shows the shrink bottoming out and overflowing the code
      after all. Evidence page: `label-wrap-evidence.html` (rebuild from
      `src/lib/print/labelText.ts` + a verbatim copy of the old `wrap()` /
      `drawFittedText`).

      Caveat worth keeping: the browser used to produce that table has **no CJK
      font installed**, so its CJK panels draw notdef boxes at notdef widths
      (11.19 dots vs Arial's `W` at 18.37). The line-BREAKING decision is what
      is demonstrated there; the glyphs are not.

- [x] **All-wide and all-narrow titles are told apart.** At 19px Arial in that
      browser, `W` = 18.37 dots and `i` = 5.68 — a 3.2x spread invisible to a
      character count. 24 `i` prints one line at the full 19px; 24 `W` wrapped
      to two lines at 19px, where the old rule crushed it to 9px on one line.

- [x] **Truncation is surfaced.** `wrapToWidth`/`wrapMonospace` return
      `{ lines, overflow, truncated }`, and the last kept line carries an
      ellipsis so the operator holding the sticker can see it was cut.

- [x] **`wrap()` exists in ONE place** — `src/lib/print/labelText.ts`. So does
      `drawFittedText`, which was duplicated verbatim in the same two files.

Version is pinned to an exact `0.0.8` (no caret), per the risk below.

### Testing note

`src/lib/print/labelText.test.ts` installs a deterministic stand-in font engine
(a table of Arial-like advance ratios on a fake `OffscreenCanvas`) because Node
has no canvas and pretext measures against the browser's font engine. That is
deliberate: the claims under test are layout DECISIONS — does a wide string
wrap where a narrow one of the same length does not, does a spaceless CJK title
break at all, is dropped text reported — and none of those should depend on the
exact advance of Arial's `W` in one browser build. Real numbers come from the
real engine in the browser, which is where the raster label is drawn.

`src/lib/print/labelCommands.test.ts` covers the native TSPL path end to end,
which needs no canvas at all.

---

## Risks

- **v0.0.8.** Pre-1.0, single maintainer. PINNED to an exact `0.0.8` in
  `package.json` (2026-08-25) — no caret range in a system that prints physical
  labels. JSON carries no comment; this line is the reason.
- **Font ground truth.** Pretext measures against the browser's font engine.
  The label printers hardcode `Arial, sans-serif` while the shell uses IBM
  Plex. Measuring with the wrong font stack is worse than a character count,
  because it looks authoritative. Handled by declaring the family ONCE, as
  `LABEL_FONT_FAMILY` in `labelText.ts`, and building every measured font
  string through `labelFont(weight, px)` — the same helper `drawFittedText`
  paints with, so the measurement and the paint cannot drift apart. Still
  unresolved: nothing checks that the *browser* actually has Arial, or a CJK
  font. Absent glyphs measure as notdef boxes and print as notdef boxes; the
  wrap stays correct for whatever is rendered, which is the most this layer can
  promise.

- **Bundle weight.** The 240K stays out of the main bundle: `labelText.ts` is
  reachable only from the two label command modules, and `printProductLabel.ts`
  already loads those behind a dynamic `import()` (they carry bwip-js). Nothing
  in a station bundle pulls pretext in.
- **Node-side unavailable.** Anything in a build script or unit test needs a
  browser context until server-side lands. This is why the native command
  builders stayed off pretext entirely — `buildReceivingLabelCommands` is
  exercised in Node — and why the unit tests stand in a fake font engine rather
  than importing a canvas polyfill.
