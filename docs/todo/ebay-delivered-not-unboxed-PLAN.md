# Delivered · not unboxed — SLA, claim window, and loss resolution

**Status:** Phases **1–5 all landed** (uncommitted, 2026-07-29). 51 unit tests across 5 new files.

**Phase 2's seed migration is APPLIED** (`2026-07-29i`, 2026-07-30 05:58Z) and verified live: all four loss codes
seeded across 8 orgs at sort_order 120/130/140/150, exactly one ledger entry (no stale row from the pre-rename `f`
name), and the photo codes still sit at 80–110 — the desync the append-at-end decision was designed to prevent did not
occur.

Two things remain deliberately **not live**, each needing a human action:
1. Phase 4's cron ships **DISARMED** (`RECEIVING_CLAIMS_ESCALATION` defaults false) → dry-run it, then arm.
2. Phase 3's write-off route has **no UI caller** → see the end of *Phase 5 — what landed*.

**Research input:** [`ebay-delivered-not-unboxed-RESEARCH-BRIEF.md`](ebay-delivered-not-unboxed-RESEARCH-BRIEF.md) + the
Gemini Pro gap analysis it produced. This doc is the *corrected*, code-grounded translation of that analysis —
three of its concrete mappings were wrong against this codebase and are fixed below (§2).

**Scope:** the existing `delivered-not-unboxed` feed (`src/lib/receiving/delivered-not-unboxed.ts`). eBay-purchased
inbound gets the claims-window half; the SLA/banding half applies to the whole feed.

---

## 1. What the research confirmed (no change needed)

| Finding | Verdict |
|---|---|
| Free 15-min adaptive carrier polling is standard; carrier tracking is the correct primary trigger | **Keep as-is.** `/api/cron/shipping/sync-due` is already this. No paid aggregator. |
| `delivered-unscanned` (never scanned) vs `delivered-not-unboxed` (scanned, stuck mid-unbox) is the right split | **Keep as-is.** Matches WMS "received not putaway"; the `was_scanned` flag already carries it. Do **not** rename to WMS vocabulary — this app's `ARRIVED/MATCHED/UNBOXED` registry is the SoT. |
| Marketplace order status is a *fallback*, needed only at claim time | **Keep as-is.** eBay data is pulled at ingest (`/api/cron/ebay/purchase-sync`); no new post-purchase poll. |
| D2S SLA of 24/48h, banded not flat | **Adopt.** §3 row 1. |
| A hard "claim-by" date, tracked separately from the internal SLA clock | **Adopt.** §3 row 2. |

---

## 2. Three corrections to the Gemini plan

These would have failed at implementation time.

### 2.1 The state machine is `transitionReceivingLine()`, not `transition()`

Gemini pointed at `src/lib/inventory/state-machine.ts` (serial-unit `transition()`). A **receiving line** has its own
guarded chokepoint: `transitionReceivingLine()` in [`src/lib/receiving/state-machine.ts`](../../src/lib/receiving/state-machine.ts),
over `inbound_workflow_status_enum`. `receive-line.test.ts` asserts *"receive-line.ts must not assign workflow_status in
SQL — call transitionReceivingLine()"*. Any lifecycle write here goes through that function.

### 2.2 `FAILED` is the WRONG terminal state — it would record three lies

Gemini proposed transitioning a lost package to `FAILED`. In this schema:

- `FAILED` in [`workflow-stages.ts`](../../src/lib/receiving/workflow-stages.ts) means **failed a QC test**
  (`phase: 'TERMINAL'`, `order: 6`, `label: 'Failed'`) — not "never arrived."
- `FAILED` derives to **coarse `RECEIVED`** (`WORKFLOW_TO_COARSE.FAILED = 'RECEIVED'`).
- Coarse `RECEIVED` makes `transitionReceivingLine()` stamp **`received_at = NOW()`**
  (`CASE WHEN $3 = 'RECEIVED' THEN COALESCE(received_at, NOW())`).

So a package that never physically materialized would be recorded as tested-and-failed, coarse-received, with a
`received_at` timestamp — corrupting received-throughput metrics and making it drop off this feed as *received*
rather than as *written off*.

**The correct model is already in the code**, stated in `workflow-stages.ts:152`:

> `PROBLEM` is NOT a value here — it is an **ORTHOGONAL exception dimension** … so a line can be `SCANNED` + `PROBLEM`.

A lost package therefore **keeps its lifecycle status** (`EXPECTED`/`ARRIVED`/`MATCHED`) and sets
`receiving_line.exception_code`. `transitionReceivingLine()` already accepts `exceptionCode` and writes it in the same
transaction, and an **identity transition is explicitly a legal no-op** (`if (from === to) return { ok: true }`) that
still emits the `inventory_events` row. So loss resolution needs **zero new state, zero new edges, zero new column** —
it is an identity transition carrying an exception code.

**Consequence: no state-machine change ⇒ that Ask-first gate disappears.**

> **Superseded in Phase 3 (for the better).** The diagnosis above stands — `FAILED` is
> the wrong state and the exception is orthogonal to the lifecycle. But the proposed
> *mechanism* (an identity `transitionReceivingLine()` writing
> `receiving_line.exception_code`) was itself replaced once `receiving_exceptions` was
> read properly: that table already carries an OPEN/RESOLVED lifecycle and a
> `resolveReceivingExceptions()` helper, so the write-off needs **no transition at all**
> and is reversible for free. See *Phase 3 — what landed*.

### 2.3 Root cause is a `reason_codes` sub-vocabulary, not a new field — and the seed order is a trap

Root cause belongs in the existing [`exception-codes.ts`](../../src/lib/receiving/exception-codes.ts) registry under
`flow_context = 'receiving_exception'` (guard `reason-codes.guard.test.ts`, **baseline 0**, will hard-fail a hardcoded
array anywhere else).

**The trap:** `seedOrgCatalog` assigns `sort_order` by **array position** (10, 20, …), and migration
`2026-07-29b_reason_codes_photo_policy_override_seed.sql` **hardcodes 80/90/100/110** for the photo codes to match that
walk. Inserting new codes into `OSD_EXCEPTION_CODES` — where they logically belong — shifts the photo codes to 120–150
and silently desyncs existing orgs from new ones.

**Therefore:** add a **third sub-vocabulary appended at the END** of the composed array, exactly mirroring how
`PHOTO_POLICY_OVERRIDE_CODES` was introduced (its own narrow, route-validated slice). New codes take 120/130/140/150.

Also: `createSupportTicket()` (`src/lib/support/create-ticket.ts`), not `createTicket()`.

---

## 3. The plan

| # | Concern | Industry practice | Codebase mapping | Concrete change |
|---|---|---|---|---|
| 1 | **SLA banding** | D2S 24h / 48h bands, not a flat window | `ReceivingLineRow.delivered_age_band` **already exists** (`receiving-line-row.ts:163`) and `receiving-delivered-unscanned.ts` populates it + sets `is_priority: age_band === 'gt_48h'`. The not-unboxed adapter hardcodes `is_priority: false` and never sets the band. | Project `deliveredUnscannedAgeBandSql('stn.delivered_at')` (already exported from `delivered-unscanned.ts`) in `listDeliveredNotUnboxed`; populate `delivered_age_band` + `is_priority` in `deliveredNotUnboxedToRow`. **No new row field, no new SQL helper.** |
| 2 | **Claim window** | Hard claim-by date, separate clock from the SLA | `mirror.expected_delivery_date` + `stn.delivered_at` are already projected | Add computed `claim_by_date` to `listDeliveredNotUnboxed`: `COALESCE(mirror.expected_delivery_date, stn.delivered_at::date) + interval '30 days'` for eBay lines (eBay MBG: 30 days from latest estimated delivery), NULL for Zoho PO lines. Surface as a countdown chip. |
| 3 | **Window ≠ claim window** | Exception must stay visible *past* the claim deadline | `DELIVERED_NOT_UNBOXED_WINDOW_DAYS = 30` **exactly equals** the eBay claim window — a carton ages out of the feed the same day the claim expires, with zero warning margin. This is the "quietly drops cartons" risk, and it is real. | Widen to `45`. Cheap, no schema change, keeps the expired-claim tail auditable. |
| 4 | **Escalation** | Dashboard-first; push only near a hard deadline (avoid alert fatigue on a small team) | `createSupportTicket()` + `enqueueTicketWork()` outbox (`/api/cron/ticket-outbox`, every 5 min) already exist | New daily cron `/api/cron/receiving/claims-escalation`: for `inbound_source_type = 'ebay'` rows with `claim_by_date - NOW() <= 5 days` and no existing linked ticket, `createSupportTicket()` anchored on the carton. **One ticket per line, ever** — idempotency via `idempotencyKey` (already a `CreateSupportTicketInput` field) keyed on `receiving_line_id`. |
| 5 | **Loss resolution + root cause** | Terminal write-off with a captured root cause | Identity `transitionReceivingLine()` + `exceptionCode` (§2.2) | New `LOSS_EXCEPTION_CODES` sub-vocabulary appended at the end of `RECEIVING_EXCEPTION_CODES`: `LOST_IN_TRANSIT`, `EMPTY_BOX`, `MISDELIVERED`, `STOLEN` + `RECEIVING_EXCEPTION_META` entries. Seed migration `2026-07-29i_reason_codes_loss_seed.sql` at sort_order 120–150, modeled byte-for-byte on `2026-07-29b` (DDL-free, `ON CONFLICT DO NOTHING`, no touching `reason_codes_flow_context_chk`). |
| 6 | **Feed exit rule** | A resolved exception leaves the queue | — | Add `AND rl.exception_code IS DISTINCT FROM ALL(<LOSS_EXCEPTION_CODES>)` to `listDeliveredNotUnboxed` **only** — do *not* put it in the shared `NOT_UNBOXED_PREDICATE`, which has other consumers. |
| 7 | **Auditability** | Exception lifecycle is auditable | `transitionReceivingLine()` emits `inventory_events` (anchored `receiving_line_id`); route calls `recordAudit()` | Free — the identity transition already writes the event with `payload.exception_code`. The Timeline tab reads `inventory_events`, so the write-off appears in carton history with no new plumbing. |
| 8 | **UI surface** | Supervisor observe surface | **Monitor** region contract (observe, no durable selection) | Extend the existing `DashboardReceivingKpiStrip` / Incoming tiles with the band + claim countdown. The escalation action **hands off to a Workbench ticket** — it does not grow a new pick+edit region. Per `display/workbench.md`, an axis value that owns no table is not a tab. |

### Known caveat — write-off is not reversible through this path

`transitionReceivingLine()` sets `exception_code = COALESCE($5, exception_code)` — it can **set** but never **clear**.
Un-writing-off a package that turns up later needs a separate deliberate path (a nulling update through a new
`clearExceptionCode` arg, or a dedicated route). **Do not** discover this in production: decide it in Phase 3 or
explicitly defer it in writing.

---

## 4. Phasing

| Phase | Content | Gate |
|---|---|---|
| **1 — read-only** | ✅ **LANDED** (see below). Rows 1–3: age band, `claim_by_date`, window 30→45. | none |
| **2 — vocabulary** | ✅ **LANDED + APPLIED** (see below). Row 5 registry + seed migration. | none |
| **3 — resolution** | ✅ **LANDED** (see below). Rows 5–6 write path + reversibility. | none — did not need Phase 2 applied |
| **4 — escalation** | ✅ **LANDED, DISARMED** (see below). Row 4 cron + `vercel.json` entry. | flag must be flipped to arm |
| **5 — UI** | ✅ **LANDED** (see below). Row 8. | none |

Phase 1 is independently valuable and carries no gate: it makes the aging visible and the claim deadline legible
without touching schema, the state machine, or ticketing.

### Phase 1 — what landed (2026-07-29)

| File | Change |
|---|---|
| [`delivered-not-unboxed.ts`](../../src/lib/receiving/delivered-not-unboxed.ts) | Window 30→**45**; new `EBAY_CLAIM_WINDOW_DAYS = 30`; new pure `ebayClaimByDateSql()`; `age_band` + `claim_by_date` projected in `listDeliveredNotUnboxed`; **`tenantQuery` made a lazy import** (below) |
| [`receiving-delivered-not-unboxed.ts`](../../src/components/station/receiving-delivered-not-unboxed.ts) | Adapter populates `delivered_age_band`, `claim_by_date`, and `is_priority = age_band === 'gt_48h'` (was hardcoded `false`) |
| [`receiving-line-row.ts`](../../src/components/station/receiving-line-row.ts) | New optional `claim_by_date` field (additive — no producer breaks) |
| `delivered-not-unboxed.test.ts` | **New**, 7 tests, DB-free |

**Unplanned but rules-mandated:** `tenantQuery` moved from a top-level to a lazy `await import()`, mirroring the
delivered-unscanned sibling. Reason: the top-level import instantiated the Neon pool at module load, so the module's
pure SQL fragments were untestable (`src/lib/db.ts` needs a live `DATABASE_URL`). This is the
`build-gotchas.md` → *bundle altitude* fix — a light helper must not drag a heavy module behind it.

**Deliberately NOT done:** the claim clock is not folded into `is_priority`. Two feeds share that flag; giving it a
second meaning in one of them would make the Prioritize sort mean different things per facet. The claim deadline gets
its own display in Phase 5.

**Verified:** `npx tsc --noEmit` clean · 7/7 new + 5/5 sibling tests green · `npm run verify` — all gates green for these
files (the red Lint/knip gates are another session's untracked `src/components/counter/` work, confirmed by re-run:
its two lint errors were fixed by that session mid-session) · live query against the dogfood org returns HTTP 200 with
`window_days: 45`, both new columns present, and a real `age_band: 'gt_48h'` · `getDeliveredNotUnboxedCount` still
agrees with `list.length`.

**Residual, honestly:** the eBay branch of the `CASE` has **no rows in the current window**, so its *value* semantics
are structurally tested but not numerically observed against live data. Its *types* are proven — Postgres type-checks
the full `CASE` at plan time, and the query planned and executed. Confirm a real `claim_by_date` value the first time
an eBay purchase lands in this lane.

### Phase 2 — what landed (2026-07-29)

| File | Change |
|---|---|
| [`exception-codes.ts`](../../src/lib/receiving/exception-codes.ts) | New `LOSS_EXCEPTION_CODES` (`LOST_IN_TRANSIT`, `EMPTY_BOX`, `MISDELIVERED`, `STOLEN`) appended **last**; `isLossExceptionCode()` narrow guard; 4 `RECEIVING_EXCEPTION_META` entries; header now documents the array-position ⇒ `sort_order` contract |
| [`2026-07-29i_reason_codes_loss_seed.sql`](../../src/lib/migrations/2026-07-29i_reason_codes_loss_seed.sql) | **New.** DDL-free per-org seed at 120–150, modeled on `2026-07-29b`. Does not touch `reason_codes_flow_context_chk`. **Applied 2026-07-30.** |
| `exception-codes.test.ts` | **New**, 8 tests — a genuine cross-artifact guard (below) |

**✅ APPLIED 2026-07-30 05:58Z**, verified live: 4 codes × 8 orgs at 120/130/140/150, exactly one ledger entry (no
stale row under the pre-rename name), and the photo codes still at 80–110 — the desync this whole ordering discipline
guards against did not occur. It landed as `2026-07-29i`: `f`, `g`, and `h` were each claimed by other sessions'
migrations while this was being written (on top of the pre-existing `2026-07-29b` collision), so the letter was
reassigned before apply.

**Safe to leave unapplied.** The receiving-exception vocabulary is behavior-bearing on the **TypeScript** side —
labels/tones come from `RECEIVING_EXCEPTION_META` and validation from `isLossExceptionCode`. `reason_codes` rows exist
only so tenants can *see and relabel* codes in the Admin manager. So pre-application the four codes simply don't appear
in that manager; nothing breaks and no code path 500s.

**The test is a real guard, not a tautology.** It parses all three seed migrations and asserts every hardcoded
`sort_order` equals `(array index + 1) × 10` — the exact desync that splicing a code mid-array causes. Verified
non-vacuous by simulation: splicing the loss block before the photo block moves the photo codes from 80–110 to
120–150 and the assertion fires. It also asserts **every registry code has a backfill seed**, which catches the
`RETURN_NO_ORDER` class of bug (in the registry since the returns work, but omitted by `2026-06-28d`, so
pre-existing orgs never got it until `2026-07-29b` closed the gap).

**One knip-driven correction:** `LossExceptionCode` was initially exported, which knip correctly flagged as dead code
(no consumer yet). Rather than baseline it, the type is now module-private — `isLossExceptionCode` still narrows fine.
**Phase 3 should re-export it** alongside the route that annotates with it.

**Verified:** `npm run verify` **fully green** (all 8 gates, including the reason-codes guard at baseline 0 and knip
with no new findings) · 8/8 new tests, auto-discovered by verify's unit suite.

### Phase 3 — what landed (2026-07-29)

| File | Change |
|---|---|
| [`loss-writeoff.ts`](../../src/lib/receiving/loss-writeoff.ts) | **New** domain module modeled on `photo-policy-override.ts`: `parseLossCode`, `normalizeLossNote`, `lossWriteoffInvalidBody`, `recordLossWriteoff`, `reopenLossWriteoff` |
| [`lines/[id]/loss/route.ts`](../../src/app/api/receiving/lines/[id]/loss/route.ts) | **New.** `POST` writes off, `DELETE` reopens. House skeleton: gate → validate → domain helper → 404/400/200 → `recordAudit` → `after()` |
| [`exception-codes.ts`](../../src/lib/receiving/exception-codes.ts) | New `NO_OPEN_LOSS_EXCEPTION_PREDICATE` — the feed's exit rule, kept here because this module is dependency-free |
| [`delivered-not-unboxed.ts`](../../src/lib/receiving/delivered-not-unboxed.ts) | Exit predicate applied to **both** the count and list queries so they cannot disagree |
| [`audit-logs.ts`](../../src/lib/audit-logs.ts) | New `RECEIVING_LOSS_WRITE_OFF` + `RECEIVING_LOSS_REOPEN` actions; write-off added to `AUDIT_REASON_REQUIRED` |
| `loss-writeoff.test.ts` | **New**, 11 tests, DB-free via injected fakes |

**The mechanism changed for the better — and it removed a gate.** Reading `exceptions.ts` properly showed
`receiving_exceptions` already has `status` OPEN/RESOLVED plus `resolveReceivingExceptions()`. So a write-off is one
OPEN exception row and **no lifecycle transition at all**, which means:

- **Reversibility is free**, not a follow-up. `DELETE` resolves the row and the line returns to the lane, because the
  exit predicate keys on `status = 'OPEN'`. The append-only row keeps the original write-off in history — it is a
  reopen, not a delete. The `COALESCE($5, exception_code)` "can set but never clear" problem simply never arises.
- **`transitionReceivingLine()` is untouched**, so the status-machine Ask-first gate never applied.
- Phase 2's migration header described the old identity-transition mechanism; **corrected in place**.

**Permission: reuses `receiving.mark_received` rather than minting `receiving.write_off`.** A fresh permission id is
not granted by `scripts/seed-roles.mjs` until that script is updated, so it would **403 every operator** — the trap
`integrations.zendesk` already hit on the support-vs-receiving link routes. An operator trusted to declare a carton
received is trusted to declare it lost. Splitting them is a follow-up that **must touch seed-roles in the same change**.

**Free text cannot be the justification.** `reason` is assembled server-side from the validated code + the carton's
delivery instant; the body never contributes to it (the `photo-policy-override.ts` rule). An optional operator `note`
is accepted into `support_notes` — capped at 500 chars — because a claim needs human evidence, but it can never stand
in for the code. Pinned by a test that passes `note: 'TOTALLY LEGIT JUSTIFICATION'` and asserts it does not appear in
`reason`.

**Reopen is scoped per code, never the resolve-all form.** `resolveReceivingExceptions(…, { exceptionCode: null })`
resolves *every* open exception on the line, so reopening would silently close an unrelated `DAMAGED` or `SHORT`
finding. The helper loops the four loss codes instead; a test asserts no call passes a null code.

**Second instance of the same bundle-altitude fix.** `loss-writeoff.ts` imports `./exceptions` **type-only** and
resolves the real writers via a lazy `realDeps()`, because `./exceptions` → `tenancy/db` is `server-only` and the test
crashed on import. That is now twice in this initiative (Phase 1 hit it too) — the rule earns its place.

**Verified:** 11/11 new tests green and running inside verify's suite · `npx eslint` on all 10 touched files: **0
problems** · route-permission manifest regenerated (`npm run audit-route-auth:emit`) and both route gates green ·
live read-only check: the feed and the summary count both return HTTP 200 with the new `NOT EXISTS` predicate, and
`count === list.length`.

**NOT exercised: the POST/DELETE write path against live data.** Doing so would create a real `receiving_exceptions`
row, an audit row, and a realtime event on a live carton in the dogfood warehouse — a fake "STOLEN" write-off on the
user's actual inventory. It needs either an explicit go-ahead on a chosen throwaway line, or a QA-org E2E spec
(`qa-desktop`, per [`verify.md`](../../.claude/rules/verify.md)). The domain logic is covered by the 11 unit tests; what
is unproven is the route wiring end-to-end.

**Tree state — read this before blaming a red gate on these phases.** `main` is being edited by several sessions
concurrently, so a full `npm run verify` was red on every run here, each time for *different* reasons in files these
phases never touched: a mid-edit syntax error in `CartonInspectionPage.tsx`, unused imports in `CounterIntakeForm.tsx`
and `orders-transfer.ts`, `string | null` type errors across four packing/orders routes, and DS-ratchet drift.

One finding deserves a specific note because it **names a file these phases did touch**: knip reports
`src/lib/audit-logs.ts → createAuditLog` as newly dead. That is not from this work — the diff to that file is
**24 insertions, 0 deletions** and never references `createAuditLog`. Another session migrated the last direct caller to
`recordAudit()` (which `backend-patterns.md` mandates), orphaning the export. Deleting or baselining it belongs to that
migration, not here.

### Phase 4 — what landed (2026-07-29)

| File | Change |
|---|---|
| [`claims-escalation.ts`](../../src/lib/receiving/claims-escalation.ts) | **New** domain module: `daysUntilClaimDeadline`, `selectEscalationCandidates`, `escalationAnchor/Subject/Note`, `escalationIdempotencyKey`, `runClaimsEscalationForOrg` |
| [`cron/receiving/claims-escalation/route.ts`](../../src/app/api/cron/receiving/claims-escalation/route.ts) | **New** daily cron: `isAuthorizedCronRequest` → `withCronLock` → `withCronRun` → per-org sweep |
| [`feature-flags.ts`](../../src/lib/feature-flags.ts) | New `isReceivingClaimsEscalation()` — **default OFF** |
| [`delivered-not-unboxed.ts`](../../src/lib/receiving/delivered-not-unboxed.ts) | Projects `receiving_id` (the line's own carton FK) so a ticket can anchor precisely |
| [`vercel.json`](../../vercel.json) | Cron entry, `0 16 * * *` (daily 09:00 PT) |
| `claims-escalation.test.ts` | **New**, 15 tests, DB-free, files no tickets |

**⚠ It ships DISARMED and that is the point.** This is the only path in the initiative that creates
**outward-facing** artifacts — real helpdesk tickets that may notify people. `RECEIVING_CLAIMS_ESCALATION` defaults to
false, so deploying the cron files nothing: it still sweeps daily and reports what it *would* file, under the same
`created` field a live run uses, so the arming decision is made on real numbers rather than a guess. Arm with
`RECEIVING_CLAIMS_ESCALATION=true` (env change needs a redeploy).

**Composes the lane's SoT instead of re-querying it.** Candidates come from `listDeliveredNotUnboxed()` — the same
query behind the tile, the list, and the count — so a carton can never be escalated while absent from the surface an
operator would open, and Phase 3's write-off removes it from both at once. Two consequences worth knowing: the lane's
`DELIVERED_NOT_UNBOXED_CAP = 100` bounds what a sweep can see, and the run has its own
`CLAIMS_ESCALATION_MAX_PER_RUN = 20`. **Both clamps are logged and counted, never silent** — a truncated sweep must not
read as "all clear".

**Design corrections made while building:**
- **The anchor shape was wrong in my first pass.** `TicketLinkAnchorInput` is `{ type: 'receiving'; receivingId; lineId? }`,
  not `{ entityType, entityId }`. Fixing it required projecting `receiving_id` — and specifically `rl.receiving_id`, not
  the joined `r.id`: the lane's `receiving_carton` join is a loose multi-condition match, so `r.id` can name a *sibling*
  carton and would have anchored tickets to the wrong box. Precedence is carton → tracking → unanchored-but-still-filed.
- **The flag read moved to the caller.** `feature-flags.ts:19` statically imports the Neon pool (`server-only`), so
  reading the flag inside the domain module made it unimportable from a test. `enabled` is now a **required** option on
  `runClaimsEscalationForOrg` (per `backend-patterns.md` — a safety classification is never defaulted), read by the cron
  route. Better design regardless: the domain function shouldn't own whether it is armed.
- **Expired claims are escalated, not dropped.** `daysRemaining < 0` still files, with different copy. They are past
  saving as a marketplace case, but the operator still needs to know the money is gone and to write the carton off —
  silently skipping them would hide the exact failure this initiative exists to surface. This is why Phase 1 widened the
  window to 45 days.

**Idempotent twice over:** the sweep skips any line with an existing primary support ticket, and the create carries a
**date-free, line-scoped** `idempotencyKey`. A test asserts the key contains no date — with one, a carton sitting due
would generate a fresh ticket every single day.

**Verified:** `npm run verify` **PASSED — all 8 gates, exit 0** · 15/15 new tests green · a provider failure on one
carton provably does not abort the remaining deadlines · cron auto-registered in the route manifest as a cron endpoint ·
`vercel.json` parses (40 crons).

**Not exercised live:** the cron needs `CRON_SECRET` (a secret this session did not read). Dry-run it yourself with:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3050/api/cron/receiving/claims-escalation?dryRun=1" | python3 -m json.tool
```

### Phase 5 — what landed (2026-07-29)

| File | Change |
|---|---|
| [`claim-window.ts`](../../src/lib/receiving/claim-window.ts) | **New**, zero-import presentation kind: `CLAIM_DUE_LEAD_DAYS`, `daysUntilClaimDeadline`, `claimCountdownFace` → `{ urgency, label, description, tone }` |
| [`claims-escalation.ts`](../../src/lib/receiving/claims-escalation.ts) | Deleted its private copy of the threshold + day math; **re-exports** them from `claim-window` |
| [`IncomingGridStatusCell.tsx`](../../src/components/station/incoming-grid/IncomingGridStatusCell.tsx) | Renders ONE urgency-ranked deadline token |
| `claim-window.test.ts` | **New**, 10 tests |

**One threshold, two consumers, provably.** The cron and the grid chip must agree on "due" — otherwise the cell reads
*fine* on a carton the cron just filed a ticket about. So the threshold and day math live in one zero-import module and
`claims-escalation` re-exports them. A test asserts `cronDays === daysUntilClaimDeadline` — **the same function
object**, not merely equal numbers.

**A measured defect, caught in the browser before it shipped.** The first version rendered the dwell marker *and* the
claim chip side by side. Measuring the real grid showed the STATUS track is **75px wide with `overflow: visible`**:
today's content fits at exactly 75px, and adding `CLAIM EXPIRED` pushed it to **144px**, which would have spilled over
the ORDER column rather than clipping — precisely the regression this cell's header already warns about. Fixed by giving
the two clocks **one urgency-ranked slot**: a due/expired claim (external, takes the money with it) outranks a 48h+
dwell breach (internal, recoverable) outranks a comfortable claim. The tooltip carries **both** facts, so nothing is
lost, and re-measurement confirms every label — including the widest, `EXPIRED` — fits in 75px. Two competing numbers in
a 75px cell were not scannable anyway.

**Correcting a Phase 1 overclaim.** Phase 1 said the age band's rendering path was "inherited from the shipped
sibling". That was wrong: `delivered_age_band` had **no renderer anywhere** — `delivered-unscanned` populates it but
only ever consumed `is_priority`. Phase 5 built the first display of it.

**Verified live** against the running dev server (attached, never started), with a real `gt_48h` row on screen:
- the `48h+` token renders in the STATUS track at **11px / weight 600 / IBM Plex Sans Condensed** with **no weight
  class in the markup** — the `role-eyebrow` binding supplying both, exactly as `ui-design-system.md` specifies;
- `color: rgb(180, 83, 9)` = `amber-700`; row height unchanged; **no console errors**;
- the claim token is correctly **absent** on that row — it is a Zoho PO, and the surface's own "EBAY ORDERS 0" tile
  corroborates there is no eBay row in the lane, so the eBay-only gating renders as nothing rather than as "CLAIM null".

**Residual:** with no eBay row in the lane, the claim token's *rendering* is unobserved live (its logic has 10 unit
tests, and it uses the identical JSX shape as the `48h+` token that was verified). Confirm on the first real eBay row.

### Phase 5b — the lane was unreachable by pointer (2026-07-30)

Owner-reported immediately after Phase 5: **"Delivered · not unboxed" was missing from the Incoming STATUS filter**, so
the only way onto the lane was hand-typing `?state=DELIVERED_NOT_UNBOXED`. Everything else already existed — the state
was in `IncomingDeliveryState`, the count in `IncomingSummary`, and the summary route returned it — but
`incoming-tiles.ts` had no `TileSpec`, and its header said so on purpose: *"`DELIVERED_NOT_UNBOXED` lives on Unbox KPI,
not this hunt strip."*

**That call was right when written and wrong now.** As a KPI readout it did not belong on a dock-hunt strip. After
Phases 1–5 the lane carries its own dwell SLA, an eBay claim deadline, an escalation cron, and a loss write-off — a
first-class inbound exception. A surface with that much machinery behind it that a pointer cannot reach is a bug, not
a design choice.

One `TileSpec` (rose + `PackageOpen`, matching the row icon in `ReceivingDeliveryStateIcon`), placed directly under
`DELIVERED_UNOPENED` so the two delivered-but-unprocessed buckets read as the pair they are. Both stale comments
corrected. **Verified live:** the option renders with its real count (1), clicking it navigates to
`/incoming?state=DELIVERED_NOT_UNBOXED`, the grid filters to `1-1 / 1` with the `48h+` marker on the row, no console
errors, `npm run verify` green.

**Still open — the write-off UI.** Phase 3's `POST/DELETE /api/receiving/lines/[id]/loss` has **no caller**. It was left
out deliberately: a destructive action needs a reason picker plus a confirm step, and wedging that into a 75px grid cell
would be worse than deferring it. That is the next piece of work, and until it exists an operator cannot write a carton
off from the UI.

**A recurring lesson, now three-for-three:** every phase hit the same trap — a light helper in a module that statically
imports something `server-only`, making it untestable. Phase 1 (`tenantQuery`), Phase 3 (`./exceptions`), Phase 4
(`feature-flags`). Also twice now a type was exported with no consumer naming it and knip correctly rejected it. Both
are worth a line in `build-gotchas.md` if a fourth instance appears.

**Isolated verification for these phases:** `npx eslint` on all touched files → **0 problems**; no typecheck error
names any of them; 26/26 new unit tests green inside verify's own suite; both route gates green after the manifest
regen. Re-run the failing gate against these files specifically before attributing a red to this work
([`verify.md`](../../.claude/rules/verify.md)).

---

## 5. Verification

- `npx tsx --test src/lib/receiving/state-machine.test.ts` — identity-transition-with-exceptionCode must emit exactly
  one event and must **not** stamp `received_at`.
- `npm run test:ds-guards` — confirms `reason-codes.guard.test.ts` stays at baseline 0 (the new codes live in the
  ALLOWED registry, so it should).
- `npm run verify` before done. Never raise a ratchet baseline.
- E2E, if added, asserts against the **QA org** (`qa-desktop`), never the dogfood tenant.

---

## 6. Ask-first items

1. **The seed migration** (Phase 2) — a live-table write, per `pattern-evolution.md`.
2. **The `vercel.json` cron entry** (Phase 4) — adds recurring production load; also note `2026-07-29b` **already has
   a filename collision** (two files share the letter), so the next free letter is **`f`**.

Explicitly **not** needed, contrary to the Gemini plan: a state-machine edge change, a new terminal status, or a new
root-cause column (§2.2, §2.3).
