# Plan 1 — Photo stage SoT + write enforcement (WS-PHOTO)

> **Status:** Planned · 2026-07-20  
> **Parent:** [`photo-evidence-chain-INDEX.md`](./photo-evidence-chain-INDEX.md)  
> **Lane:** Start on `main` for dogfood stamp fixes; grow SoT then move heavy validation to `topic/photo-evidence` if blast radius grows.

## Verdict

Freeze a **stage × entity matrix** in one module, enforce it at the **upload/attach waist**, and wire existing intent helpers so readers stop hardcoding strings. No new photo table. Prefer extending `photo_type` (+ optional capture metadata later) over a second discriminator until we prove triage-vs-unbox carton needs a column.

## Verified gaps

| Gap | Evidence |
|---|---|
| Intent helpers dead | `isPackagePhotoType` / `isItemPhotoType` unused outside `photo-intent.ts` |
| Desktop mis-stamp | `ReceivingPhotoButton.tsx`, `usePhotoGallery.ts` → `RECEIVING` + `receiving_item` |
| Filter collision | `listReceivingPhotos` item intent matches line **OR** type=`receiving_item` → mis-typed carton leaks |
| No unbox-carton type | Only `receiving_package` / `receiving_item` / legacy `receiving` |
| Upload API accepts any photoType | `POST /api/photos/upload` — no stage×entity check |

## What ships

### 1. Expand receiving photo-intent SoT

File: `src/lib/receiving/photo-intent.ts` (grow, don’t fork).

```ts
// Target constants
RECEIVING_PHOTO_PACKAGE        // triage arrival exterior
RECEIVING_PHOTO_UNBOX_CARTON   // NEW — opened box / void fill (still RECEIVING)
RECEIVING_PHOTO_ITEM           // per-line product
RECEIVING_PHOTO_LEGACY_PACKAGE // 'receiving' alias
```

Add:

- `ReceivingPhotoStage` union aligned to the index matrix.
- `assertReceivingPhotoWrite({ entityType, photoType, mode? })` — throws / returns typed error.
- `photoIntentFromStage` / `stageFromPhotoType` for list filters.
- Re-export from a thin `src/lib/photos/stages.ts` if unit/testing/packing stages should live beside receiving (compose, one import for journeys).

### 2. Enforce at write waist

Call assert from:

| Path | File |
|---|---|
| GCS upload | `src/lib/photos/service.ts` → `uploadPhoto` |
| Legacy NAS attach | `attachPhotoWithLegacyUrl` + `POST /api/receiving-photos` |
| Client already maps types | keep `PhotoUploadQueue` mapping; **server still validates** |

Matrix (reject 400 on mismatch):

| entityType | allowed photo_type |
|---|---|
| `RECEIVING` | `receiving_package`, `receiving_unbox_carton`, legacy `receiving` |
| `RECEIVING_LINE` | `receiving_item` only |
| `SERIAL_UNIT` | `testing_photo`, `packer_photo`, `prepack` (existing) |
| `PACKER_LOG` | `packer_photo`, `box_label` (existing) |

Do **not** invent SKU-primary writes for inbound insurance.

### 3. Tighten list filters

`src/lib/photos/queries/receiving-list.ts`:

- `photoIntent=package` → entity `RECEIVING` **and** package types (exclude mis-typed item-on-carton).
- `photoIntent=item` → entity `RECEIVING_LINE` only (drop “OR type=receiving_item” escape that pulls carton junk).
- Add `photoIntent=unbox_carton` (or stage query param) for the new type.
- Import constants from SoT — stop string literals.

### 4. One-shot data hygiene (optional same PR or follow-up)

SQL/script: photos linked only to `RECEIVING` with `photo_type='receiving_item'` → retype to `receiving_package` **or** `receiving_unbox_carton` after operator review. Document in migration comment; prefer a reviewed backfill over silent rewrite of claim evidence.

### 5. Unit tests (DB-free)

- `photo-intent.test.ts` — matrix table (valid/invalid pairs).
- `receiving-list` filter SQL assertions (already has count tests — extend).
- Service Deps-injected reject paths if pattern exists; else route-level tests with mocked service.

## Explicitly NOT in this plan

| Cut | Why |
|---|---|
| UI mode split | Plan 2 |
| Library folders | Plan 3 |
| Journey media | Plan 4 |
| photoPolicy gates | Plan 5 |
| New `photos.capture_mode` column | Ask first after package vs unbox_carton types prove insufficient |
| Dual-link every item photo to catalog SKU | Insurance stays on line; SKU secondary is Plan 3/5 optional |

## Done when

- [ ] Invalid entity×type uploads return 400 from `/api/photos/upload` and receiving attach.
- [ ] Desktop empty-upload + gallery default use `receiving_package` (or unbox_carton) for carton scope.
- [ ] Intent helpers imported by list query + at least one UI consumer path.
- [ ] Unit tests cover matrix; `npm run verify` green.

## Key files

- `src/lib/receiving/photo-intent.ts`
- `src/lib/photos/service.ts`, `types.ts`, `upload-client.ts`
- `src/app/api/photos/upload/route.ts`
- `src/app/api/receiving-photos/route.ts`
- `src/lib/photos/queries/receiving-list.ts`
- `src/components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx`
- `src/components/shipped/photo-gallery/usePhotoGallery.ts`
- `src/components/mobile/receiving/PhotoUploadQueue.ts`
