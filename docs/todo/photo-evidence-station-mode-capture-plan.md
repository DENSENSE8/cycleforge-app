# Plan 2 — Station / mode capture surfaces (WS-PHOTO)

> **Status:** Planned · 2026-07-20  
> **Parent:** [`photo-evidence-chain-INDEX.md`](./photo-evidence-chain-INDEX.md)  
> **Depends on:** Plan 1 (stage SoT + write waist)  
> **Adjacent:** [`unbox-triage-mode-separation-handoff.md`](./unbox-triage-mode-separation-handoff.md) — share mode wrappers; do not reopen rail sort work here.

## Verdict

Make **Triage = package only**, **Unbox = carton open strip + per-line item camera**, and carry the same scope through **desktop peeks, phone Ably requests, and mobile routes**. Mobile item route is already correct; desktop and phone bridge are the hole.

## Verified gaps

| Surface | Today | Needed |
|---|---|---|
| `TriagePanel` peek | `photoIntent="all"` | `package` |
| `LineEditPanel` peek | `photoIntent="all"` | Split: carton `unbox_carton` + line `item` |
| `ReceivingPhotoButton` | Carton upload + phone request by `receivingId` only | Mode-aware stage; line id when active |
| `publishReceivingPhotoRequest` | `{ receiving_id }` | + `receiving_line_id?`, `stage` |
| `ReceivingPhotoRequestCamera` | Always `/m/r/{id}/photos` | Route by stage → carton vs item path |
| Mobile carton studio header | “Add unboxing photos” always | Stage label |
| Desktop line item upload | **None** | Active-line → `RECEIVING_LINE` |

## What ships

### 1. Shared scope hook (compose once)

`src/hooks/useReceivingPhotoScope.ts` (or `src/lib/receiving/photo-scope.ts` + thin hook):

```ts
{
  receivingId: number;
  receivingLineId?: number | null;
  stage: ReceivingPhotoStage;
  poRef?: string | null;
  sku?: string | null;
  serial?: string | null; // when known on the line
}
```

Maps → `{ entityType, entityId, photoType }` via Plan 1 SoT. Used by desktop button, mobile studio, gallery upload target.

### 2. Triage (Arrival)

- Peek: `photoIntent="package"` only.
- Capture / phone: stage `arrival_package` → entity `RECEIVING` + `receiving_package`.
- No item camera in triage (identify SKU without pretending item insurance yet — optional “identify then queue item photo for unbox” is out of scope unless product insists).

Files: `TriagePanel.tsx`, triage workspace wrappers, `ReceivingPhotoButton` when mode=triage.

### 3. Unbox — two chrome regions

**A. Carton strip (header / context card)**  
- Stage `unbox_carton` → `RECEIVING` + `receiving_unbox_carton`.  
- Peek filtered to that intent (not `all`).

**B. Active line (LineEdit / UnboxLineWorkspace)**  
- Stage `unbox_item` → `RECEIVING_LINE` + `receiving_item`.  
- Show **SKU · serial** pair beside gallery / camera chip.  
- Per-line photo count (not carton aggregate) on the row readiness if already surfaced.

Files: `LineEditPanel.tsx`, `ReceivingPhotoPeek.tsx` (support lineId + intent), `ReceivingPhotoButton.tsx`, `CartonContextCard.tsx`, `useUnboxLineController.ts`.

### 4. Phone bridge

Extend Ably payload (`receiving-photo-request.ts`, publishers, `ReceivingPhotoRequestCamera`):

```ts
{
  receiving_id: number;
  receiving_line_id?: number | null;
  stage: 'arrival_package' | 'unbox_carton' | 'unbox_item';
  request_id: string;
  requested_by_staff_id: number;
}
```

Routing:

| stage | Mobile route |
|---|---|
| `arrival_package` / `unbox_carton` | `/m/r/{id}/photos?stage=…` |
| `unbox_item` | `/m/receiving/po/{po}/item/{lineId}/photos?stage=…` (or `/m/r/{id}/line/{lineId}/photos` if PO unknown — prefer one canonical) |

Pass `stage` into `PhotoScope` so queue stamps Plan 1 types (today queue infers only from lineId presence — extend for unbox_carton vs package).

### 5. Mobile studios

- `MobileReceivingPhotoStudio` — header/copy from stage; list scope matches stage.
- Carton routes default `photosListScope: 'po'` for package/unbox_carton (stop `all` mixing item shots into carton gallery).
- Item route unchanged structurally; ensure stage=item explicit.

### 6. Testing / packing (parity only)

Do **not** redesign testing/pack cameras — already stage-typed. Verify phone `unit_photo_request` still lands on `/m/unit-photos/{id}` with testing vs packing. Document in Done checklist as “no regression.”

### 7. Playwright

- Triage peek / upload never creates `RECEIVING_LINE` rows.
- Unbox active-line camera creates `RECEIVING_LINE` + `receiving_item`.
- Phone request with `receiving_line_id` opens item capture (mock Ably or UI publisher test).

Reuse patterns from `tests/e2e/photos-receiving-platform.spec.ts`, `unbox-refresh-stickiness.spec.ts`.

## Explicitly NOT in this plan

| Cut | Why |
|---|---|
| Library tile SKU labels | Plan 3 |
| Journey timeline buckets | Plan 4 |
| `require_per_item` gate | Plan 5 |
| Visual identify → auto photo | Separate (`docs/visual-receiving-identify-plan.md`) |
| Rail sort SoC | `unbox-triage-mode-separation-handoff.md` |

## Done when

- [ ] Triage UI + writes are package-only.
- [ ] Unbox shows carton strip vs per-line item galleries with correct stamps.
- [ ] Phone request carries stage + optional line id and routes correctly.
- [ ] Desktop can upload to active `RECEIVING_LINE`.
- [ ] E2E + `npm run verify` green.

## Key files

- `src/components/receiving/triage/TriagePanel.tsx`
- `src/components/receiving/workspace/LineEditPanel.tsx`
- `src/components/receiving/workspace/line-edit/ReceivingPhoto*.tsx`
- `src/lib/realtime/receiving-photo-request.ts`
- `src/components/sidebar/receiving/usePhotoRequestPublisher.ts`
- `src/components/mobile/receiving/ReceivingPhotoRequestCamera.tsx`
- `src/components/mobile/receiving/PhotoUploadQueue.ts`
- `src/components/mobile/photos/MobileReceivingPhotoStudio.tsx`
- `src/app/m/(immersive)/r/[id]/photos/page.tsx`
- `src/app/m/(immersive)/receiving/po/[poId]/item/[itemId]/photos/page.tsx`
