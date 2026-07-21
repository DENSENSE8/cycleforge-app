# Plan 4 — Journey + order timeline photo spine (WS-PHOTO)

> **Status:** Planned · 2026-07-20  
> **Parent:** [`photo-evidence-chain-INDEX.md`](./photo-evidence-chain-INDEX.md)  
> **Depends on:** Plan 1 (stage taxonomy); Plan 2 for real stage-separated captures  
> **Related:** [`journey-hop-emitters-plan.md`](./journey-hop-emitters-plan.md) (event hops — orthogonal); [`search-journey-handoff-plan.md`](./search-journey-handoff-plan.md) (DONE handoff)

## Verdict

Unit photo timeline already has `media` on `TimelineItem`, but **serial journey and order timelines never attach photos**. Split `unbox` into arrival / unbox-carton / unbox-item, then compose the same adapter into journey + order surfaces so staff can compare “received like this” vs testing/packing frames.

## Verified gaps

| Surface | Photos today? |
|---|---|
| `listUnitTimelinePhotos` | Yes — 3 buckets; carton+line merged as `unbox` |
| `SerialUnitTimelineSection` / `UnitPackPhotoPeek` | Yes — unit photo API only |
| `SerialJourneySection` / `mergeJourney` / Operations Trace | **No** |
| `StationUnitJourneys` / `ReceivingSerialJourneys` | **No** |
| Order timeline API + `OrderTimelineSection` / Search tab | **No** |
| `EventTimeline` | Supports `media` — unused by journeys |

## What ships

### 1. Expand unit timeline photo query

File: `src/lib/photos/queries/unit-timeline-photos.ts`

Replace single `unbox` source with:

| source | Match |
|---|---|
| `arrival` | Parent carton `RECEIVING` + package types (`receiving_package`, legacy `receiving`) |
| `unbox_carton` | Parent carton + `receiving_unbox_carton` |
| `unbox_item` | Origin `RECEIVING_LINE` + `receiving_item` |
| `testing` | unchanged |
| `packing` | unchanged |

Update `unit-photos-events.ts` SOURCE_META / SOURCE_ORDER:

`arrival → unbox_carton → unbox_item → testing → packing`

Carry optional `sku` / `serial` on media payloads for chrome (from unit row — cheap).

Tests: extend `unit-photos-events.test.ts` + query tests with fixtures.

### 2. Shared journey photo merge helper

`src/lib/timeline/journey-photos.ts` (pure):

```ts
mergeJourneyWithUnitPhotos(events: TimelineItem[], photos: UnitTimelinePhotoRow[]): TimelineItem[]
```

Rules:

- Insert photo stage rows at stage timestamps (newest photo in bucket).
- Do not duplicate if `SerialUnitTimelineSection` already mounted beside journey on the same pane — **one mount owns media**.
- Degrade-not-fail: photo fetch error → events only.

### 3. Serial journey consumers

Pick **one** composition pattern and reuse:

**Preferred:** Journey section fetches `/api/serial-units/{id}/timeline-photos` when `serialUnitId` known; merge via helper into `EventTimeline`.

Surfaces:

- `SerialJourneySection.tsx` (add optional `serialUnitId` or resolve from serial string)
- `StationUnitJourneys.tsx` / `merge-station-unit-journeys.ts` — station density: collapse per-stage thumbs, not full gallery
- `ReceivingSerialJourneys.tsx` — same
- `ByUnitView.tsx` — inventory unit detail

Avoid N+1: batch timeline-photos by unit ids where station shows many serials (new batch endpoint only if profiling says so — start with per-section fetch + React Query).

### 4. Order timeline

`src/app/api/orders/[id]/timeline/route.ts` + `OrderTimelineSection.tsx`:

- When order has allocated / shipped serials, attach per-serial photo stage summaries **or** a single “Inbound / test / pack photos” band with grouped media by serial.
- Search tab (`SearchOrderTimelineTab`) inherits automatically if it mounts `OrderTimelineSection` + `SerialJourneySection`.

Density guard: default collapsed stage rows; expand for compare. Ask before making Operations History always photo-heavy for `dim=order` org-wide browse.

### 5. Dispute compare UX (thin)

On unit journey / testing panel: affordance “Compare arrival vs testing” opens existing lightbox with two stage filters — no new product. Reuse photo gallery viewer.

### 6. API comment / contract cleanup

Fix stale “two buckets” comments on timeline-photos routes; document stage enum in OpenAPI-ish JSDoc.

## Explicitly NOT in this plan

| Cut | Why |
|---|---|
| Emit PACKED/SHIPPED inventory events | `journey-hop-emitters-plan.md` |
| Library folders | Plan 3 |
| Capture stamps | Plans 1–2 |
| Always-on photos in Operations browse mode | Ask first (density) |

## Done when

- [ ] Unit timeline shows arrival vs unbox carton vs item separately.
- [ ] At least `SerialJourneySection` + one station consumer render stage media.
- [ ] Order timeline surfaces serial-grouped photo stages when units exist.
- [ ] Unit tests for adapter order; e2e smoke on unit detail photos; verify green.

## Key files

- `src/lib/photos/queries/unit-timeline-photos.ts`
- `src/lib/timeline/unit-photos-events.ts`
- `src/lib/timeline/types.ts` (media shape)
- `src/lib/operations/journey.ts` / `src/lib/timeline/journey.ts`
- `src/components/serial/SerialJourneySection.tsx`
- `src/components/station/workbench/StationUnitJourneys.tsx`
- `src/components/station/receiving/ReceivingSerialJourneys.tsx`
- `src/components/labels/unit-detail/SerialUnitTimelineSection.tsx`
- `src/app/api/orders/[id]/timeline/route.ts`
- `src/components/shipped/OrderTimelineSection.tsx`
- `src/components/ui/EventTimeline.tsx`
