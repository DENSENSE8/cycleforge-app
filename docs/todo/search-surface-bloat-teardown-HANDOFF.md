# `/search` surface — bloat teardown

> **Directive (operator, 2026-08-22):** the `/search` detail surfaces are
> bloated. Cut them down. The order pipeline was already done in this pass and
> is the WORKED EXAMPLE — read it first, then apply the same three cuts
> everywhere else on the surface.

---

## 0. The worked example — read this before touching anything

`src/components/shipped/details-panel/OrderPipelineSection.tsx` went from a
stepper bar **plus** a duplicated attributed-row list **plus** a carrier badge,
down to one instrument. Three cuts, in order of value:

| Cut | What it was | What it is |
|---|---|---|
| **Say it once** | The bar printed `Tested · Packed · Scanned Out`, then a row list printed the same three names again underneath | Attribution moved INTO the stage block. Stage names appear once. |
| **Name the state, not the column** | `Pending pack` — a null database column | `Ready to pack` — the queue the order is in, named as the operator navigates to it |
| **Evict the tourist** | A carrier status pill sitting inside a milestone instrument | Gone. It is a different display language and belongs to its own port. |

Result: **~215 lines → ~200**, but the rendered block went **217px → 107px**
carrying strictly *more* information (staff photos, stamp provenance). Height is
the metric that matters here, not line count. The centre is a fixed-height
column shared with a conversation; every pixel a reference block takes is a
pixel the thread does not get.

---

## 1. The confirmed offender (start here)

**`src/components/station/receiving/ReceivingCartonPipeline.tsx`** (108 lines)
and **`ArrivalCartonPipeline.tsx`** (127 lines) still have the *exact*
duplication that was just removed from the order pipeline. Verified: both
render `LinearWorkflowStepper` and then 4–5 `PipelineStageRow`s repeating the
same stage names.

The operator's screenshot of the carton inspector shows it plainly:

```
PROGRESS
  ●────────────●────────────●
  SCANNED   UNBOXED    RECEIVED     ← names, pass 1
  SCANNED   Kai   08/21/2026 2:19 PM  ← names, pass 2
  UNBOXED   Kai   08/21/2026 2:19 PM
  RECEIVED  Kai   08/21/2026 2:21 PM
```

Six lines to say what three can, and "Kai" three times.

**Do:** port both to the order pipeline's shape — `marker: null`, a `body` per
stage carrying `[photo] name / stage+glyph / when`, and `connectorPadClass` to
thread the rail through the stage line. The stepper already takes all three
props; no new API needed. Reuse `StageBody` if it generalises — if it does,
promote it next to `LinearWorkflowStepper` rather than copying it.

**Watch:** `ReceivingCartonPipeline` has real logic the order pipeline does not
— the `unboxFolded` / `unboxCoStamped` case where a carton is received in one
motion and "Unboxed" is credited to the receive with an "At receive" tag. That
provenance is exactly the `via` line in the new shape (`At receive` is a
`via` value). **Do not lose it**; it is the same class of fact as `Station scan`.

---

## 2. Where the rest of the weight is

Sizes are real (`wc -l`, 2026-08-22). None of these are audited yet — measure
before cutting.

| File | Lines | First thing to check |
|---|---|---|
| `receiving/inspector/inspection/CartonInspectionPage.tsx` | **1098** | The `receiving:` branch of `/search`. By far the largest thing the surface mounts. Is it one page doing five jobs? |
| `search/SearchResultRow.tsx` | 757 | One row component. Suspicious for a row. |
| `search/GlobalFindCombobox.tsx` | 664 | |
| `search/station/SearchOrderStationPane.tsx` | 477 | Mostly Displays-leaf wiring; the leaves are already `dynamic()`. Check for leaves nothing reaches. |
| `search/SearchDetailWorkspace.tsx` | 351 | The `?sel=` router. Mounts `CartonInspector` at :288. |
| `search/station/SearchUnitStationPane.tsx` | 297 | Never got the order pane's treatment. Likely carries the same patterns the order pane just shed. |

**`SearchUnitCentre` is the sibling that did NOT get this pass.** The order
centre now runs Status → Items → thread with the shared item face and the
rebuilt pipeline. The unit centre still hand-rolls its own facts. Bring it into
line — same blocks, same components, or a documented reason it differs.

---

## 3. The rule to apply

For every block on the surface, ask in this order:

1. **Is this fact printed twice on this screen?** Delete one. (The order
   pipeline printed stage names twice; the search centre once mounted
   `OrderCommercialFacts` in the centre *and* on the `status` leaf.)
2. **Is this the surface's job?** `/search` is a FIND surface. It confirms you
   landed on the right record. Item-number and marketplace-SKU reference blocks
   were removed from it on 2026-08-22 for exactly this reason — they stayed on
   the shipped panel, which acts on the record. Reference belongs on the edge
   (`Displays` leaves), not the centre.
3. **Does this block mount a WRITE on a read surface?** The centre is
   `stance="preview"`. `FnskuCatalogInfoPanel` is mounted with
   `allowEdit={false}`; anything else that can mutate should not be there at all.
4. **What does it cost in PIXELS at 720px viewport height?** Measure with the
   block open on a real record. The thread and its composer must stay above the
   fold. Current baseline on `?sel=order:6154`: Status 107px, Items at y=187,
   composer at y=651.

---

## 4. Constraints

- **No layout animations** (AGENTS.md, 2026-08-22). Collapse is instant, rows do
  not spring. If you find framer `layout` / `layoutScroll` / height tweens on
  this surface, that is bloat too — remove it.
- **Do not re-add guards.** `po-lines-accordion-meta-order.test.ts` was deleted
  this pass — a regex over `PoLineRow.tsx` asserting chip order. Invariants get
  pinned as a mounted DOM test or a TS type (the five-track ledger is now
  guaranteed by `ItemRecordMetaGrid`'s prop signature), never source-text regex.
- **`tests/e2e/search-station-layout.spec.ts` is the contract.** It asserts the
  centre order (context → Status → Items → thread), the shared collapse, and
  that Items + composer fit on first paint. That last one is a live tripwire for
  this work: if a block you add pushes them below the fold it goes red, and the
  fix is the block, not the assertion.
- Verify with `npm run verify`. Measure in the browser at 1280x720 before and
  after; report both heights.

---

## 5. Out of scope

- The rail (`docs/todo/search-recent-rail-teardown-HANDOFF.md` owns it).
- The entry band (`docs/todo/entry-band-sot-consolidation-HANDOFF.md` owns it).
- Retrieval, ranking, and the `?q=` results list. This is the `?sel=` detail
  surface only.
