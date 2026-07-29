# Execution prompt — photo evidence hardening (post-Gemini validation)

**Status:** ready to execute. Research complete, findings validated against the code, four of Gemini's claims corrected.
**Predecessor:** `photo-evidence-chain-GEMINI-RESEARCH-BRIEFING.md` (the brief) + its returned answer.
**Prerequisite landed:** the staged evidence chain (5-stage spine, write matrix, policy gate, stage-aware camera) shipped 2026-07-29 in `7768f6c05` / `610f6797d`.

---

## 0. Read this first — the research was right about the *what*, wrong about two *wheres*

Gemini's commercial conclusions hold. Its codebase claims were verified line-by-line on 2026-07-29 and **four need correcting before you write code**. Two of them invalidate the proposed implementation site.

| Gemini claim | Verified reality | Consequence |
|---|---|---|
| "our upload/thumbnailing process (`generateThumbnail`) strips EXIF" | **False.** `service.ts:212` stores `buffer: input.fileBuffer` — the **original is uploaded untouched**. `generateThumbnail` (`read-bytes.ts:100`) produces a *separate* thumb buffer. EXIF survives in the GCS original. | Its fix ("parse EXIF in `service.ts` before `generateThumbnail`") targets a non-problem on desktop **and cannot work at all for mobile** — see next row. |
| "add `captured_at_client`, parse EXIF server-side" | **Wrong layer.** EXIF is destroyed **client-side, on mobile only**: `downscaleImageTo720` (`src/lib/image/downscale.ts:88`) canvas-re-encodes to JPEG, which drops all metadata. There is a narrow passthrough (`:76`) for images already ≤ long edge **and** < 400 KB **and** `image/jpeg` — phone camera shots rarely qualify. | The capture timestamp must be read **before** downscale, on the device, and sent as an explicit field. A server-side parse would silently succeed for desktop uploads and silently fail for the unbox bench — the exact surface where arrival photos are taken. This is the single most important correction in this document. |
| "We already store `sha256_hex` in `photo_storage`" | **True, and better than it knew.** `photo_storage.sha256_hex` exists (`2026-06-18_photos_platform_side_tables.sql:66`) and is populated on every upload (`service.ts:239`, `putResult.sha256Hex \|\| sha256Hex(input.fileBuffer)`). | Its "don't add cryptographic tamper evidence" verdict stands on firmer ground. **Do not build hashing.** |
| "hard `DELETE FROM photos` … and immediate GCS object deletion" | **True, and worse.** `deletePhoto` (`service.ts:279`) hard-deletes the row, `photo_storage` follows by `ON DELETE CASCADE`, and it then deletes the GCS object **and** thumb (`:303–306`). There is an existing **NAS cold-storage mirror** cron (`/api/cron/photos/nas-mirror`, `PHOTOS_NAS_MIRROR_AFTER_DAYS`). | The real failure mode is sharper than "no tombstone": a mirrored photo's **bytes may survive on NAS while the row that could find them is destroyed**. Retention work should *compose* the existing mirror, not invent storage. |

Two further notes the research could not have known:

- **`photos.deleted_from_blob_at` already exists** (`schema.ts:1086`) but is **vestigial** — added by `2026-05-19_google_photos_tier4.sql`, referenced nowhere in app code. Repurposing it is tempting; **do not**. Its name means "the blob is gone", which is the opposite of a retention tombstone. Add a correctly-named column.
- **The historical corpus is 100% `receiving_package`** (400 rows sampled, 2026-07-29). Every recommendation below only affects photos captured *after* it lands.

**Method for this work:** the rules in the brief's §0.1 apply to you. Every path you touch, open first. Quote line numbers in your PR notes for load-bearing changes.

---

## 1. Scope

**In:** capture-time provenance, retention/deletion safety, the receiving gate's control model, and the conditional carrier-damage capture flow.

**Out:** anything in Gemini's §C. Specifically **do not**: backfill historical stages, materialise a `stage` column, add content hashing (already present), enforce capture sequence, or make 6-sided capture global. If you believe one of those is necessary, stop and write down why before proceeding.

**Constraints** (from `AGENTS.md`, `.claude/rules/*`) — a change violating these is out of scope:

- Tenant-from-birth on any new table: `organization_id UUID NOT NULL`, org-led indexes, `enforce_tenant_isolation()` in the birth migration (`.claude/rules/polymorphic-tables.md`).
- Migrations are hand-written, dated, idempotent, and modelled in Drizzle **in the same change**.
- One write waist: capture surfaces compose `resolveReceivingPhotoTarget()` (`src/lib/receiving/photo-scope.ts`); they never hand-roll `(entity, photo_type)`.
- Route skeleton: `withAuth` → validate → domain helper → status map → `recordAudit` → `after()` (`.claude/rules/backend-patterns.md`).
- `npm run verify` green before done. Never raise a DS-ratchet or knip baseline to pass.

---

## 2. Work item 1 — capture-time provenance (client-side)

**Why:** carrier concealed-damage claims are the one dispute class that reliably turns on *when* the photo was taken. `photos.created_at` is server-insert time; for a queued mobile upload that can be minutes-to-hours late, and the queue explicitly persists across tab death (`PhotoUploadQueue` rehydration).

**Where it actually breaks** — verified:

- `src/lib/image/downscale.ts:88` — `document.createElement('canvas')` → `toBlob('image/jpeg')`. Canvas re-encode drops EXIF. This runs in `PhotoUploadQueue.enqueue`'s pipeline before anything is sent.
- Passthrough at `:76` preserves the original blob (and its EXIF) only when `!scaled && originalBytes < 400_000 && type === 'image/jpeg'`.
- Desktop `uploadPhotoClient` path does **not** downscale — original reaches GCS intact.

**Do:**

1. Read the capture timestamp **on the device, before downscale**. For a `File` from a camera input, `File.lastModified` is the pragmatic source; where a real EXIF `DateTimeOriginal` is available prefer it. Keep the parser tiny and client-safe — do **not** pull a heavyweight EXIF library into a station bundle (`.claude/rules/build-gotchas.md` → bundle altitude).
2. Thread it through `PhotoScope` (`src/components/mobile/receiving/PhotoUploadQueue.ts`) alongside `stage`, and persist it in the localStorage rehydration payload so a queued photo that survives a tab kill keeps its true capture time.
3. Send it as an explicit multipart field from `uploadPhotoClient` (`src/lib/photos/upload-client.ts`) and accept it in `/api/photos/upload`.
4. Store it on `photos` as a **new, correctly-named nullable column** (suggested: `captured_at_client TIMESTAMPTZ NULL`). Nullable is correct — desktop uploads and legacy rows genuinely do not have it, and a fabricated value is worse than a null.
5. Surface it in the viewer context panel next to the existing uploader/created-at facts, clearly labelled as device-reported.

**Do not:** parse EXIF server-side as the primary mechanism. By the time the mobile bytes reach `service.ts` the metadata is already gone. A server-side parse is at best a fallback for the desktop path.

**Guard:** a unit test asserting that a stage-less, timestamp-less legacy payload still uploads (null column, no throw), and that a supplied client timestamp round-trips.

---

## 3. Work item 2 — deletion safety that composes the existing mirror

**Why:** `deletePhoto` destroys the row, the `photo_storage` link (CASCADE), and the GCS bytes in one call, with no audit of the removal. Where the NAS mirror has already run, the bytes survive but become unfindable.

**Do:**

1. Add a real tombstone to `photos` (suggested: `deleted_at TIMESTAMPTZ NULL` + `deleted_by_staff_id`). **Do not reuse `deleted_from_blob_at`** — see §0.
2. Change `deletePhoto` to a soft delete: stamp the tombstone, keep `photo_storage`, and **stop deleting GCS objects inline**.
3. Every read path must exclude tombstoned rows. Audit them explicitly — `listPhotos` in `service.ts`, `src/lib/photos/queries/library.ts`, `queries/receiving-list.ts`, `queries/unit-timeline-photos.ts`. A missed filter resurrects deleted photos into the library, which is a trust bug.
4. Move byte deletion into a retention cron that composes the existing photo-jobs machinery (`src/lib/photos/jobs.ts`, sibling to `/api/cron/photos/nas-mirror`). It purges objects only after a configurable window.
5. `recordAudit` the deletion (`AUDIT_ACTION` / `AUDIT_ENTITY` constants — do not invent new ones without checking the registry).

**Open — settle before building:** Gemini cites 180-day chargeback and 9-month carrier windows. **I did not verify those**; they are its research, not mine. Confirm against primary sources and make the window an org setting via the Settings Registry (`docs/settings-registry.md`) rather than a constant.

---

## 4. Work item 3 — the gate becomes a soft block with a reason code

**Why:** Gemini's strongest operational argument. A hard 409 at the dock produces floor photos and one-line cartons. The evidence you get is worse *and* you lose throughput.

**Current state** (verified): `evaluateReceivingPhotoPolicyGate` returns `{ok, blockers}`; both `mark-received-po` and `mark-received` return `409 {error:'PHOTO_POLICY', blockers}` before any mutation. Desktop releases its idempotency claim on block so a retry works. Mobile surfaces the blockers as a toast (`ReceivingQaActionSheet`).

**Do:**

1. Keep the evaluator untouched — it is a pure function and correct. Change only the **response contract** at the two routes.
2. Replace the 409 with a `200` carrying a `warnings` array **when an override is supplied**, and keep the 409 **only when it is not**. The operator must actively acknowledge, not silently bypass.
3. The override is a **reason code, not free text**. This repo already has a reason-code SoT — `reason_codes` with a `flow_context` CHECK (`2026-06-28_reason_codes_flow_context.sql:42`, extended by `2026-06-28d`). Register a new `flow_context` vocabulary for photo-policy overrides and reuse the existing picker chrome. **Do not add a `missing_photo_reason TEXT` column** as the research suggested — that is exactly the free-text conduit the caption→`photo_type` bug taught us to avoid.
4. Persist the override against the receiving line and `recordAudit` it. An override with no audit trail is worse than no gate.
5. Re-point the hard gate at a later control point per Gemini's §D — grading/testing or shipping, where exposure crystallises. **Scope this as a separate follow-up**, not part of this change; it needs its own decision about which station owns it.

**Guard:** extend `photo-policy-gate.test.ts` — override present → 200 + warnings + audit; override absent → 409 unchanged; `optional` → still zero photo queries.

---

## 5. Work item 4 — conditional carrier-damage capture (lowest priority)

Only when a carton is marked visibly damaged at triage, prompt the 6-sided + BMC + void-fill sequence. Pure capture-sequence chrome; no new photo types beyond what the matrix already allows on `RECEIVING`. Ship items 1–3 first and confirm the carrier requirement from primary sources before building — Gemini's 6-sided claim is uncited in its answer.

---

## 6. The gap this work does not close — read before starting

The desktop unbox surface currently has **no item-level capture affordance**. The per-item camera (`unbox_item` → `RECEIVING_LINE`) was built, verified writing correctly, and then **removed at the user's request** on 2026-07-29 because its floating bottom-right cluster duplicated identity chrome already on the line row. See the comment at the removal site in `src/components/receiving/workspace/LineEditPanel.tsx`.

Consequences, stated plainly:

- `require_per_item` is **unusable on desktop** — it demands item photos no desktop surface can produce.
- The mobile phone-bridge item route still works when a capture request carries a line id.
- `?stage=unbox_item` in the library will stay near-empty until an item capture surface exists.

**If item-level evidence matters for the disputes in §A of the research** (it does for eBay INAD, per Gemini), re-mounting an item camera is a prerequisite, not an optional polish. The suggested home is a single camera pill on the **line row header**, after the `NEW` chip — where the SKU already renders, no duplicated identity chrome, no floating overlay. Decide this before item-scoped work.

---

## 7. Order of execution

1. **§4 soft block + reason code** — highest operational value, unblocks turning the policy on at all.
2. **§2 client capture provenance** — highest dispute value; do it before the corpus grows.
3. **§3 deletion safety** — protects everything the first two produce.
4. **§6 item camera decision** — gates whether `require_per_item` is even reachable.
5. **§5 carrier flow** — only after 1–3, and only with a cited requirement.

Each is independently shippable. Do not batch them into one change.

---

## 8. Definition of done

- `npm run verify` green (lint, typecheck, unit + DS guards, knip, route-auth, schema drift).
- New migrations: dated, idempotent, tenant-from-birth, modelled in Drizzle in the same change.
- New unit tests for the evaluator contract change and the provenance round-trip; DB-free via `Deps` injection.
- E2E: extend `tests/e2e/photo-evidence-policy-gate.spec.ts` for the override path. The org-setting-mutating test stays behind `E2E_PHOTO_POLICY_GATE=1` and must restore the setting in `finally`.
- A work-log entry (`pnpm worklog`).
- **No baseline raised** to make a gate pass.
