<!-- generated header
tool: cycleforge-ack-build (GE-A manual run)
runId: ack_d3e80841
at: 2026-07-25T14:55:15-07:00
target commit: ed0eaa969025b5ad39fecb5813a191594004b910
Execution copy. Canonical: Garisek-OS docs/loops/cycleforge-ack-eod-shelf-IMPLEMENTATION-PROMPT.md
Regenerating overwrites this file. Never hand-edit — change the goal and re-run.
-->

# EXECUTION PROMPT — EOD Shelf Box-Count Reconciliation (Conductor Brief)

> Paste **everything below the horizontal rule** into a fresh conductor session at repo
> root `E:\cycleforge-app`. You are the **conductor**: orchestrate parallel specialist
> agents; do not solo the whole initiative as one serial god-thread. Builders use **pnpm**.

**Plan SoT:** [`docs/todo/packer-review-station-plan.md`](./packer-review-station-plan.md) §5b (EOD is that plan's deferred Phase 5b — this brief executes it)
**Target commit:** `ed0eaa969025b5ad39fecb5813a191594004b910`

---

# EOD Shelf Strike — Conductor Brief

**Goal:** At end of day, a manager at the `/review` packer station photographs the packed
shelf. The system counts the boxes (open-vocab detector on the LAN vision box),
reconciles the count against **today's REVIEW_APPROVED packs**, and appends **READY**
(match) or **ERROR_COUNT_MISMATCH** (mismatch) to every approved `packer_log` — through
the one existing writer, `recordPackVerificationEvent`. Vision down is not an error
state: **manual count override always completes the close.**

Almost everything already exists. The outcome vocabulary (`READY`,
`ERROR_COUNT_MISMATCH`), the state machine (EOD outcomes legal **only** when latest =
`REVIEW_APPROVED`), the `shelf_box_count` / `expected_count` columns, the idempotent
tenant-transaction writer, and the approved-today queue bucket are all live at the
target commit. **This strike writes zero migrations.** You are wiring four seams:

1. A `/locate` endpoint on the existing `vision/` FastAPI service (NIM LocateAnything-3B).
2. A `POST /api/packing/verification/eod` route (sibling of `decide/route.ts`).
3. A day-level EOD panel mounted in the `/review` packing header (no new route, no new mode pill).
4. Tests + env documentation.

## Operating system (how you work)

1. **You are the conductor.** Spawn specialist agents with the mission cards below. Do
   not let two agents edit the same file — leases are exclusive **across all waves**.
2. **Wave discipline.** Wave 0 is serial (SoT waist — the server contract). Wave 1 fans
   three agents at once, in one parallel batch. Wave 2 is integration + verify. Never
   skip Wave 0: both Wave 1 code agents consume its contract.
3. **File leases.** Each wave owns an exclusive path set (full table in the Appendix).
   `src/lib/packing/pack-verification.ts`, `pack-verification-outcomes.ts`, and the
   migration SQL are **leased to nobody** — they are read-only law.
4. **Constitution:** review state is an **append-only fact stream**. One writer
   (`recordPackVerificationEvent`), latest-wins per `packer_log`, no ALTER on any
   existing table, illegal transition → `CONFLICT` → 409, `client_event_id` idempotency.
5. **Verify per agent:** smallest relevant gate at the end of its card; conductor runs
   `pnpm verify:fast` then full `pnpm verify` before declaring a wave done.
6. **Worklog:** after each wave, `pnpm worklog "EOD-SHELF wave N: …" --result <r>`.

## Reconciliation law (do not invent a second one)

| Question | Answer | Source of truth |
|---|---|---|
| expected_count | count of today's `REVIEW_APPROVED` packer_logs, warehouse civil day | `pack-review-queue.ts` `'approved'` bucket (`warehouseDayUtcBounds(getCurrentPSTDateKey())`) — **reuse it, never a new query** |
| shelf_box_count | detector count from `/locate`, or manager's manual number | `meta.count_source: 'detector' \| 'manual'` |
| Match | `READY` appended per approved packer_log | state machine: legal only from `REVIEW_APPROVED` |
| Mismatch | `ERROR_COUNT_MISMATCH` appended per approved packer_log | same; lands in the `exceptions` bucket, chip label "Count mismatch" already exists |
| Unit of record | one `packer_log` (entity_type CHECK is `'PACKER_LOG'` only) | day-level outcome = per-log rows; a day parent entity is ASK-FIRST |
| Retry | same batch `clientEventId` → every row replays `duplicate: true` | per-row key derived `${clientEventId}:${packerLogId}` |

**Vision access is dual-path (house model):** the app runs on Vercel. Browser → LAN box
direct via `NEXT_PUBLIC_VISION_BASE_URL` (the `vision-identify.ts` pattern — image never
round-trips Vercel). Server → box via Cloudflare tunnel `VISION_ANALYZE_BASE_URL` +
`x-vision-token` (the `local-vision-client.ts` pattern). **First cut is browser-path**
(count is client-supplied with `countSource`); the server never proxies the image.
Vision fetches are single-attempt, no timeout, no retry — catch → unavailable → manual.

## Read first (conductor only — 10 minutes max)

1. `docs/todo/packer-review-station-plan.md` §5b (locate module spec) + §3c (state machine)
2. `src/lib/packing/pack-verification.ts` (the single writer; `shelfBoxCount`/`expectedCount` inputs already exist)
3. `src/lib/packing/pack-verification-outcomes.ts` (`EOD_OUTCOMES`, `canTransitionPackVerification`)
4. `src/app/api/packing/verification/decide/route.ts` (the route shape to mirror)
5. `src/lib/packing/pack-review-queue.ts` (the `'approved'` bucket = expected_count)
6. `src/lib/photos/local-vision-client.ts` + `src/lib/vision-identify.ts` (dual-path precedents)
7. `vision/app/server.py` + `vision/app/config.py` (lazy singletons, `_check_token`, pydantic Settings)
8. `src/features/review/ReviewPackingTable.tsx` lines ~163–197 (the `WorkbenchChromeHeader` `right` slot mount point)

Then publish a **Wave Plan** in chat (table of agents + leases) and start Wave 0.

---

## WAVE 0 — Conductor solo (serial, SoT waist)

**Codename:** `WAIST` — the server contract every other agent builds against.

### Mission
Ship `POST /api/packing/verification/eod` and the DB-free EOD domain module so Wave 1
can build UI and tests against a frozen contract. All writes go through
`recordPackVerificationEvent` — this wave adds **zero** SQL of its own.

### Do
1. **Schema** — append `PackVerificationEodBody` to `src/lib/schemas/pack-verification.ts`
   (restrict-outcome-per-route pattern; note the outcome is NOT client-supplied — the
   server computes it):
   - `shelfBoxCount: z.coerce.number().int().min(0)`
   - `countSource: z.enum(['detector', 'manual'])`
   - `bboxes: z.array(z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), score: z.number().min(0).max(1).nullish() })).max(200).nullish()`
   - `photoIds: z.array(z.string()).max(10).nullish()` (stays empty in first cut — see ASK-FIRST)
   - `clientEventId: z.string().uuid()` (**required** — it is the batch idempotency spine)
   - `note: trimmed.max(2000).nullish()`
   - Scope decision (made): **day scope, server-authoritative.** No client `packerLogIds`
     list — expected_count must come from the approved bucket anyway, and a client list
     can drift from it.
2. **Domain module** — new `src/lib/packing/pack-verification-eod.ts`, deps-injected like
   `pack-verification.ts` so tests run DB-free:
   - `reconcileEodOutcome(expectedCount, shelfBoxCount): 'READY' | 'ERROR_COUNT_MISMATCH'` (pure).
   - `recordEodReconciliation(input, deps)` — fetches today's approved rows via
     `getPackReviewQueue(orgId, { bucket: 'approved', limit: 500 })` (**pass limit 500
     explicitly** — the default is 100 and would truncate a big day), computes
     `expectedCount = rows.length`, then loops the approved `packerLogId`s calling
     `recordPackVerificationEvent` with: computed outcome, `shelfBoxCount`,
     `expectedCount`, `verifiedByStaffId`, per-row `clientEventId:
     ` `${input.clientEventId}:${packerLogId}` `, and
     `meta: { countSource, bboxes, photoIds, note }`.
   - Per-row `CONFLICT` (e.g. a concurrent flag) is **collected, not thrown** — return
     `{ expectedCount, shelfBoxCount, outcome, results: [{ packerLogId, ok, duplicate?, code? }] }`.
   - `expectedCount === 0` → return early with `noApproved: true`, write nothing.
3. **Route** — new `src/app/api/packing/verification/eod/route.ts`, byte-for-byte sibling
   of `decide/route.ts`: `withAuth(…, { permission: 'packing.review' })` → `parseBody(PackVerificationEodBody)` →
   domain module → status map: 201 when ≥1 new row written; 200 when all rows were
   duplicates or `noApproved`; **409 only when zero rows written and ≥1 conflict**
   (include per-row results in every response body). Business logic lives in the module,
   not the route.
4. **Audit** — append `PACK_EOD_RECONCILE: 'packing.eod_reconcile'` to `AUDIT_ACTION` in
   `src/lib/audit-logs.ts` (append-only; never rename existing values). One
   `recordAudit` per non-all-duplicate submission: `entityType: AUDIT_ENTITY.PACKER_LOG`,
   `entityId` = first written packerLogId, `after: { outcome, expectedCount, shelfBoxCount, countSource, packerLogIds }`.
5. **Manifest** — `pnpm audit-route-auth:emit` to regenerate
   `docs/security/route-permissions.json` (CI enforces freshness with `--check`; never hand-edit).
6. Do **not** touch `pack-verification.ts`, `pack-verification-outcomes.ts`, the ops_events
   emission inside `writeEvent`, or any SQL file. The 8-value outcome CHECK already
   contains both EOD outcomes — no new outcome strings.

### Lease (exclusive, this wave only)
- `src/lib/schemas/pack-verification.ts`
- `src/lib/packing/pack-verification-eod.ts` *(new)*
- `src/app/api/packing/verification/eod/route.ts` *(new)*
- `src/lib/audit-logs.ts` *(append one AUDIT_ACTION only)*
- `docs/security/route-permissions.json` *(regenerated, not hand-edited)*
- `src/lib/packing/pack-review-queue.ts` *(prefer zero edits — bucket reuse; a dedicated `getApprovedPackerLogsForToday` export is allowed within this lease if the loop needs raw ids)*

### Gate to Wave 1
- [ ] `pnpm exec tsx --test src/lib/packing/pack-verification.test.ts` green (existing suite untouched)
- [ ] `pnpm audit-route-auth:emit` then `pnpm audit-route-auth:check` clean
- [ ] `pnpm test:auth` green (zero-ungated-writes invariant holds with the new route)
- [ ] `pnpm verify:fast` green
- [ ] Conductor posts the fan-out table and spawns all three Wave 1 agents **in one turn**

---

## WAVE 1 — Fan-out (THREE agents, one message, simultaneous)

Each agent gets its mission card + "Wave 0 is merged; the eod route/schema/domain module
are frozen — build against them, do not rewrite them."

### Agent A — `LOCATE` (vision sidecar, Python only)

**Persona:** GPU box mechanic. Blast radius is `vision/` only — this agent never touches TypeScript.

**Do**
- New `vision/app/locate_anything.py` — NVIDIA NIM client for `LocateAnything-3B` (plan
  §5b): input image bytes + text prompt, output `{ boxes: [{x1,y1,x2,y2,score}], count }`.
  Lazy import (the `detector.py` convention) so the NIM dep stays optional.
- `vision/app/config.py` — new typed pydantic Settings fields loaded from `vision/.env`:
  `nim_api_key: str = ""`, `nim_base_url: str = "https://integrate.api.nvidia.com"`,
  `locate_model: str = "nvidia/locate-anything-3b"`, `locate_prompt: str = "cardboard boxes"`.
- `vision/app/server.py` — `POST /locate` beside `/analyze`: `UploadFile` + optional
  `prompt` Form (default `settings.locate_prompt`) + `x_vision_token` header →
  `_check_token`; lazy singleton `get_locator()` mirroring `get_photo_analyzer()`. CORS
  and token guard are inherited app-wide — add nothing bespoke.
- **Degradation is the contract:** NIM unreachable or `nim_api_key` unset →
  `503 {"detector": "unavailable"}`. `/locate` must **never** 500 the review flow.
- Document every new knob in `vision/config.example.txt` (follow the `USE_DETECTOR` precedent).

**Lease**
- `vision/app/locate_anything.py` *(new)*
- `vision/app/server.py`
- `vision/app/config.py`
- `vision/config.example.txt`

**Gate**
- [ ] `cd vision && python -m py_compile app/locate_anything.py app/server.py app/config.py`
- [ ] `/locate` handler calls `_check_token` and returns the 503 shape on unreachable NIM (self-review against the card)
- [ ] Optional live smoke if the box is up: `curl -s -X POST -H "x-vision-token: $VISION_TOKEN" -F "file=@shelf.jpg" $VISION_BASE/locate`

**Out of lease:** everything under `src/`.

---

### Agent B — `PANEL` (review station EOD UI)

**Persona:** Closing manager — one button, one photo, one honest number, done in 60 seconds.

**Do**
- New `src/lib/vision-locate.ts` — browser client `locateFromVisionBox(blob, prompt?)`
  mirroring `identifyFromVisionBox` (import `getVisionBaseUrl` from
  `src/lib/vision-identify.ts` — **import only, do not edit that file**): FormData POST
  to `${base}/locate`, `credentials: 'include'`, `cache: 'no-store'`, **single attempt,
  no timeout, no retry** — catch / non-OK / 503 → `{ ok: false, unavailable: true }`.
- EOD trigger: a compact "EOD shelf check" button rendered in the
  `WorkbenchChromeHeader` `right` slot in `src/features/review/ReviewPackingTable.tsx`,
  next to the existing `StaffFilterButton` — a **day-level action**. NOT a new route,
  NOT a new mode pill.
- New `src/features/review/eod/EodReconcilePanel.tsx` (+ `useEodReconcile.ts` hook):
  1. Photo capture/upload of the packed shelf.
  2. POST to `/locate` → detected count + bbox overlay; unreachable → drop straight into
     manual mode with clear copy ("Vision box unreachable — enter the count by hand").
  3. Expected count fetched from `GET /api/packing/verification/queue?bucket=approved&limit=500`
     (display `rows.length`; the server recomputes authoritatively on submit).
  4. **Manual count override always visible** — even when the detector answered; editing
     the number flips `countSource` to `'manual'`.
  5. Submit mirrors `submitDecision` in `PackerReviewMode.tsx`: JSON POST to
     `/api/packing/verification/eod` with `clientEventId: safeRandomUUID()`; on success
     toast READY vs mismatch, invalidate `['pack-review-queue']` and `['pack-review-row']`;
     on 409 toast "Already reconciled / decided elsewhere — refreshing."
- New `src/features/review/eod/ShelfBboxOverlay.tsx` — bbox overlay on the captured
  photo. This is **net-new app-wide** (the only canvas precedent is a frame-freeze) —
  keep it a dumb absolutely-positioned SVG/`<div>` layer scaled to the rendered image;
  no drawing library.
- Shelf photo persistence: **first cut is client-side only** — the submitted body carries
  `bboxes` + `countSource`; `photoIds` stays empty. Do NOT call `/api/photos/upload`
  (no shelf entity type exists and the enum is owned by the photo-evidence workstream).
- Outcome chips need no work: `packOutcomeMeta` already labels `READY` ("Ready") and
  `ERROR_COUNT_MISMATCH` ("Count mismatch"), and mismatches surface in the existing
  `exceptions` bucket.

**Lease**
- `src/lib/vision-locate.ts` *(new)*
- `src/features/review/eod/EodReconcilePanel.tsx` *(new)*
- `src/features/review/eod/ShelfBboxOverlay.tsx` *(new)*
- `src/features/review/eod/useEodReconcile.ts` *(new)*
- `src/features/review/ReviewPackingTable.tsx` *(mount edit only — the `right` slot)*

**Gate**
- [ ] `pnpm verify:fast` green
- [ ] `StaffFilterButton` still renders in the `right` slot alongside the new button
- [ ] Manual-only path (no vision) reaches a successful submit in a local click-through

**Out of lease:** `vision/**`, `PackerReviewMode.tsx`, `ReviewWorkspace.tsx`, `vision-identify.ts`, anything in `src/lib/photos/`.

---

### Agent C — `PROOF` (tests + env docs)

**Persona:** Auditor — if the close can lie, prove it here first.

**Do**
- New `src/lib/packing/pack-verification-eod.test.ts` beside `pack-verification.test.ts`,
  same DB-free deps-injection style (`node:test` + capturing fake executor / fake
  queue-read deps). Cover at minimum:
  - `reconcileEodOutcome`: equal counts → `READY`; any delta (over and under) → `ERROR_COUNT_MISMATCH`.
  - Detector path vs manual path (`countSource: 'manual'`) both complete — the vision-503
    scenario is "manual override still records outcomes", never an error.
  - Per-row idempotency key derivation is stable: same batch `clientEventId` replayed →
    every row `duplicate: true`.
  - One row returning `CONFLICT` (latest ≠ `REVIEW_APPROVED` at write time) is collected
    in `results` without aborting sibling writes.
  - `expectedCount === 0` → `noApproved`, zero writes.
- `package.json` — add the scoped script (none exists for packing today):
  `"test:packing": "tsx --test src/lib/packing/*.test.ts"` (covers the existing suite + the new file).
- `.env.example` — the three vision vars have **zero** matches in 251 lines today.
  Document them in a new block adjacent to the existing Cloudflare-tunnel section
  (~lines 165–177): `NEXT_PUBLIC_VISION_BASE_URL` (browser → LAN box, build-time
  inlined), `VISION_ANALYZE_BASE_URL` (server → box via Cloudflare tunnel),
  `VISION_TOKEN` (shared secret sent as `x-vision-token`). Note the resolution order:
  org setting → `VISION_ANALYZE_BASE_URL` → `NEXT_PUBLIC_VISION_BASE_URL`.
  (`vision/.env` knobs are Agent A's lease via `vision/config.example.txt` — do not duplicate them here.)

**Lease**
- `src/lib/packing/pack-verification-eod.test.ts` *(new)*
- `package.json` *(scripts block only)*
- `.env.example` *(vision block only)*

**Gate**
- [ ] `pnpm test:packing` green (existing + new tests)

**Out of lease:** all production `src/` code, `vision/**`.

---

## WAVE 1 merge ritual (conductor)

When all three agents report:

1. Reconcile any accidental lease breaches (revert cross-edits).
2. `pnpm verify:fast`, then full `pnpm verify`.
3. Smoke mental checklist:
   - Approved-today count in the panel equals the queue `approved` bucket length
   - Match submit → approved rows now show **Ready**; history bucket includes them
   - Mismatch submit → rows land in **exceptions** with "Count mismatch"
   - Re-submit same panel session → all `duplicate: true`, no double rows
   - Vision box stopped → panel degrades to manual and still completes
4. Post compound note + `pnpm worklog "EOD-SHELF wave 1: locate+panel+proof" --result pass`.
5. Open Wave 2.

---

## WAVE 2 — Integration + close (conductor, no new leases)

**Codename:** `CLOSE`

1. Full gate battery (these are the verify gates of record):
   - `pnpm verify`
   - `pnpm test:auth`
   - `pnpm audit-route-auth:check`
   - `pnpm test:packing`
   - `cd vision && python -m py_compile app/locate_anything.py app/server.py app/config.py`
2. Live end-to-end if the box + NIM key are available: photograph a shelf, confirm bbox
   overlay, submit both a match and a forced mismatch, confirm 409 behavior by racing a
   flag on one approved row.
3. Update `docs/todo/packer-review-station-plan.md` Phase 5b status from "deferred" to
   done (single-line status edit; the plan remains design intent — code is truth on drift).
4. Final worklog: `pnpm worklog "EOD-SHELF wave 2: closed" --result pass`.

---

## Explicitly forbidden (all agents)

- Any `ALTER`/migration on any existing table — `shelf_box_count` / `expected_count`
  columns already exist; review is an append-only fact stream
- Writing `pack_verification_events` by any path other than `recordPackVerificationEvent`
- New outcome strings — the 8-value DB CHECK already includes `READY` and `ERROR_COUNT_MISMATCH`
- Extending `PHOTO_ENTITY_TYPES` or calling `/api/photos/upload` for the shelf photo
  (enum is owned by the photo-evidence workstream — ASK-FIRST territory)
- Touching the `ops_events` emission inside `writeEvent` (owned by the ops-events
  unification plan — orthogonal handoff)
- Touching `tech_verifications` in any way
- A new `/review` route or mode pill — EOD is a day action in the packing header slot
- Renaming any `AUDIT_ACTION` / `AUDIT_ENTITY` value (append-only)
- 500ing when vision is unreachable — anywhere; degrade to manual, always
- Timeout/retry/AbortController on any vision fetch (house convention is single attempt,
  catch → unavailable) — see ASK-FIRST
- Hand-editing `docs/security/route-permissions.json` (regen via `pnpm audit-route-auth:emit` only)
- Committing / pushing / stashing unless the human asks
- Editing another wave's or agent's leased files, ever

## ASK-FIRST gates

Stop and ask the human before:

- Widening the `GET /api/vision-config` permission beyond `receiving.view` so packing
  personas can seed the runtime vision base URL (first cut relies on the build-time
  `NEXT_PUBLIC_VISION_BASE_URL` inline)
- Adding any shelf/day photo entity (`PACK_EOD_SESSION` or otherwise) — owned by the
  photo-evidence workstream
- Persisting the raw shelf image server-side (the orphan-blob `inventory-photos`
  precedent exists if a landing spot is demanded; then and only then populate `photoIds`)
- Adding an AbortController timeout to the `/locate` browser fetch (breaks the
  no-timeout vision convention)
- Introducing a day-level parent entity for `pack_verification_events` (the
  `entity_type` CHECK is `'PACKER_LOG'` only; per-log rows are the law of this strike)
- Appending a new `AUDIT_ENTITY` value if `PACKER_LOG` proves a bad fit for the batch audit row

## Orthogonal handoffs (name them, do not scope them)

- `ops_events` `entity_type 'other'` shape → ops-events unification plan
- `PACK_EOD_SESSION` photo-entity expansion → photo-evidence workstream
- `tech_verifications` → untouched, no interaction

## Conductor kickoff script (say this, then fan out)

> Conductor online. Wave 0 WAIST merged — eod contract frozen. Spawning LOCATE, PANEL,
> PROOF with exclusive leases. One writer is law; the approved bucket is law; degrade-
> never-500 is law. Close the day — parallel, clean, append-only.

Then dispatch the three Wave 1 agents **in a single parallel tool batch**.

## Done looks like

1. Manager on `/review` (packing) hits **EOD shelf check**, photographs the shelf, and
   sees the detected box count with bounding boxes drawn over the photo.
2. Expected count shown beside it is exactly today's approved bucket; submit on a match
   appends `READY` to every approved packer_log; a mismatch appends
   `ERROR_COUNT_MISMATCH` rows that surface in the exceptions bucket as "Count mismatch".
3. With the vision box unplugged, the same flow completes via manual count entry,
   recorded with `meta.count_source = 'manual'` — the close never blocks on the GPU box.
4. Resubmitting the same session is a no-op (`duplicate: true` per row); a concurrently
   flagged row conflicts loudly (collected per-row, 409 only when nothing wrote) — never silently.
5. `pnpm verify`, `pnpm test:auth`, `pnpm audit-route-auth:check`, and `pnpm test:packing`
   are all green, and `.env.example` finally documents the three vision variables.

**If this brief and `packer-review-station-plan.md` §5b disagree, code at the target
commit is truth; this brief wins on wave/lease discipline.**

---

## Appendix — Procedure JSON

```json
{
  "title": "EOD Shelf Box-Count Reconciliation — Packer Review Station",
  "mission": "Manager photographs the packed shelf at end of day; the vision sidecar's new /locate endpoint (NIM LocateAnything-3B) counts boxes; POST /api/packing/verification/eod reconciles the count against today's REVIEW_APPROVED packer_logs (pack-review-queue 'approved' bucket) and appends READY or ERROR_COUNT_MISMATCH per packer_log via recordPackVerificationEvent; vision-unreachable degrades to an always-available manual count override.",
  "invariants": [
    "All per-order writes go through recordPackVerificationEvent only; READY/ERROR_COUNT_MISMATCH are legal solely when the latest outcome for that packer_log is REVIEW_APPROVED; illegal transitions return CONFLICT and map to HTTP 409, never silent (C6, C7)",
    "client_event_id idempotency: a replay short-circuits to the prior row with duplicate:true; batch retries derive per-row keys `${clientEventId}:${packerLogId}` (C3)",
    "Org-scoped writes run inside withTenantTransaction via the domain helper (C2)",
    "No ALTER on any existing table and no new migration: shelf_box_count/expected_count columns and the 8-value outcome CHECK already exist; review is an append-only fact stream with entity_type 'PACKER_LOG' only — day-level results are written as per-log rows (C5, C8, C9, F6)",
    "Route skeleton: withAuth('packing.review') -> Zod parseBody -> domain helper -> 404/409/400 status map -> recordAudit; no business logic inline in the route (C1, C15)",
    "AUDIT_ACTION/AUDIT_ENTITY are append-only; never rename existing values (C4)",
    "expected_count is computed from the pack-review-queue 'approved' bucket predicate (warehouseDayUtcBounds(getCurrentPSTDateKey())), never a new query (F7, F8)",
    "Vision degrades, never throws: unreachable/misconfigured vision returns null/unavailable client-side and 503 {detector:'unavailable'} from /locate; manual override always completes the close; no path may 500 (C12, J12)",
    "Vision fetches are single-attempt with no timeout and no retry; catch -> unavailable (C17); adding a timeout is ASK-FIRST",
    "Dual-path vision env convention: NEXT_PUBLIC_VISION_BASE_URL for the browser->LAN path, VISION_ANALYZE_BASE_URL + VISION_TOKEN (x-vision-token) for the server->tunnel path, org setting resolves first (C16)",
    "PHOTO_ENTITY_TYPES and /api/photos/upload are untouched; shelf evidence lives in pack_verification_events.meta (photoIds/bboxes/count_source) in the first cut (C10, C11, J10)",
    "New vision knobs are typed pydantic Settings loaded from vision/.env with lazy model imports, documented in vision/config.example.txt (C13, C14)",
    "Route-auth changes regenerate docs/security/route-permissions.json via audit-route-auth --emit; CI --check enforces freshness (C19)",
    "ops_events 'other' emission, PACK_EOD_SESSION photo entity, and tech_verifications are orthogonal handoffs owned elsewhere — named, not scoped (J9, J10)"
  ],
  "fileLeases": [
    { "path": "src/lib/schemas/pack-verification.ts", "wave": "W0", "change": "edit" },
    { "path": "src/lib/packing/pack-verification-eod.ts", "wave": "W0", "change": "new" },
    { "path": "src/app/api/packing/verification/eod/route.ts", "wave": "W0", "change": "new" },
    { "path": "src/lib/audit-logs.ts", "wave": "W0", "change": "edit (append AUDIT_ACTION.PACK_EOD_RECONCILE only)" },
    { "path": "docs/security/route-permissions.json", "wave": "W0", "change": "regenerated" },
    { "path": "src/lib/packing/pack-review-queue.ts", "wave": "W0", "change": "optional edit (approved-today export; prefer bucket reuse)" },
    { "path": "vision/app/locate_anything.py", "wave": "W1-LOCATE", "change": "new" },
    { "path": "vision/app/server.py", "wave": "W1-LOCATE", "change": "edit" },
    { "path": "vision/app/config.py", "wave": "W1-LOCATE", "change": "edit" },
    { "path": "vision/config.example.txt", "wave": "W1-LOCATE", "change": "edit" },
    { "path": "src/lib/vision-locate.ts", "wave": "W1-PANEL", "change": "new" },
    { "path": "src/features/review/eod/EodReconcilePanel.tsx", "wave": "W1-PANEL", "change": "new" },
    { "path": "src/features/review/eod/ShelfBboxOverlay.tsx", "wave": "W1-PANEL", "change": "new" },
    { "path": "src/features/review/eod/useEodReconcile.ts", "wave": "W1-PANEL", "change": "new" },
    { "path": "src/features/review/ReviewPackingTable.tsx", "wave": "W1-PANEL", "change": "edit (WorkbenchChromeHeader right-slot mount only)" },
    { "path": "src/lib/packing/pack-verification-eod.test.ts", "wave": "W1-PROOF", "change": "new" },
    { "path": "package.json", "wave": "W1-PROOF", "change": "edit (add test:packing script only)" },
    { "path": ".env.example", "wave": "W1-PROOF", "change": "edit (vision env block only)" }
  ],
  "waves": [
    {
      "id": "W0",
      "missionCard": "WAIST (conductor solo, serial): freeze the server contract. Append PackVerificationEodBody (shelfBoxCount int>=0, countSource 'detector'|'manual', bboxes<=200, photoIds<=10, required uuid clientEventId, optional note; day-scope, server-authoritative — no client packerLogIds). New deps-injected src/lib/packing/pack-verification-eod.ts: pure reconcileEodOutcome(expected, shelf) -> READY|ERROR_COUNT_MISMATCH, and recordEodReconciliation that reads today's approved set via getPackReviewQueue(orgId,{bucket:'approved',limit:500}), sets expectedCount=rows.length, and loops recordPackVerificationEvent per packerLogId with derived clientEventId `${clientEventId}:${packerLogId}` and meta {countSource,bboxes,photoIds,note}; collect per-row CONFLICTs, never throw; expectedCount===0 -> noApproved, zero writes. New eod/route.ts as byte-for-byte sibling of decide/route.ts on permission packing.review: 201 when >=1 new row, 200 when all-duplicate or noApproved, 409 only when zero written and >=1 conflict; append AUDIT_ACTION.PACK_EOD_RECONCILE and record one audit per non-duplicate submission; regenerate the route-permission manifest. Zero SQL, zero edits to pack-verification.ts / pack-verification-outcomes.ts / ops_events emission.",
      "files": [
        "src/lib/schemas/pack-verification.ts",
        "src/lib/packing/pack-verification-eod.ts",
        "src/app/api/packing/verification/eod/route.ts",
        "src/lib/audit-logs.ts",
        "docs/security/route-permissions.json",
        "src/lib/packing/pack-review-queue.ts"
      ],
      "gates": [
        "pnpm exec tsx --test src/lib/packing/pack-verification.test.ts",
        "pnpm audit-route-auth:emit",
        "pnpm audit-route-auth:check",
        "pnpm test:auth",
        "pnpm verify:fast"
      ]
    },
    {
      "id": "W1-LOCATE",
      "missionCard": "LOCATE (vision sidecar, Python only, blast radius vision/): new vision/app/locate_anything.py NIM LocateAnything-3B client (image bytes + prompt -> {boxes:[{x1,y1,x2,y2,score}], count}), lazy-imported per the detector.py convention. Extend pydantic Settings with nim_api_key(''), nim_base_url, locate_model('nvidia/locate-anything-3b'), locate_prompt('cardboard boxes') loaded from vision/.env; document all four in vision/config.example.txt (USE_DETECTOR precedent). Add POST /locate to server.py beside /analyze: UploadFile + optional prompt Form + x_vision_token -> _check_token, served by a lazy singleton get_locator() mirroring get_photo_analyzer(); inherit app-wide CORS. NIM unreachable or key unset -> 503 {\"detector\":\"unavailable\"}; never 500. No src/ edits.",
      "files": [
        "vision/app/locate_anything.py",
        "vision/app/server.py",
        "vision/app/config.py",
        "vision/config.example.txt"
      ],
      "gates": [
        "cd vision && python -m py_compile app/locate_anything.py app/server.py app/config.py"
      ]
    },
    {
      "id": "W1-PANEL",
      "missionCard": "PANEL (review station EOD UI): new src/lib/vision-locate.ts locateFromVisionBox(blob, prompt?) mirroring identifyFromVisionBox (import getVisionBaseUrl from vision-identify.ts, do not edit it): FormData POST `${base}/locate`, credentials 'include', cache 'no-store', single attempt, no timeout/retry, catch/non-OK/503 -> {ok:false, unavailable:true}. Mount a day-level 'EOD shelf check' button in the WorkbenchChromeHeader right slot of ReviewPackingTable.tsx beside StaffFilterButton (NOT a new route or mode pill). New EodReconcilePanel + useEodReconcile: capture shelf photo -> /locate -> detected count + net-new ShelfBboxOverlay (dumb scaled SVG/div layer, no drawing lib); expected count from GET /api/packing/verification/queue?bucket=approved&limit=500; manual count override always visible (editing flips countSource to 'manual'); submit mirrors submitDecision with clientEventId safeRandomUUID(), invalidate ['pack-review-queue'] and ['pack-review-row'], 409 -> refresh toast. Vision unreachable -> manual mode copy, flow still completes. Do NOT upload the shelf photo via /api/photos/upload; photoIds stays empty in the first cut.",
      "files": [
        "src/lib/vision-locate.ts",
        "src/features/review/eod/EodReconcilePanel.tsx",
        "src/features/review/eod/ShelfBboxOverlay.tsx",
        "src/features/review/eod/useEodReconcile.ts",
        "src/features/review/ReviewPackingTable.tsx"
      ],
      "gates": [
        "pnpm verify:fast"
      ]
    },
    {
      "id": "W1-PROOF",
      "missionCard": "PROOF (tests + env docs): new src/lib/packing/pack-verification-eod.test.ts beside pack-verification.test.ts in the same node:test deps-injection DB-free style — reconcileEodOutcome equal->READY / any delta->ERROR_COUNT_MISMATCH; detector and manual countSource paths both complete (vision-503 == manual override still records outcomes, never errors); per-row key `${clientEventId}:${packerLogId}` replay -> duplicate:true on every row; a per-row CONFLICT is collected without aborting siblings; expectedCount 0 -> noApproved, zero writes. Add package.json script \"test:packing\": \"tsx --test src/lib/packing/*.test.ts\". Document NEXT_PUBLIC_VISION_BASE_URL (browser->LAN), VISION_ANALYZE_BASE_URL (server->Cloudflare tunnel), VISION_TOKEN (x-vision-token) in .env.example beside the existing Cloudflare-tunnel block (~lines 165-177; currently zero vision matches in 251 lines), noting resolution order org setting -> VISION_ANALYZE_BASE_URL -> NEXT_PUBLIC_VISION_BASE_URL. vision/.env knobs belong to W1-LOCATE's config.example.txt — do not duplicate.",
      "files": [
        "src/lib/packing/pack-verification-eod.test.ts",
        "package.json",
        ".env.example"
      ],
      "gates": [
        "pnpm test:packing"
      ]
    },
    {
      "id": "W2",
      "missionCard": "CLOSE (conductor, no new leases): reconcile lease breaches, run the full verify gate battery, live e2e if box+NIM available (match submit, forced mismatch, idempotent resubmit, raced-flag conflict), flip plan §5b status from deferred, worklog and stop. Commit only if the human asks.",
      "files": [],
      "gates": [
        "pnpm verify",
        "pnpm test:auth",
        "pnpm audit-route-auth:check",
        "pnpm test:packing",
        "cd vision && python -m py_compile app/locate_anything.py app/server.py app/config.py"
      ]
    }
  ],
  "verifyGates": [
    "pnpm verify",
    "pnpm test:auth",
    "pnpm audit-route-auth:check",
    "pnpm test:packing",
    "pnpm exec tsx --test src/lib/packing/pack-verification.test.ts src/lib/packing/pack-verification-eod.test.ts",
    "cd vision && python -m py_compile app/locate_anything.py app/server.py app/config.py"
  ],
  "generatedBy": {
    "runId": "ack_d3e80841",
    "at": "2026-07-25T14:55:15-07:00",
    "targetCommit": "ed0eaa969025b5ad39fecb5813a191594004b910"
  }
}
```
