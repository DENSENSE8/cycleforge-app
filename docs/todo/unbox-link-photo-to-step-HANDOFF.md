# Handoff — Link a photo to a specific Unbox procedure step

**For:** implementing agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Status:** GAP — Arrival Link empty-states while carton chrome shows N photos
**Lane:** stay on the checkout's branch · attach to **`:3050`** · never
start/restart/kill the dev server · **user owns commits**.
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS; USAV is dogfood only.

Related shipped work (same session): `PhotoStepDockStrip` —
Link | Upload | Send to phone on every photo step; Send to phone = Camera +
`STATION_CONTEXT_PHOTO_TONE`. Do not reopen that geometry unless broken.

---

## Paste for a new session

```
Read docs/todo/unbox-link-photo-to-step-HANDOFF.md.

Fix Unbox "Link a photo" so an operator can attach an EXISTING carton photo to
the active procedure step. Bug: Arrival photos Link popover says
"No door photos on this carton yet" while carton chrome Photos shows 7.

Root cause (confirmed in code):
- CartonPhotoPairPanel lists ONLY the step's stage via photoIntentFromStage.
- Arrival dock passes stage: 'arrival_package' → photoIntent 'package'.
- Chrome Photos count uses list intent 'carton' (whole carton evidence).
- Those 7 shots are almost certainly unbox_carton (or mixed) — package filter
  returns []. Empty state is honest for the filter, dishonest for the operator.

Concrete method to implement (locked — do not invent a tick checklist):

  Link = name existing evidence for THIS step. Never invent a photo.

  A) Within-stage aspect pair (already works for bench steps)
     PATCH /api/photos/[id]/aspect  { aspect: <stepAspect | null> }
     List: photoIntentFromStage(step.photoStage)  // unbox_carton for
           shipping_label_photo / box_photo / packing_material
     File: CartonPhotoPairPanel + CartonPhotoDockControl

  B) Cross-stage claim for arrival_check (MISSING — this is the work)
     Operator must pick from carton evidence that is NOT yet door-stamped,
     then one audited write that:
       1. Remaps photo_type → receiving package type for arrival_package
          (same RECEIVING entity — NOT /reassign entity hop)
       2. Sets photo_aspect to a legal door aspect
          (ASPECTS_BY_STAGE.arrival_package = shipping_label | box_exterior)
     Prefer one route (extend aspect or a thin claim-for-step route) over
     two round-trips. Today /api/photos/[id]/reassign only moves entity
     (carton↔line) and remaps type on that hop — same-carton stage claim
     has no SoT writer yet. Grow photo-intent / photos SoT; do not fork.

Empty-state copy (Arrival Link popover):
  - package count === 0 && carton count > 0 →
      "N carton photos — pick one for door evidence"
    (never "No door photos… upload or send to phone" when carton>0)
  - both 0 → keep upload / send to phone cue

UI polish while here:
  - Pair panel header sentence case (not ARRIVAL PHOTOS all-caps)
  - Link strip glyph stays Images / Camera SoT — not Smartphone

Verify on :3050 with a carton that shows Photos ≥1 in chrome and 0 arrival:
  1. Arrival → Link → see the carton shots
  2. Pick "This one" / name aspect → arrival_check settles / count updates
  3. Bench Shipping label Link still only lists unbox_carton (no stage mix)

Guards: extend unbox-dock-one-shell / pair-panel guard — Arrival Link must
not empty-state when carton intent > 0. npm run verify before done.
```

---

## Why it looks empty (not a fetch bug)

| Surface | List intent | What operator sees |
|---|---|---|
| Carton chrome Photos pill | `carton` (all carton evidence) | **7** |
| Arrival Link popover | `package` (`arrival_package`) | **0** → empty copy |
| Bench step Link | `unbox_carton` | bench shots only |

Law in [`CartonPhotoPairPanel`](../../src/components/receiving/workspace/line-edit/steps/CartonPhotoPairPanel.tsx):
stage-scoped list; **moving BETWEEN stages is reassignment**, not aspect pair.
Aspect pair alone cannot promote a bench shot into door evidence.

Wiring today:
- [`ArrivalPhotosDockControl`](../../src/components/receiving/workspace/line-edit/steps/dock/ArrivalPhotosDockControl.tsx) → `stage="arrival_package"` + `aspect={null}`
- [`CartonPhotoDockControl`](../../src/components/receiving/workspace/line-edit/steps/dock/CartonPhotoDockControl.tsx) → `stage="unbox_carton"` + step aspect

---

## Concrete link methods (SoT)

### 1. Within-stage (bench photo steps) — keep

```
activeKey ∈ shipping_label_photo | box_photo | packing_material
  → list photoIntent: unbox_carton
  → PATCH /api/photos/:id/aspect { aspect: step.photoAspect }
```

Satisfies the step when aspect matches declaration. No type change.

### 2. Cross-stage claim (arrival_check) — build this

```
activeKey === arrival_check
  → list photoIntent: carton  (or unbox_carton ∪ package, package first)
  → operator picks photo + door aspect (shipping_label | box_exterior)
  → ONE audited write:
       photo_type → package type for arrival_package
       photo_aspect → chosen legal door aspect
  → refresh receiving-photos + procedure steps
```

**Do not** teach the operator that stages are interchangeable in the list UI —
label the action as claiming door evidence ("Use for arrival"), not as a free
aspect rename on a bench row.

If a same-carton `photo_type` remap API does not exist, add it beside
[`remapReceivingPhotoTypeOnMove`](../../src/lib/receiving/photo-intent.ts) /
[`PATCH /api/photos/[id]/aspect`](../../src/app/api/photos/[id]/aspect/route.ts)
with audit + realtime publish. Do **not** abuse entity reassign
([`/api/photos/[id]/reassign`](../../src/app/api/photos/[id]/reassign/route.ts))
for same-carton stage claims.

### 3. Item photos Link (already different)

Opens media library (`buildUnboxingCartonLibraryHref`) — out of scope unless
touching item Link; do not force CartonPhotoPairPanel onto `unbox_item`.

---

## Acceptance

1. Carton with chrome Photos = 7, arrival package = 0: Arrival Link lists those
   photos (or a clear subset eligible for door claim), not the empty package copy.
2. After claim: `photoIntent=package` count ≥ 1; arrival step summary updates;
   receive-gate door evidence remains `arrival_package` only.
3. Bench Link unchanged (still stage-scoped `unbox_carton`).
4. `npm run verify` green; no ratchet baseline raises.

---

## Files to touch (expected)

| Area | Path |
|---|---|
| Pair / claim UI | `src/components/receiving/workspace/line-edit/steps/CartonPhotoPairPanel.tsx` |
| Arrival dock | `…/steps/dock/ArrivalPhotosDockControl.tsx` |
| Stage claim writer | `src/lib/receiving/photo-intent.ts` + photos API (aspect or new claim) |
| Guards | pair / dock / photo-stage guards under `line-edit/` + `lib/receiving/` |
| Empty copy | pair panel empty states |

---

## Out of scope

- PhotoStepDockStrip geometry / Enter wedge (already shipped)
- Inventing photos with a checklist tick
- Mixing illegal aspects onto `arrival_package` (interior / packing_material / item)
