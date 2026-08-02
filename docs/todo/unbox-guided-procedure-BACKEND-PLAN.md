# Unbox guided procedure — BACKEND PLAN

**Date:** 2026-08-01 · **Lane:** WS-DOGFOOD (`main`)
**Shared decisions (D1–D9), vocabulary table, sequencing:**
[`unbox-guided-procedure-INDEX.md`](./unbox-guided-procedure-INDEX.md) — **read it first; this plan
does not restate it.**

Every phase here is **additive** and ships without a single frontend change. That is deliberate: the
UI lane is the risky half, and it must not be able to take the data model down with it.

---

## BE-0 · Vocabulary + aspect SoT (pure modules, no DB)

### 0a. Extend the procedure declaration — `src/lib/stations/procedure.ts`

Add steps 3–6 of the INDEX table to `unboxProcedure.steps`, rename `po_photos` → `arrival_check`,
and drop `ungated` from `condition`. **Do not create a second array.**

Two fields are new on `ProcedureStep`:

```ts
/** Photo aspect this step is evidenced by, when its evidence is one specific shot. */
photoAspect?: PhotoAspect;
/**
 * The step is evidenced by a SET of aspects, each of which is its own sub-row
 * (`item_photos`). Required-vs-optional is org policy, resolved at read time —
 * never a constant here, or a six-shot minimum ships to a two-person reseller.
 */
photoAspectSet?: readonly PhotoAspect[];
```

`reads` / `writes` on the new steps are the same photo triple the existing photo steps declare
(`photos`, `photo_storage`, `photo_entity_links`) — `data-lineage.guard.test.ts` parses the route's
SQL, so copy the shape, do not invent one.

**`arrival_check` keeps `endpoint: GET /api/receiving-photos`,** not POST. It is a verify step; a
POST endpoint on it is the documentation half of the exact bug D3 exists to prevent.

### 0b. The aspect vocabulary — `src/lib/photos/photo-aspects.ts` (new)

Pure, client-safe, no DB. Sibling of `src/lib/photos/stages.ts`; composes it, never re-derives it.

```ts
export const PHOTO_ASPECTS = [
  'shipping_label', 'box_exterior', 'box_interior', 'packing_material',
  'included', 'serial', 'front', 'back', 'side', 'bottom',
] as const;
export type PhotoAspect = (typeof PHOTO_ASPECTS)[number];

/** Which aspects a stage may legally carry (INDEX D2 matrix). */
export const ASPECTS_BY_STAGE: Record<PhotoEvidenceStage, readonly PhotoAspect[]>;

export function isAspectLegalForStage(aspect: PhotoAspect, stage: PhotoEvidenceStage): boolean;
export function photoAspectLabel(aspect: PhotoAspect): string;
/** Parse a wire value. Unknown → null (NOT a default — an aspect is a claim). */
export function parsePhotoAspect(raw: string | null | undefined): PhotoAspect | null;
```

Three rules, all learned here already:

- **`parsePhotoAspect` returns `null` on unknown, never a fallback aspect.** An aspect is a claim
  about what the photo shows; a defaulted claim is `backend-patterns.md`'s "safety classification
  with a default", and this codebase has paid for that twice (`intakeSurface`, `scanKind`).
- **Aspect is nullable everywhere.** `NULL` = unclassified evidence, not missing evidence.
- **Labels come from here.** No call site types "Shipping label".

### 0c. Gates — `src/components/receiving/workspace/derive-capture-step-states.ts`

Extend `GATED_KEYS` and `DeriveCaptureStepStatesInput`:

```ts
/** Per-aspect photo counts on THIS carton (unbox_carton stage). */
cartonAspectCounts: Partial<Record<PhotoAspect, number>>;
/** Per-aspect photo counts on THIS line (unbox_item stage). */
itemAspectCounts: Partial<Record<PhotoAspect, number>>;
/** Org policy — which item aspects block the step. */
requiredItemAspects: readonly PhotoAspect[];
conditionGradedAt: string | null;
contentsConfirmedAt: string | null;
```

Keep the existing behaviour for a step whose gate is missing: **render not-done, never throw.** A
bench that crashes mid-carton is far worse than one showing an extra unchecked row; CI catches the
divergence.

### 0d. Settings Registry key

`receiving.requiredItemPhotoAspects` — default `['included', 'serial']`. Register it in the existing
Settings Registry beside `receiving.confirmSerialRemoval`; do not invent a second settings home.

**Verify BE-0:** `npx tsx --test src/lib/stations/procedure-divergence.guard.test.ts` plus the new
`photo-aspect-vocabulary.guard.test.ts`. No DB, no UI.

---

## BE-1 · Migration A — `photos.photo_aspect`

`src/lib/migrations/2026-08-0Xa_photo_aspect.sql`

```sql
BEGIN;

ALTER TABLE photos ADD COLUMN IF NOT EXISTS photo_aspect TEXT;

DO $$ BEGIN
  ALTER TABLE photos ADD CONSTRAINT photos_photo_aspect_chk
    CHECK (photo_aspect IS NULL OR photo_aspect IN (
      'shipping_label','box_exterior','box_interior','packing_material',
      'included','serial','front','back','side','bottom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The gate query is "does THIS carton/line have >=1 shot of aspect X".
-- Org-led, partial on NOT NULL: every pre-existing row is NULL and would
-- otherwise sit in an index nothing queries.
CREATE INDEX IF NOT EXISTS idx_photos_org_aspect
  ON photos (organization_id, photo_aspect)
  WHERE photo_aspect IS NOT NULL;

COMMIT;
```

- **No backfill.** Existing photos are genuinely unclassified; guessing an aspect from `photo_type`
  would manufacture evidence claims that no operator made.
- **Nullable, no default** — see D2 and `polymorphic-tables.md`.
- Model it in `src/lib/drizzle/schema.ts` **in the same change** (point 8 of the polymorphic
  contract), with the CHECK values in a comment.
- `photos` already carries `organization_id` + FORCE RLS; no `enforce_tenant_isolation` call needed
  for an ALTER.

---

## BE-2 · The write + read waist

### 2a. `POST /api/receiving-photos`

Accept optional `photoAspect`. Validate **in the route, before the domain call**:

```
parsePhotoAspect(body.photoAspect) → null when absent  → legal (unclassified)
                                   → unknown string    → 400, never silently dropped
isAspectLegalForStage(aspect, stage) === false          → 400
```

The stage is already resolved from the entity by `receivingUploadStage` (entity wins). Aspect
validation runs **against that resolved stage**, not the caller's claimed one — otherwise a caller
that mis-claims the stage also gets to mis-claim the aspect.

Thread it through `src/lib/photos/service.ts` to the `photos` INSERT. `recordAudit` on the existing
action; **do not add a new AUDIT_ACTION** (dashboards key off the existing values).

### 2b. `GET /api/receiving-photos`

Add `?photoAspect=` (single value) and `?photoAspects=a,b` (set). Compose the existing
`photoIntent` filter — aspect **narrows within** an intent, it never replaces it. A request with an
aspect illegal for the requested intent returns `[]`, not a 400: a read asking a coherent question
that has no answer is empty, not malformed.

### 2c. Counts — `src/lib/receiving/photo-aspect-counts.ts` (new)

```ts
export async function cartonAspectCounts(deps, orgId, receivingId): Promise<Partial<Record<PhotoAspect, number>>>;
export async function lineAspectCounts(deps, orgId, receivingLineId): Promise<…>;
```

One grouped query each (`GROUP BY photo_aspect`), org-scoped, inside `withTenantTransaction`.
`Deps`-injected per `backend-patterns.md` so the unit test runs with zero DB.

**Do not add a per-aspect count to the hot receiving list SQL.** The stack reads counts for the
**open carton only**; folding ten aspect counts into the queue query is the kind of altitude
regression `build-gotchas.md` catalogues.

### 2d. Extend `resolveReceivingPhotoTarget`

`src/lib/receiving/photo-scope.ts` gains `aspect` on its input and output. It stays **strict** —
throwing on an incoherent scope — because it is the resolver new capture wiring composes. The
lenient sibling `effectiveReceivingPhotoStage` is unchanged.

---

## BE-3 · Migration B — the two missing facts

`src/lib/migrations/2026-08-0Xb_unbox_step_stamps.sql`

```sql
BEGIN;

-- Condition: `condition_grade` is NOT NULL with a default, so "graded" and
-- "never touched" are indistinguishable today. These make the act visible.
ALTER TABLE receiving_line_testing
  ADD COLUMN IF NOT EXISTS condition_graded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS condition_graded_by INTEGER REFERENCES staff(id) ON DELETE SET NULL;

-- Contents: nothing records that a human read the item list before working it.
ALTER TABLE receiving_unbox
  ADD COLUMN IF NOT EXISTS contents_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contents_confirmed_by INTEGER REFERENCES staff(id) ON DELETE SET NULL;

COMMIT;
```

- **No backfill.** A stamp is a statement that a person did something at a time. Backfilling
  `condition_graded_at := updated_at` would assert an act that may never have happened — the same
  falsifiable tick D4 exists to prevent. Pre-existing cartons show those steps pending, which is the
  honest answer, and they are reachable in one tap.
- `condition` is a **line-level** fact → `receiving_line_testing` (the existing condition home per
  the procedure declaration's `writes`). `contents` is a **carton-level** fact → `receiving_unbox`.
  Do not hoist either; that is the note/label grain mistake in a new shape.

### 3a. Writers

| Route | Change |
|---|---|
| `POST /api/receiving/lines/[id]/condition` | stamp `condition_graded_at = now()`, `condition_graded_by = ctx.staffId` on every successful grade write |
| `POST /api/receiving/[id]/contents-confirm` | **new.** `withAuth(..., { permission: 'receiving.edit' })` → stamp → `recordAudit` |
| both | a **reopen** clears the stamp: `PATCH` with `{ reopen: true }` sets it back to NULL |

Reopen is what makes the receipt's "open again to edit" bar honest — it does not hide the fact, it
retracts it, and the audit trail keeps both events.

---

## BE-3b · Skip waivers (INDEX D10)

### The reason vocabulary — compose the Class-D engine, do not invent an enum

`src/lib/receiving/step-skip-reasons.ts` (new), modelled **exactly** on
`src/lib/receiving/serial-absent-reasons.ts`: a code-default list, a `BY_CODE` map, and a resolver
that lets org rows from `reason_codes` override the defaults.

```ts
export const STEP_SKIP_REASON_FLOW = 'unbox_step_skip' as const;
// defaults: NOT_APPLICABLE · ALREADY_DOCUMENTED · NO_DAMAGE_TO_RECORD · TIME_CRITICAL
```

Seed migration `2026-08-0Xc_reason_codes_unbox_step_skip_seed.sql`, idempotent per org on the
composite natural key `(organization_id, flow_context, code)`.

> ### ⚠ The `reason_codes_flow_context_chk` hazard — read `2026-07-29i`'s header before writing DDL
>
> Adding a `flow_context` value requires redefining that CHECK, and this constraint has a documented
> history of migrations **dropping values a previous migration added** — five migrations touched it
> and the tree was only saved because the last-sorting filename happened to re-affirm the full union.
> `2026-08-01a` ships **no DDL at all** for exactly this reason.
>
> So: read the live union first (`\d+ reason_codes`, or the newest migration that redefines it),
> then `DROP CONSTRAINT IF EXISTS` and re-`ADD` it with **every existing value plus
> `'unbox_step_skip'`**. Losing `'serial_absent_reason'` here breaks the serial waiver on every
> carton in the product.

### The waiver store — `receiving_step_waivers`

A skip is a human judgement and is derivable from nothing, so unlike completion (D4) it must be
stored. New typed-fact table per `.claude/rules/polymorphic-tables.md`:

```sql
CREATE TABLE IF NOT EXISTS receiving_step_waivers (
  id                 BIGSERIAL PRIMARY KEY,
  organization_id    UUID NOT NULL,              -- no DEFAULT; helper installs it
  receiving_id       INTEGER NOT NULL REFERENCES receiving_carton(id) ON DELETE CASCADE,
  -- NULL for a carton-level step; set for a perUnit step (condition, item_photos)
  receiving_line_id  INTEGER REFERENCES receiving_line(id) ON DELETE CASCADE,
  step_key           TEXT NOT NULL,
  reason_code        TEXT NOT NULL,              -- reason_codes.code @ flow 'unbox_step_skip'
  note               TEXT,                       -- only when the code sets requires_note
  waived_by          INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  waived_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_receiving_step_waivers_natural
  ON receiving_step_waivers (organization_id, receiving_id, COALESCE(receiving_line_id, 0), step_key);
```

- **Real FKs, both cascading** — the table has two non-polymorphic parents, so it takes option (a) of
  the parent-delete contract. No trigger family needed.
- `enforce_tenant_isolation('receiving_step_waivers')` in the **same** migration; model it in
  Drizzle in the same change.
- `step_key` is **not** CHECK-constrained: the vocabulary lives in `procedure.ts` and is
  PR-reviewed code, and a DB CHECK would need a migration every time a step is renamed. The
  `procedure-skip-contract.guard.test.ts` guard is the enforcement.
- The unique index makes a re-skip an upsert, so double-tapping Skip is a no-op rather than a
  second row.

### Writers

| Route | Behaviour |
|---|---|
| `POST /api/receiving/[id]/steps/[key]/skip` | validate `key` is declared **and** `skip: 'waiver'`; validate `reason_code` against the org's `unbox_step_skip` vocabulary; upsert; `recordAudit` |
| `DELETE` on the same path | un-skip — deletes the row and returns the pointer to that step |
| `serial` | **routes to the existing** `serial_absent` writer. The skip route 400s on `step_key = 'serial'` with a message naming the right endpoint — a redirect in the code is how two stores quietly appear |
| `skip: false` steps | 400 |

**A skip writes nothing but the waiver.** It never touches `condition_graded_at`,
`contents_confirmed_at`, a photo row, or a status. It never calls `transition()`. If it did, the
distinction between done and skipped would exist only in the UI.

---

## BE-4 · The receipt read model

`src/lib/receiving/procedure-receipt.ts` (new)

```ts
export interface ProcedureStepReceipt {
  key: string;
  label: string;
  state: 'done' | 'active' | 'pending' | 'skipped';
  /** Server-attested completion OR waiver instant. NULL when pending. */
  at: string | null;
  byStaffId: number | null;
  byStaffName: string | null;
  /** Operator-facing one-liner: "4 photos · shipping label, box". */
  detail: string | null;
  /** Device shutter clock when it exists and differs — SECONDARY, never `at`. */
  capturedAt?: string | null;
  /** Populated only when `state === 'skipped'` — the waiver's own record. */
  skip?: { reasonCode: string; reasonLabel: string; note: string | null };
}

export async function resolveUnboxProcedureReceipt(
  deps: Deps, orgId: OrgId, receivingId: number,
): Promise<{ steps: ProcedureStepReceipt[]; closedAt: string | null; }>;
```

**It derives; it never reads a stored step state.** Per step:

| Step | `at` from |
|---|---|
| `classify` | `audit_logs` entry for the classify PATCH, else `receiving_triage` |
| `arrival_check` | earliest `photos.created_at` at `arrival_package` |
| `shipping_label_photo` · `box_photo` · `packing_material` | earliest `photos.created_at` for that aspect at `unbox_carton` |
| `contents` | `receiving_unbox.contents_confirmed_at` |
| `condition` | `receiving_line_testing.condition_graded_at` |
| `item_photos` | latest `photos.created_at` across the **required** aspects (the step completes when the last one lands) |
| `serial` | latest `serial_units.created_at` on the line |
| `print` · `receive` | `receiving_line_testing.label_printed_at` · `receiving.received_at` |

`closedAt` is `receiving.received_at` — the receipt covers the surface only when that is set.

**Done beats skipped.** If a step carries a waiver *and* its fact later exists (the operator skipped
the box photo, then shot one anyway), it reports `done`. The waiver row stays for the audit trail but
does not describe the outcome — the work happened.

### 4a. The pointer resolver — `src/lib/receiving/procedure-pointer.ts` (new)

Pure, no I/O, imported by the receipt **and** the stack (INDEX D11):

```ts
export function resolveActiveStep(
  steps: ReadonlyArray<{ key: string; done: boolean; skipped: boolean }>,
  opts?: { focusedKey?: string | null },
): string | null;
```

Operator focus wins; else the first step that is neither done nor skipped; else `null` (everything
settled → the receipt takes the surface). Unit-tested with no DB.

### 4b. The receive-gate warning

The receipt route also returns `blockedBy: string[]` — the server-side gates that would currently
refuse `mark-received-po` (`photo-policy.ts` `require_one`, missing serials under an enforcing org,
…). **Skips do not appear here and do not clear it.** This is what lets the UI tell the operator
"skipping this leaves receive blocked" at the moment of skipping, instead of at the end of the
carton (INDEX D10 rule 4).

**Route:** `GET /api/receiving/[id]/procedure-receipt`, `{ permission: 'receiving.view' }`, thin per
the house skeleton. Register the permission in `permission-registry.ts` **and**
`route-permission-manifest.test.ts` in the same change, or `npm run verify` fails on drift.

**Guard:** `procedure-receipt-derivation.guard.test.ts` — for a fixture carton, every step the
receipt calls `done` is also `done` in `deriveProcedureSteps`, and vice versa. One answer, two
readers; the day they disagree, the operator is told two different things about the same box.

---

## BE-5 · Serial OCR — `POST /api/receiving/identify-serial`

Mirror `/api/receiving/identify-label` exactly:

- Body `{ receivingId, receivingLineId, reads: string[] }` — **text the LAN box already produced.**
  No image ever reaches this route, same as the label path. Say so in the docblock.
- Normalize each read through the existing serial vocabulary (`classifyInput` in
  `src/lib/scan-resolver.ts`), drop anything that classifies as tracking/FNSKU/SKU.
- Return `{ candidates: [{ serial, normalized, alreadyOnLine, alreadyOnAnotherLine }] }`.
- **Read-only.** Attaching a serial stays `POST /api/receiving/scan-serial`. OCR proposes; the
  operator commits (D7).
- `{ permission: 'receiving.view' }` — it reads, and gating it behind `receiving.edit` would deny
  the read to a floor operator the surface is built for (the `integrations.zendesk` lesson).

`GET /api/vision-config` is unchanged — one box URL, already org-gated, already returning `''` when
unconfigured so the UI hides the affordance.

---

## Verification

```bash
npx tsx --test src/lib/photos/photo-aspects.test.ts
npx tsx --test src/lib/receiving/procedure-receipt.test.ts
npm run verify
```

- `npm run verify` green; **no ratchet baseline raised**.
- Migrations applied via the `/db-migrate` skill, never `db:push`.
- E2E on the **QA org**: extend `unbox-procedure-checklist.spec.ts` (it already asserts the arrival
  vs bench-carton distinction) rather than orphaning it.

## Risks

| Risk | Mitigation |
|---|---|
| Aspect becomes a second, drifting stage vocabulary | `photo-aspect-vocabulary.guard.test.ts` asserts the TS union and the DB CHECK list are identical |
| **The flow-context CHECK redefinition drops `serial_absent_reason`** and breaks the serial waiver product-wide | Read the live union first; re-affirm every value in the `ADD CONSTRAINT`. This has already happened on this constraint — see `2026-07-29i`'s header |
| Skip becomes a silent bypass of the receive gate | Skips are pointer/waiver acts only; `blockedBy` is computed from the real gates and is unaffected by waivers (BE-4b) |
| A second serial waiver store appears | The skip route 400s on `step_key = 'serial'`; `procedure-skip-contract.guard.test.ts` pins it |
| Gating `condition` stalls cartons (D5) | Default grade pre-selects; satisfying it is one tap. Measure on the dogfood tenant before widening required item aspects |
| The receipt and the stack disagree | `procedure-receipt-derivation.guard.test.ts` |
| Per-aspect counts leak into the queue query | Counts are carton-open only; a `neon-cost-reviewer` pass on BE-2 |
