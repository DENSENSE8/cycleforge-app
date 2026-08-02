# Carton read surface (`/carton/[id]`)

Recipe for the durable **read** record of a carton — observe-first with a work **escape**, not Station Workbench and not a Monitor KPI rollup.

**SoT rows:** `source-of-truth.md` → Photo gallery viewer · Carton read surface.  
**Sharing boundary:** `pattern-evolution.md` Always #5 (D6) — read model + atoms only; never Unbox layout panels / `CartonContextCard` / lobotomized work chrome.  
**Guard:** `src/components/receiving/inspector/carton-inspector.guard.test.ts`.

## Anatomy

```
┌─ DispositionBar ──────────────────────────────────────────────┐
│ ● Disposition · Carton {id} · chips  [Photos·N] [utils] [⚒]  │
└───────────────────────────────────────────────────────────────┘
┌─ PHOTOS (in-flow band, ?photos=1) ────────────────────────────┐
│ Exact photo | Investigative · All|Box|Item (+Claim) · tiles   │
└───────────────────────────────────────────────────────────────┘
┌ Col 1 — RAIL (22rem) ┬─ Col 2 — WHAT HAPPENED TO IT (1fr) ──────┐
│ WHAT IS IN THE BOX   │ PROGRESS  — ReceivingCartonPipeline       │
│ CONTENTS · RECORD    │ ACTIVITY  — carton events                 │
│ lines · sparse facts │ FINDINGS  — exceptions (above History)    │
│ / notes (white cards)│ HISTORY   — unit journeys + photo thumbs  │
└──────────────────────┴───────────────────────────────────────────┘
```

- **≥xl:** two columns split by QUESTION, not by weight — col 1 is the box's
  contents and its record; col 2 is its timeline. **ACTIVITY belongs to col 2**
  (moved 2026-08-02): it is an event stream and reads with the other two
  (pipeline milestones, unit journeys), not under a line list it does not
  describe.
- **The tracks are ASYMMETRIC, because the columns are not peers**
  (`xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]`, ruled 2026-08-02). Col 1
  answers a **bounded** question — the median carton is one line plus a sparse
  fact set — while col 2 is an **unbounded** stream that grows with every scan,
  photo and unit. Equal `xl:grid-cols-2` tracks therefore *guaranteed* the
  imbalance rather than risking it: measured at 1440×900 on carton 50354 the
  left column's content ended **212px** down against **826px** on the right, so
  two thirds of a 686px-wide column was empty canvas. CSS grid stretches both
  *cells* to equal height, which is why a screenshot cannot see this — measure
  the last child's bottom relative to the column top, per column.
  **A rail cannot out-run a timeline and must not try; it should stop
  pretending to be its peer.** After: tracks 352 / 1020, extents 256 / 762
  (ratio 0.26 → 0.34) and the empty region drops from ~421k px² to ~178k —
  **58% less dead canvas**, now reading as the margin beside a stream instead
  of a broken column. Same shape every record surface uses for the same reason
  (Linear · GitHub · Shopify: narrow metadata rail, wide content stream).
  - **Rejected: `2fr/3fr`** — measured 549 / 823 with an *identical* left
    extent (256), so it bought none of the balance and left 313k px² empty.
    Track width does not change how tall a fact set is; only how wide the void
    beside it is.
  - **Rejected: stack below a line-count threshold** — a layout that changes
    shape on a data threshold teaches two surfaces for one job and cannot be
    guarded.
  - **The rail does NOT need help at 4+ lines** (measured 2026-08-02, whole
    dogfood tenant — the asymmetry was ruled on single-line cartons, so this was
    the open question). 4+ line cartons are **17 of 2792 (0.6%)**, and on exactly
    those the stream out-grows the rail *hardest*: **5.1 lines against 39.8
    events** on average, ~8:1. Line count and event count are positively
    correlated — a carton with more in it gets worked more — so the premise
    strengthens at the size that was expected to break it. Pulling the other way,
    **1297 cartons (46%) have zero lines**, where the rail holds nothing at all.
    Do not re-tune the tracks for a bigger contents list.
  - **The one shape that inverts it is not worth a layout** — 4 cartons (0.14%)
    have 4+ lines and an empty stream. Carton 2402 is the extreme: 12 lines, 8
    POs, **0 events, 0 photos, 0 serials**. Nothing has ever happened to it, so
    the rail is the taller column. That is an un-worked carton, not a second
    shape the surface should learn.
  - **Still open (not needed for this fix):** growing CONTENTS with read-only
    per-line evidence (serial list, per-line photo count, per-line exception).
    That is the only lever that adds real left-column *height*; the rail makes
    the surface honest without it.
  - **Un-measured, and only in pixels:** every number above is row counts, not
    geometry. The rendered extents at 1440 on a 4+ line carton (6159 — 7 lines,
    5 serials, 14 events — is the best witness) still want the Playwright probe.
- **Mobile / <xl:** stack col1 then col2 — the rail track must not survive the
  breakpoint (both columns go full width).
- **Guard:** `tests/e2e/carton-column-balance.spec.ts` pins the asymmetry
  structurally (timeline track > 1.4× the rail) and logs the extents; the
  columns carry `data-testid="carton-contents-column"` / `"carton-timeline-column"`
  for the probe.
- **Photos:** the DispositionBar's **primary CTA** (`Photos · N`) opening the
  in-flow `CartonPhotoTriage` band **above both columns** — never a mid-rail
  launcher card, never `EvidenceStage`, never a second lightbox. Recipe +
  measured rationale: `docs/todo/carton-photo-triage-RESEARCH-RULING.md`.
- **Journey thumbs are EVENT CONTEXT, and they stay** (ruled 2026-08-02). The
  page has three photo surfaces and only two of them browse: the band answers
  *which photos prove this carton* (grouped by match confidence × subject —
  Exact | Investigative, All | Box | Item | Claim, over
  `useReceivingPhotos(receivingId)`), and the HISTORY thumb strips answer *what
  was photographed at this point in THIS unit's life* (per-stage rows folded in
  at their stage timestamps, from `/api/serial-units/[id]/timeline-photos`). A
  thumb is an attribute of the journey row it sits on, the way a `SerialChip`
  is — take it away and the row stops saying that a photo was taken at that
  step. That is not something the band can say, because the band has no
  per-unit timeline. **So this is not a second browser and must not be
  "unified" into one; the two surfaces are asking different questions.**
  - **The third surface is the viewer, and it is shared, not forked.** Both open
    `PhotoViewerPortal` / `usePhotoGallery`, and `CartonUnitJourneyHistory`
    passes `galleryPhotos` / `galleryMatchIds` so a thumb opens **the whole
    carton set** at the right index rather than the capped per-unit preview
    `unitTimelinePhotosQuery` would otherwise supply. Deleting that override
    silently narrows the lightbox — the strip would still look right.
  - **Different sources are the point, and are the one thing to keep honest.**
    The strips are unit-scoped and the band is carton-scoped, so a photo can
    appear in one and not the other. That is legitimate. What is not legitimate
    is two *fetches* of one set: this component used to hold its own
    `['receiving-photos', id]` query, so the page fetched the endpoint twice and
    the copies could disagree after a delete. One carton query, shared.
  - Both pass `{ url }` only, so upload / delete / reassign stay off the read
    surface — same rule as the band.
  - **Do not deep-link a thumb into the band's bucket.** It was the alternative
    considered here: it would make the thumb a navigation control on a surface
    whose job is reading, scroll the operator away from the journey they are
    reading to a lane that groups by a different axis, and put the band's
    filter state in the strip's hands.
- **The trailing `purchase_orders` list is not a duplicate of CONTENTS, and
  CONTENTS does not group by PO** (ruled 2026-08-02). A contents row renders
  title · `ProgressBadge` · SKU · condition · serials and **no PO number at
  all**, so the rollup (`PO → n lines`, shown only when a carton has more than
  one) is the sole place the PO breakdown appears — it says something the flat
  list cannot. It is also nearly hypothetical: **9 of 2792 dogfood cartons**
  (0.3%) carry more than one PO. Grouping the list by PO would add a header tier
  to 99.7% of cartons to serve 9, so the rollup stays a rollup. What the pair
  genuinely cannot do is *join* — 2402 reads "8 POs" and "12 lines" with no way
  to tell which line came from which. If that ever needs closing, put a PO chip
  on the row (a per-line fact, the same lever as the read-only per-line evidence
  above); do not re-shape the column.
- **Contents rows are left-aligned**, title → meta, using shared ATOMS
  (`ProgressBadge` · `SkuScanRefChip` · `ConditionGradeChip` · `SerialChip`).
  **Never `PoLineMetaGrid`** — that is the Unbox accordion's fixed-track grid,
  and its whole job is holding one x-position across many stacked rows. There is
  no column to align with here, so it spread four chips across empty space and
  applied `META_COL.indentWide`, the dot-track indent of a queue this card has no
  dot track for. The row read as centered.  
- **FINDINGS sits ABOVE HISTORY** (hoisted 2026-08-02). Disposition truth already
  says exceptions outrank `lifecycle.done`; the same logic says an unresolved
  finding must not be the last thing an operator scrolls to. History is
  **unbounded** — it grows with every unit and photo — so "last in the column"
  meant "below the fold" on exactly the cartons that had something wrong.
  It stays *under* Activity, not above Progress: a reader needs to know **where**
  the carton is before they can act on **what is wrong** with it.
- **An ACTIVITY row must render the fact that makes it different from the row
  above it.** Two events one second apart looked like twins on carton 50354
  (`RECEIVED`/next_status `RECEIVED` vs `NOTE`/no status) because the row threw
  away both distinguishing facts: the title is `notes || event_type`, so with
  notes present the TYPE never rendered; and the status trail was gated on
  `prev && next && prev !== next`, so the row that moved the unit to RECEIVED —
  a unit's **first** status, which has no prev — showed nothing at all.
  **A first status IS a transition** (`→ RECEIVED`). Suppress the kind only
  when something else already said it (status equals type, or the title *is*
  the type because there were no notes).
  Row anatomy: title · timestamp, then **`StaffAvatar` + name leading**
  (an event is someone's action, and the face is the fastest thing to
  recognise; resolve by **staff id**, never from the name), then the **station
  as a glyph** (`resolveStationGlyph` → `TIMELINE_GLYPH_ICONS`, with an
  `sr-only` word — `RECEIVING` in caps out-shouted the note it belonged to),
  then kind / status trail / `SerialChip`. An unmapped bench keeps its text.
- **Progress:** shared `ReceivingCartonPipeline` (Scanned → Unboxed → Received + `PipelineStageRow` details) on a white `Panel` surface — never a hand-rolled HANDLING provenance strip.  
- **Section cards:** contents lists, activity, facts/meta, photos, progress, and history sit on `bg-surface-card` / `Panel` — not bare canvas.  
- **Work escape:** one quiet control using `openInUnboxHref` (icon / secondary). Zero visible `"Open in Unbox"` strings on findings or header.  
- **Empty ≠ fetch error** for photos — `readOnly` section throws on fetch failure (distinct “Photos unavailable”).  
- **Disposition truth:** exceptions outrank lifecycle.done — never claim settled / “Work complete” while exceptions hold. Linked PO suppresses Unmatched / “No matched PO” even if `pairing_state` is still `UNFOUND`.  
- **Full width** — never `STATION_WORKBENCH_*` / station max-width caps.

## Mount

- Route: `src/app/carton/[id]/page.tsx` → `CartonInspector` (thin re-export).  
- Assembly: `src/components/receiving/inspector/inspection/CartonInspectionPage.tsx`.  
- Model: `carton-inspector-model.ts` (pure — no imports, no fetch).

## Never

- Import Unbox editors / `ReceivingDetailsStack` / station workbench shells.  
- Invent a second photo UI beside the gallery SoT.  
- Repeat Unbox marketing CTAs on every finding card.  
- Collapsed audit footer competing with findings for the lead job.
