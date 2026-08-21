# Carton read surface (`/carton/[id]`)

Recipe for the durable **read** record of a carton — observe-first with a work **escape**, not Station Workbench and not a Monitor KPI rollup.

**SoT rows:** `source-of-truth.md` → Photo gallery viewer · Carton read surface.  
**Sharing boundary (reversed 2026-08-20):** `pattern-evolution.md` Always #5 now says a read surface composes the SAME station assembly in a declared `preview` stance — see `OrderStationPane` (`src/components/station/order/`), which `/search?sel=order:` mounts. D6's ban on Unbox layout panels / `CartonContextCard` is retired. **This surface has not been ported yet** — it still runs the parallel read layout described below. Treat that as the open follow-up, not as a standing exemption.

## Anatomy

```
┌─ DispositionBar ──────────────────────────────────────────────┐
│ ● Disposition · Carton {id} · chips  [Photos·N] [Copy·History·Unbox] │
└───────────────────────────────────────────────────────────────┘
┌─ PHOTOS (in-flow band, ?photos=1) ────────────────────────────┐
│ Exact photo | Investigative · All|Box|Item (+Claim) · tiles   │
└───────────────────────────────────────────────────────────────┘
┌ Col 1 — CONTENTS · RECORD (2fr) ─┬─ Col 2 — TIMELINE (1fr) ────┐
│ WHAT IS IN THE BOX               │ PROGRESS  — ReceivingCartonPipeline │
│ CONTENTS · RECORD                │ FINDINGS  — exceptions (when present) │
│ lines · sparse facts / notes     │ ACTIVITY  — latest · expand · maximize │
│ (hairline sections, one plane)   │ HISTORY   — unit journeys + thumbs  │
└──────────────────────────────────┴─────────────────────────────────────┘
```

- **≥xl:** two columns split by QUESTION, not by weight — col 1 is the box's
  contents and its record; col 2 is its timeline. **ACTIVITY belongs to col 2**
  (moved 2026-08-02): it is an event stream and reads with the other two
  (pipeline milestones, unit journeys), not under a line list it does not
  describe. **Activity is a disclosure** (ruled 2026-08-03): the collapsed
  surface always shows the **most recent event** (`events[0]`, newest-first
  timeline); the chevron expands the full in-column list; a Maximize control
  opens the same stream in a page Dialog. Progress stays the lead answer.
- **The tracks are `2fr | 1fr`** (`xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`,
  ruled 2026-08-03). Col 1 needs the wider track so long line titles wrap
  honestly inside CONTENTS; col 2 stays a readable progress / activity /
  history column at one-third of the row. Supersedes the 2026-08-02
  `22rem | 1fr` rail (that starved titles and made the record card feel
  cramped). Equal `xl:grid-cols-2` is still rejected — the split is intentional
  asymmetry the other way.
  - **Rejected: stack below a line-count threshold** — a layout that changes
    shape on a data threshold teaches two surfaces for one job and cannot be
    guarded.
- **Mobile / <xl:** stack col1 then col2 — the 2fr track must not survive the
  breakpoint (both columns go full width).
- **Guard:** `tests/e2e/carton-column-balance.spec.ts` pins the asymmetry
  structurally (contents track ≈ 2× the timeline, within a loose floor) and
  logs the extents; the columns carry `data-testid="carton-contents-column"` /
  `"carton-timeline-column"` for the probe.
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
- **Contents rows compose `ReceivingLineContentsRow`** (Zoho product thumb ·
  title pinned top · details pinned bottom · left-aligned). Title precedence via
  `receivingLineContentsTitle`. Thumbs open the shared `PhotoViewerPortal`.
  Titles **wrap** on carton-read (`titleMode="wrap"`); Unbox work rows also wrap
  (nested-grid `PoLineRow` title band). Qty uses `ProgressBadge` in the meta slot
  on carton-read; Unbox keeps the panel-header rollup. Shared chips via the SoT
  row (`ProgressBadge` · `SkuScanRefChip` · `ConditionGradeChip` · `SerialChip`).
  **Never `PoLineRow` / `PoLineMetaGrid`** — that is the Unbox accordion's
  boxed nested-grid work surface (thumb · wrap title · qty|SKU|cond|serials|price).
- **FINDINGS sits under Progress and ABOVE Activity / History** (hoisted above
  History 2026-08-02; moved above the Activity disclosure 2026-08-03). Disposition
  truth already says exceptions outrank `lifecycle.done`; the same logic says an
  unresolved finding must not hide behind a collapsed event stream. Progress
  still leads — WHERE before WHAT IS WRONG — then Findings, then Activity
  (disclosure), then History (unbounded journeys).
- **DispositionBar utilities:** Photos is the primary look CTA (`secondary` /
  `primary` when open). Copy · History · Unbox are **ghost** labeled buttons —
  visible, not competing with Photos. Zero `"Open in Unbox"` marketing strings.
- **Source listing** (when present) is a quiet tertiary micro-link under Record
  (`Source listing`), not an accent marketing CTA.
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
  **One caption size** for title · timestamp · meta (never mix
  `text-role-eyebrow` under a caption title). Workflow notes titled
  `Stage Matched → Unboxed` display as **`Matched → Unboxed`**
  (`cartonEventTitle`) and suppress the redundant `NOTE` + machine trail
  (`cartonEventSignature`).
- **Progress:** shared `ReceivingCartonPipeline` (Scanned → Unboxed → Received + `PipelineStageRow` details) — never a hand-rolled HANDLING provenance strip.  
- **One plane, sectioned by hairlines** (ruled 2026-08-05, superseding *"section cards … sit on `bg-surface-card` / `Panel` — not bare canvas"*). The read body is a single `bg-surface-card` sheet under the sunken identity band; contents · record · POs · note · progress · findings · activity · history are `<section>` children separated by `divide-y divide-border-hairline`, each on `inset-card`. The two tracks are **flush** — `gap-0` with the seam carried by `border-t` (stacked) / `xl:border-l` (side by side).
  - **The old rule was right about its enemy and wrong about its fix.** It was written to stop sections falling onto bare canvas with nothing holding them; it bought that with six `Panel radius="xl"` islands on a `surface-canvas` ground, which is canvas → card → sunken, three surfaces deep, to show one carton's facts. That is the nested-box read the house flush-planes ruling bans ([`../source-of-truth.md`](../source-of-truth.md) → Depth elevation): **depth is the surface STEP, not a gutter.** Here the step is sunken identity band → card body, and it is the only one.
  - **A hairline is not "bare canvas."** Structure comes from the rule plus the `text-role-eyebrow` section label; every section keeps its label precisely because the card shell is no longer there to imply one. Sections that had none (Record, Purchase orders, Note) gained one in the same change.
  - **`divide-y`, never a per-section `border-b`.** The tracks are unequal in length, so a trailing bottom rule on the last section of the short column draws an unfinished hairline into open plane.
  - **Rows inside a section are rows** (`divide-y divide-border-hairline`), never a stack of bordered cards — that is nested-cards-as-rows ([`../ui-design-system.md`](../ui-design-system.md)). The contents cards also carried `overflow-hidden` to clip their own radius, which sheared the focus ring off the thumb button inside them; flattening removed the need for both.
  - **Findings keep their tone**, because a tone is state. They wear it as a flush tinted band with a `border-l-2` accent — an edge accent is a border on the element itself, never `rounded-*-[inherit]` on a child.
  - The invariant: *the read body is one continuous plane, not a stack of cards*. Do not check this with a `Panel` substring match — `stationIdentityPanelClass` contains the word, so such a check can never fail.  
- **Work escape:** one labeled **Unbox** ghost `Button` using `openInUnboxHref`. Zero visible `"Open in Unbox"` strings on findings or header.  
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
