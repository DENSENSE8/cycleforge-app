# Plan — carton-read media/timeline patterns, swept codebase-wide

**Trigger:** an external UX review of `/carton/[id]`'s Photos + History surfaces (gallery click-scope,
`+N` overflow tiles, timeline density on multi-unit cartons, non-serial empty states, duplicate photo
surfaces). This doc extends that review into a codebase-wide sweep for the same defect classes, and
turns the results into a prioritized, file-level plan.

**Status:** PLAN — nothing in here has been implemented yet. Tier 1 is ready to build as soon as
someone signs off; Tier 3 needs one grep-confirmation first; Tier 4 needs its own scoping pass before
implementation.

**Read first:** [`carton-read-timeline-honesty-HANDOFF.md`](./carton-read-timeline-honesty-HANDOFF.md)
(dated **today**, 2026-08-02 — §3.4 and §4 already rule on the gallery-scope question this plan
touches) · `.claude/rules/display/carton-read.md` · `.claude/rules/display/reference-timeline.md` ·
`.claude/rules/pattern-evolution.md`.

---

## 0. The one thing this plan does NOT do, and why

The original review's top two findings were: (1) clicking a stage-scoped journey thumb (e.g. "Arrival
· package") opens the *whole carton's* photo set in the lightbox instead of just that stage's photos,
and (2) the `+N` overflow count reads like it describes the stage but doesn't match what actually
opens.

**Finding (1) is not a bug — it is a settled, same-day ruling.** `CartonUnitJourneyHistory.tsx`
(lines 4–8, 34–40, 71–76) deliberately passes `galleryPhotos`/`galleryMatchIds` — the carton's full
`useReceivingPhotos` set — down through `StationUnitJourneys` → `TimelineSection` → `EventTimeline`'s
`TimelineMediaStrip`, which uses the override when present (`EventTimeline.tsx:83`,
`photos = galleryPhotos && galleryPhotos.length > 0 ? galleryPhotos : stagePhotos`).
`carton-read-timeline-honesty-HANDOFF.md` §3.4 rules on exactly this and rejects reverting it:
*"deleting that override silently narrows the lightbox and the strip still looks right"* — i.e. a
regression the author had already shipped once and does not want back. §4's settled table repeats it.
`carton-read.md` (lines 97–102, "Journey thumbs are event context, and they stay") carries the same
ruling. **This plan does not propose changing gallery scope. Do not reopen it without new evidence.**

**Finding (2) survives, narrowed.** The count *is* wrong regardless of which scope wins: `overflowCount`
(`EventTimeline.tsx:103`, `timelineMediaStripPreview(media.length, thumbLimit)`) is computed from the
*stage's own* photo count, but the button it labels opens `photos` — the carton-wide override, when
present. The aria-label ("View {overflowCount} more photos") describes a number that isn't what the
click reveals. This is the exact "a layer printed an answer with a straight face" defect class the
honesty handoff already fixed four other instances of on this same page (§0 of that doc) — it's a
fifth instance they missed, not a re-litigation of §3.4. Tier 1 below fixes it without touching scope.

---

## 1. Tier 1 — do now (single-file, zero blast radius)

### 1A. Honest `+N` overflow tile + affordance parity

**File:** `src/components/ui/EventTimeline.tsx`, `TimelineMediaStrip` (lines 67–163, overflow button at
148–158).

- **Count honesty.** When `galleryPhotos` is present and represents a larger set than the stage's own
  `media`, the tile must stop claiming a stage-scoped count for a carton-scoped action. Recommended
  shape (keeps the scope ruling untouched, adds the explicit escalation the review asked for): keep the
  stage-honest `+N` for the stage's own hidden photos, and label the button itself so it reads as an
  escalation when it opens more than the stage — e.g. `aria-label` becomes `"View {overflowCount} more
  {stage} photos, or all {photos.length} carton photos"` / a two-line visual (`+N` glyph, `"view all"`
  sublabel) when `photos.length > media.length`. Do **not** just inflate `overflowCount` to
  `photos.length` — that would make a 1-photo stage with a 40-photo carton show `+40`, which is its own
  dishonesty in the other direction.
- **Focus ring.** The button is a raw `ds-raw-button` with a hand-rolled `ring-1 ring-inset
  ring-border-hairline` and no `:focus-visible` treatment. Compose `focusRing('control', 'accent')`
  per `.claude/rules/source-of-truth.md` → Focus affordance, same as every other interactive control.
- **Tooltip.** `aria-label` only reaches screen readers; there's no `HoverTooltip` for a sighted mouse
  user, so hovering the tile shows nothing. Wrap in `HoverTooltip` with the same specific copy as the
  (corrected) aria-label — not a generic "more photos".
- **Effort:** ~1–2 hrs. **Guard:** extend `EventTimeline.rail.guard.test.ts`; do not weaken it.

### 1B. Non-serial carton fallback in `StationUnitJourneys`

**Files:** `src/components/station/workbench/StationUnitJourneys.tsx` (empty state, lines 95–100) ·
`src/components/receiving/inspector/inspection/CartonUnitJourneyHistory.tsx` (short-circuits at lines
63–69, *before* `StationUnitJourneys` even mounts) · `src/components/station/receiving/
ReceivingSerialJourneys.tsx` (Workbench receiving pane, inherits the same shared empty copy).

- **Problem.** `"No serialized units yet."` / `"No serialized units on this receiving yet."` is a dead
  end on a qty-only carton, even though carton-level activity already exists and is already fetched:
  `CartonInspectionPage.tsx` has its own `events` (built via `cartonEventSignature`, imported line 85),
  rendered in a *separate* ACTIVITY section (line 632, `{events.length > 0 ? … : null}`) — which
  *also* silently disappears when empty, so a carton with zero units and zero events shows nothing
  useful anywhere on the page. `CartonUnitJourneyHistory` already holds `photos` in scope (from
  `useReceivingPhotos`, line 32) at the exact point it hits the zero-serials branch.
- **Fix.** Thread the carton's own event feed (reuse `cartonEventSignature` / the same adapter path
  `inventoryEventsToTimeline` already uses on this page — no new adapter) as an optional prop into
  `StationUnitJourneys`, and render it in the empty branch instead of the dead-end message. This is a
  data-routing fix, not a new component: the facts already exist on the page, they just don't reach
  the one place that currently says "nothing here."
- **Scope note.** This fixes the two consumers that share the exact literal string
  (`CartonUnitJourneyHistory` + `ReceivingSerialJourneys`, both rooted in `StationUnitJourneys`). FBA's
  `FbaShipmentTracePanel.tsx:172-174` (`"No serialized units linked to this FNSKU"`) is a separate,
  unrelated root component with its own empty state — same *smell*, different fix, not required here;
  note it as a follow-up if FBA trace is touched later.
- **Effort:** ~3–4 hrs incl. tests.

---

## 2. Tier 2 — grow the SoT: extract `OverflowTile` (2+ consumers, no primitive exists today)

The sweep found **eight** independent hand-rolled "+N" implementations and confirmed no shared
component exists (`AvatarStack` / `ChipOverflow` / `OverflowTile` are not defined anywhere in
`src/design-system/**` or `src/components/**`). The only related module,
`src/lib/timeline/timeline-media-strip.ts`, is pure count math with no visual/interaction contract.
Per `.claude/rules/pattern-evolution.md` ("Add a named registry block when 2+ surfaces need the same
new composition"), this clears the bar for a new DS primitive.

| Surface | File : line | Current shape | Gap vs. compliant bar |
|---|---|---|---|
| Carton page unit-journey photo strip | `EventTimeline.tsx:148-158` | `<button>` + `aria-label`, no scrim | Missing focus ring + `HoverTooltip` (fixed in 1A) |
| Receiving serial preview chips | `SerialPreviewStrip.tsx:98-102` | bare `<span>` text | Not focusable, no label |
| Photo library label chips | `PhotoLabelChips.tsx:40-44` | bare pill `<span>` | Not focusable, no label |
| Receiving bench unit rows | `ReceivingUnitRows.tsx:320-332` | DS `Button` ("+N more · manage units") | Compliant text-CTA variant — reference for the chip shape |
| Mobile carton ops serial chips | `CartonMobileOpsClient.tsx:368-386` | bare `<span>` text | Not focusable, no label |
| Shipped inventory-sync dialog | `InventoryFulfillmentSyncDialog.tsx:181` | inline text | Not focusable |
| Work-order calendar day cell | `WorkOrderCalendar.tsx:126-132` | bare text | Not even clickable to reveal the rest |
| Email triage result list | `EmailTriagePanel.tsx:614-618` | static `<li>` text | N/A — informational, not actionable |

**Plan:** extract `OverflowTile` into `src/design-system/components/` with two variants — an
image-scrim overlay (for photo/avatar strips) and a chip/pill (for tag/serial strips) — composing
`focusRing('control', 'accent')` and `HoverTooltip`, with a **required** `label` prop (no generic
"more" default, so every call site has to say what it's counting — the same discipline as
`ui-design-system.md`'s honest-absence rule).

- Migrate `EventTimeline.tsx`'s tile onto it as the first, reference consumer (folds into 1A).
- The remaining seven are **opportunistic follow-ups**, not a mass migration in this pass — several
  (calendar day cell, email triage list) are low-traffic and low-risk left as-is for now. Track them
  with a shrink-only guard allowlist (same pattern as `spacing-tokens.guard.test.ts` /
  `focus-ring-tokens.guard.test.ts`) so the next surface that reaches for a hand-rolled `+N` fails CI
  instead of adding a ninth fork.
- **Effort:** primitive + `EventTimeline` migration ≈ 1 day. Each further migration ≈ 1–2 hrs, done
  opportunistically when that surface is next touched.

---

## 3. Tier 3 — real bug: duplicate photo surfaces on Unit Detail (`?view=labels`)

**Files:** `src/components/labels/unit-detail/UnitDetailWorkspace.tsx` (lines 70, 76) ·
`src/components/labels/unit-detail/cards.tsx` (`TimelineCard` / `TimelineRow`, lines 212–321) ·
`src/components/labels/unit-detail/SerialUnitTimelineSection.tsx` (lines 11–16).

- **Finding.** `TimelineCard` (mounted line 70) renders its own inline `PhotoGallery` per event —
  cross-referencing `event.payload.photo_ids` against `data.photos` — at `cards.tsx:309-317, `**with
  delete enabled** (`onPhotoDeleted={onPhotoChanged}`). `SerialUnitTimelineSection` (mounted directly
  below, line 76) is a *second*, independent photo timeline for the **same unit**, fetched via its own
  `unitTimelinePhotosQuery(serialUnitId)` query. Its own docblock (`SerialUnitTimelineSection.tsx:15-16`)
  says: *"This is the pane that OWNS media here — journeys mounted beside it must pass
  `withPhotos={false}`."* That guard prop exists on a **different** component
  (`SerialJourneySection`) — `TimelineCard` has no such prop and unconditionally renders its inline
  galleries. Unlike carton-read (which has a dated, ruled IA explicitly justifying three photo
  surfaces answering different questions — `carton-read.md`), nothing documents why this page shows
  the same stage photos twice. This reads as an oversight the "owns media" contract was supposed to
  prevent, not a decision.
- **Fix options:**
  - **(a) Recommended.** Add a `withPhotos`-style prop to `TimelineCard`/`TimelineRow` so capture-event
    inline photo thumbnails suppress when `SerialUnitTimelineSection` is co-mounted on the same page.
    Smallest diff; keeps `TimelineCard`'s event log and keeps `SerialUnitTimelineSection`'s stronger
    stage-grouped photo view as the single owner of media, matching its own docblock's intent.
  - **(b)** Delete `SerialUnitTimelineSection` from this page, let `TimelineCard` own media. Loses the
    "five stage buckets" grouping in exchange for a smaller diff elsewhere; not recommended — it's a
    worse photo browsing experience for the thing that gets kept.
- **Before starting:** grep other `TimelineCard` consumers to confirm none of them relies on its
  inline photos being unconditional — if `UnitDetailWorkspace` is the only mount, option (a)'s new
  prop can default to the current (always-on) behavior everywhere else and just be flipped `false`
  here, which is the lowest-risk shape.
- **Effort:** ~2–3 hrs incl. the consumer check.

---

## 4. Tier 4 — filter/lens on multi-serial merged feeds (needs its own scoping pass)

**Files:** `src/components/station/workbench/StationUnitJourneys.tsx` (merge point, lines 70–85) ·
`merge-station-unit-journeys.ts` (sibling module) — feeding `CartonUnitJourneyHistory.tsx`,
`WorkspaceTimelineTab.tsx`'s Units tab (shared by Unbox / Testing / Shipping / Packing), and
`ReceivingSerialJourneys.tsx` (Workbench receiving pane) — **3+ independent consumers of one merge
point**.

- **Finding.** `mergeStationUnitJourneys` flattens every serial's journey into one flat feed with
  **zero lens** — no `groupMode`, no `IdentifierToggle`, no photos-only filter — unlike
  `OrderTimelineSection` (`src/components/shipped/OrderTimelineSection.tsx`), which already has both a
  lens toggle (`tag()` + `IdentifierToggle`, lines 89-94, 224-230) and a serial↔time `groupMode`
  toggle (lines 94, 232-238), built on the **existing, reusable** `IdentifierToggle` primitive
  (`src/components/ui/IdentifierToggle`) — this is not bespoke UI that would need inventing.
  `carton-read-timeline-honesty-HANDOFF.md` §3.3 independently measured, from the whole dogfood
  tenant, that multi-line cartons correlate with high event counts (5.1 lines → 39.8 events, ~8:1) —
  i.e. the records where a flat merged feed gets noisiest are exactly the ones a lens would help most.
- **Plan.** Port `OrderTimelineSection`'s per-item tagging pattern into `mergeStationUnitJourneys` (tag
  each merged event by its source serial), add an `IdentifierToggle` row ("All units · [serial 1] ·
  [serial 2] …") to `StationUnitJourneys`, gated to render **only when `list.length > 1`** — a
  single-serial carton has nothing to filter, matching the "chips only when they disambiguate" rule
  already live on this exact component (its own docblock, lines 17-20).
- **Why this is its own item, not bundled into this pass.** It's a genuine UX addition (a new control
  in an already-tight right-column History block, per `carton-read.md`'s deliberately narrow 22rem
  rail), it touches a component shared by 3+ Workbench surfaces at once, and the header space it needs
  hasn't been designed. Recommend spinning this out to its own `-HANDOFF.md` for scoping (control
  placement, whether it lives in `StationUnitJourneys`'s `headerRight` slot or needs a new row) before
  anyone writes code.
- **Effort:** ~1–2 days once scoped (component + tests across 3 consumers + guard updates).

---

## 5. Confirmed non-issues — no action

- **`ShippedDetailsPanelContent.tsx`'s two `PhotoGallery` mounts** ("SKU Integrity Photos" vs "Packing
  Photos") — different, clearly labeled data sources (SKU-level vs. order-level evidence). Not the
  Tier-3 pattern (no shared docblock claiming single ownership, no overlapping fetch). Skip.
- **`CartonPhotoTriage.tsx`'s uncapped photo grid** (no `+N` cap at all) — this is the carton page's
  primary album surface, and `carton-read.md` already rules the band **is** the album. An unbounded
  grid there is correct, not a gap. Skip.
- **Every other `EventTimeline`/`TimelineSection` consumer** swept (Operations History, Signals,
  Support context activity, Call log, Warranty claim, FBA shipment trace, Carrier tracking, Serial
  journey section) — each is either already appropriately filtered (URL/sidebar filters, or
  `OrderTimelineSection`'s own lens) or is legitimately single-source/single-identity and low-volume,
  where a lens control would be a dead affordance. No action.

---

## 6. Sequencing

1. **Tier 1 (1A + 1B)** — one PR. No design/product sign-off needed; respects the existing scope
   ruling; fixes the one real defect the review found plus the adjacent non-serial dead end.
2. **Tier 2** — primitive + `EventTimeline` migration, same or the next PR. Remaining 7 consumers are
   opportunistic, tracked by a shrink-only guard allowlist, not a blocking migration.
3. **Tier 3** — separate PR, after the `TimelineCard`-consumer grep confirms the safe default.
4. **Tier 4** — spin out to its own HANDOFF for scoping before implementation; flagged here because
   the supporting data (§3.3's 8:1 correlation) already justifies prioritizing it once scoped.

## 7. Verification

- `npm run verify` after each tier (per `.claude/rules/verify.md` — never raise a ratchet baseline to
  land any of this).
- Tier 1: extend `EventTimeline.rail.guard.test.ts`, re-run `carton-inspector.guard.test.ts` +
  `carton-inspector-model.test.ts` (both currently green, per the honesty handoff's hand-off state).
- Tier 2: new guard test for the `OverflowTile` primitive (shrink-only allowlist for un-migrated raw
  `+N` spans), mirroring `spacing-tokens.guard.test.ts` / `focus-ring-tokens.guard.test.ts`.
- Tier 1A / Tier 2: extend or add an E2E spec (sibling of
  `tests/e2e/carton-column-balance.spec.ts`) asserting the overflow tile's opened photo-set size
  matches what its label/tooltip claims — against the QA org per `verify.md`, not the dogfood tenant.
- Tier 3: confirm via the `TimelineCard`-consumer grep before writing code (see §3).
