# Arrival — update a PRODUCT's location, and be told where to put it

**Status:** NOT STARTED. This is a scoped brief, not a report.
**Surface:** `/triage` (Arrival) + the shared Locations Displays leaf.
**Written:** 2026-08-20, after the scan-station display port (see *Where this came from*).

Paste the prompt at the bottom into a fresh session. Everything above it is the
context that prompt assumes.

---

## The ask, in the operator's words

> "I must be able to update the location of the products from the arrival page
> and it should tell me exactly where to put the items in the location display
> component itself."

Two requirements, and they are **not** the same problem:

| # | Requirement | Today |
|---|---|---|
| **A** | Update the location of the **products** from Arrival | Arrival can place the **CARTON**, not its products. Different table, different grain. |
| **B** | The Locations display tells the operator **exactly where to put it** | The leaf is a *searchable catalog you choose from*. It never directs. |

**Read A carefully before writing code.** The word is *products*, and Arrival's
existing writer is carton-grain. Getting this wrong writes the right value into
the wrong table, which is the single most expensive mistake available here.

---

## Grain — the thing to get right first

Receiving carries **two** independent location facts. They are not a hierarchy
and one does not fall back to the other:

| Fact | Table / column | Grain | Written by | Means |
|---|---|---|---|---|
| Door staging | `receiving_triage.staging_location_id` (+ `priority_lane`) | **CARTON** | Arrival: `useTriageStaging.selectShelf` → PATCH `/api/receiving/[id]` | "the unopened box is on this shelf" |
| Putaway | `receiving_line_putaway.staged_location_id` (+ `staged_at`) | **LINE / product** | Unbox: `UnboxNotesLocationControl` → POST `/api/receiving/lines/[id]/stage` | "this item goes to this bin" |

Existing law, unchanged: `source-of-truth.md` → *Note vs label grain* is the
same split one column over — carton facts on `receiving`, line facts on
`receiving_line*`. The `stage` route's own docblock says it outright:
*"Distinct from Arrival `receiving_triage.staging_location_id` (door carton
shelf)."*

There is also `POST /api/receiving/lines/[id]/move` — bin→bin **after** putaway,
which captures the prior bin so the timeline shows from→to. It is the right
route for a correction, not for a first assignment.

### The question this raises, which the operator must answer

Arrival is the **door pass, before anyone opens the box**. So:

- If the products are already known (a matched PO with lines), assigning each
  line a putaway bin at the door is coherent — the operator can see what is on
  the PO without opening it.
- If the carton is unfound / unmatched, there are no product lines to place.

**Recommendation to put to the operator:** implement A as *line putaway from
Arrival*, reusing `/api/receiving/lines/[id]/stage`, and show it only for
cartons that have lines. Do **not** invent a third column, and do **not** widen
the carton's `staging_location_id` to mean "and also the products" — that is how
a metric that reads one column starts silently answering a different question.

---

## What exists today (verified, not assumed)

### The Locations leaf is already shared and already writes

`StationLocationsDisplay` (`src/components/station/location/`) is the ONE leaf.
Stations adapt to it through `StationLocationPlacementPort`:

```ts
interface StationLocationPlacementPort {
  locations; locationsLoading;
  placedLocationId: number | null;      // marks the current row, blocks a no-op move
  place: (locationId: number) => Promise<boolean>;  // returns whether it LANDED
  refreshCatalog: () => void;
  entityNoun: string;                   // 'carton' | 'order' — row subtitles + footer copy
  canPlaceMinted: boolean;              // false at Ready-to-Pack: a minted BIN is not a desk
}
```

Ports in the tree: `useTriageLocationPort` (Arrival → carton staging),
`UnboxLocationsLeaf`, `PackLocationsLeaf` (order → `order_pack_placements`).
**Adding product-grain placement means a new PORT, not a new leaf.**

So requirement A is mostly: *build a line-grain port and give the Arrival leaf a
way to know which line it is placing.* Which is the hard part — see below.

### The leaf does not direct anyone

Each row renders `[name] · [room · barcode · "carton is here"]` and a verb list
(place / print / mint). It answers *"which addresses exist?"* — never *"where
does THIS item go?"* There is no suggestion, no home bin, no capacity hint in
the placement decision.

Confirmed absent: no `home_location`, `default_location`, or
`suggested_location` anywhere in `src/lib` or `src/app/api`. **Requirement B has
no data source yet — inventing one is the bulk of the work.**

### The face that already exists for "put it HERE"

`PlacementSummary` (`src/components/receiving/PlacementSummary.tsx`) renders a
directed destination: eyebrow (`"Place carton here"`), name, room, zone, bin
address, barcode, bin type, capacity, optional lane. It was the face of the old
Arrival staging control and is currently used by `UnboxPlacementSection`.

`formatBinAddress` in that file was un-exported on 2026-08-20 when its only
external consumer went away. **Re-export it if the leaf needs it** — that is
growth, not a fork; the comment in the file says exactly this.

---

## Requirement B — where would "exactly where" come from?

Nothing in the repo answers this today. The next session must pick a source and
say so out loud. Candidates, cheapest first:

1. **Recent / last-used** — `/api/receiving/recent-staged-location` +
   `recent-staged-location.ts` already exist and already feed a "Last entry"
   verb. Cheap, real, and honest ("where you put the last one"). Weakest claim
   to *exactly*.
2. **Same-SKU history** — where did this SKU's previous units go? A read over
   `receiving_line_putaway` joined on SKU. No new column. Strong claim, and it
   degrades gracefully to (1) on a first-ever SKU.
3. **A declared home bin per SKU / category** — a real new column and a UI to
   maintain it. Strongest claim; most work; needs the expand→code→contract
   migration discipline in `backend-patterns.md`.

**Do not ship a suggestion whose basis the operator cannot see.** Whatever is
chosen, the row must say *why* ("last 3 went to A-01-02", "SKU home"), because a
directive with no reason is one wrong answer away from being ignored forever.

Design note: the leaf's job changes from *catalog* to *catalog + a directed
target at the top*. Compose `PlacementSummary` above the list for the target;
keep the searchable list underneath for the override. Do not replace the list —
the override path is what makes a wrong suggestion survivable.

---

## Where this came from (recent, load-bearing history)

The scan-station display port landed 2026-08-20 across four surfaces. What it
changed that this brief depends on:

- **Arrival's centre is items only.** The staging control (`ArrivalStagingDockControl`)
  was deleted; shelf + lane are **Displays-only** via `ArrivalLocationsLeaf`.
  Classify survives once, as the identity header's pills.
- **The floor is one note field** — `ArrivalCartonNotesEntry`, the carton-grain
  controller for the shared `WorkspaceNotesCard` (`noteGrain="carton"` →
  `receiving.support_notes`). The dock is Unbox's: raised composer, terminal on
  its trailing edge.
- **Arrival gained a Timeline leaf**; the composer's ⓘ targets it via
  `onOpenStatusHistory` instead of opening a dialog over the work.
- **Ready-to-Pack lost its centre desk picker; Pack gained a Locations leaf.**

The through-line the operator has been pushing all session: **a destination
never sits in the work surface — it lives on the right edge.** Requirement B
must respect that. The "where to put it" face belongs *in the Locations leaf*,
which is exactly what the ask says.

---

## Never-ship

1. **Do not relax `completeTriage`'s shelf + lane gate.** It refuses
   Save-for-unbox until `staging_location_id` AND `priority_lane` are set. It
   survived the control's deletion deliberately: `selectShelf` auto-routes the
   lane via `resolveTriageLane`, so ONE placement satisfies both. Adding
   product placement must not disturb that path.
2. **Do not write a product's bin into `receiving_triage.staging_location_id`,**
   and do not write a carton's shelf into `receiving_line_putaway`.
3. **Do not fork `StationLocationsDisplay`.** A new grain is a new PORT.
4. **Do not put the picker back in the Arrival centre.** It just left.
5. **Do not invent a suggestion the operator cannot audit** (see above).

## Watch this column

`staging_location_id` measured **zero human writes across 2474 cartons** in the
state where its only affordance was a dropdown. It is now Displays-only, i.e.
click-only, on Arrival — and the same is newly true of pack desks on
Ready-to-Pack, whose scan arm (`PackLocationControl`, still on disk but
unmounted) carried `unwrapScannedLocation` decoding.

**If these columns flatline, the answer is a scan affordance in the leaf — not a
bigger dropdown.** Re-homing that desk scan into `StationLocationsDisplay` would
fix both stations at once and is the single highest-value follow-up here.

---

## State of the tree (read before you commit anything)

- **`:3050` serves a DIFFERENT CLONE** — `/home/michaelgarisek/cycleforge-app`,
  not `/home/michaelgarisek/Projects/cycleforge-app`. Everything opened there
  renders pre-change code, including Playwright, whose `PW_BASE_URL` defaults to
  it. **None of the port has ever been seen in a browser.** An agent may not
  start a dev server (`workflow-safety.md`); the operator must re-point `:3050`.
- **Another session is editing the same tree.** `TestingPanel.tsx`,
  `ActiveOrderWorkspace.tsx` and `PackOrderPanel.tsx` carry the port
  *interleaved* with their `StationDisplaysEdgeToggle` →
  `StationDisplaysUtilityRail` migration and are **uncommitted for that reason**
  — a pathspec cannot split a file. Same for `TriagePanel.tsx` /
  `LineEditPanel.tsx` (the ⓘ wiring). **Commit only files you exclusively
  touched.** Two commits were made over-broad this session and had to be
  `reset --soft`; do not repeat it.
- **`pnpm verify` is not green tree-wide** and mostly not because of this work:
  a sibling session has `*-grid-layout.ts` files mid-move (imports resolving to
  nothing) and knip findings swung 2 → 159 across consecutive runs. **Check your
  files, then say which reds are yours.**
- Known finding that IS ours: `PackLocationControl.tsx` is unreferenced. It was
  kept on disk because another session has an uncommitted decode fix inside it
  and its scan arm is worth re-homing. Resolve it, don't just delete it.

---

## Paste for a new session

```
Read docs/todo/arrival-product-location-HANDOFF.md and implement it.

Two requirements, in order:

A. From /triage (Arrival), let the operator update the location of the PRODUCTS
   on the carton — not just the carton. Arrival's existing writer is carton
   grain (receiving_triage.staging_location_id); product putaway is line grain
   (receiving_line_putaway via POST /api/receiving/lines/[id]/stage). Reuse that
   route. Do NOT widen the carton column to cover products, and do NOT fork
   StationLocationsDisplay — a new grain is a new StationLocationPlacementPort.
   Show it only for cartons that actually have lines.

B. Make the Locations display tell the operator exactly where to put the item,
   inside the leaf itself. There is no suggestion source in the repo today —
   pick one, state it, and make the basis visible in the UI ("last 3 went to
   A-01-02"). Compose PlacementSummary for the directed target ABOVE the
   searchable list; keep the list as the override path. Re-export
   formatBinAddress from PlacementSummary.tsx if you need it.

Do NOT relax completeTriage's shelf+lane gate. Do NOT put any picker back in the
Arrival centre. Stay on the checkout's branch; the user manages commits; commit
ONLY files you exclusively touched — TriagePanel, LineEditPanel, TestingPanel,
ActiveOrderWorkspace and PackOrderPanel all carry another session's in-flight
work right now.

Verify against the operator's dev server — but first confirm :3050 is serving
THIS checkout, not /home/michaelgarisek/cycleforge-app. Never start or restart
it; if it points at the other clone, say so and stop trying to verify visually.
```
