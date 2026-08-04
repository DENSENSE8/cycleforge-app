# Hand-off — `triage_complete` has never been true, and the chain it kills

**For:** Claude Code / Cursor Agent
**From:** the 2026-08-02 carton-read §3.1 pass ([`carton-read-timeline-honesty-HANDOFF.md`](./carton-read-timeline-honesty-HANDOFF.md) §3.1)
**Status:** INVESTIGATED 2026-08-02 — see §0.5. The write path is proven working
end-to-end; a **separate** four-day outage was found and fixed. The product
decision in §2.3 is deliberately still open.
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050` (never start/restart it). User owns commits.

---

## 0.5. Investigation result (2026-08-02)

### The premise in §1 was half wrong, and the other half was hiding an outage

**The chain is not broken by the gate.** Driven end-to-end against the QA org:
`PATCH /api/receiving/[id]` persists `staging_location_id` + `priority_lane`, and
`POST /api/receiving/triage/complete` then returns `success:true` and writes
`triage_complete`, `triage_completed_at`, `triage_client_event_id`. Every line of
`completeTriage` works. **`StagingSection` is reachable and prominent** — the
*default* Classify tab of `/receiving?mode=triage`, plus its own Staging tab; no
flag, no permission gate, and dogfood has 16 active pickable bins in the picker.

**The 18 `priority_lane` rows are NOT evidence of operator use.** All 18 are
`PO_STOCKOUT` — exactly the non-return branch of `markReceivingPriority` in
[`lookup-po/route.ts:117`](../../src/app/api/receiving/lookup-po/route.ts), which
auto-stamps a lane server-side for cartons it flags priority. Zero
`PO_STANDARD` / `RETURN` / `HOLD`, which is what an operator pick or the
shelf-triggered auto-lane would produce. So §2's question "why did the shelf half
never ride along" has no interesting answer: **no server code assigns a shelf,
because a shelf is a physical human decision** — and there is no evidence any
operator has ever opened `StagingSection` at all. Both its fields sit at zero
human writes across 2474 rows.

### The `triage_outcome` signal was a DIFFERENT bug — the whole event spine was dead

Opening the gate did **not** produce a signal. `ops_events` had rejected every
insert since **2026-07-29 05:34:59**, for every tenant and every event type:

```
ERROR: column "payload" of relation "notification_outbox" does not exist
CONTEXT: PL/pgSQL function fn_enqueue_notification_outbox()
```

`2026-07-28d` pairs `CREATE TABLE IF NOT EXISTS notification_outbox` (declaring
`payload`) with `CREATE OR REPLACE FUNCTION` on its trigger. The table already
existed *without* `payload`, so the table guard yielded while the function guard
overwrote — the trigger advanced to a shape the table never reached. Applied
05:36:55, under two minutes after the last surviving event.

It stayed invisible for four days because every caller treats a spine write as
fire-and-forget by design: `recordEntitySignal` rolls back to
`SAVEPOINT entity_signal_emit` and `emitEntitySignalSafe` downgrades the throw to
a `console.warn`. That savepoint rollback also takes the `entity_signals` row with
it — which is the *real* reason `triage_outcome` had 0 rows, and it would have
kept having 0 rows no matter what happened to the gate.

**Fixed:** [`2026-08-02b_notification_outbox_payload.sql`](../../src/lib/migrations/2026-08-02b_notification_outbox_payload.sql)
(applied). Verified live: first `ops_events` row since 07-29, first-ever
`triage_outcome` signal, trigger populating `notification_outbox.payload`.

**Gate added so it cannot recur:** `scripts/schema-model-parity-guard.mjs`
(`npm run schema:model-parity:check`, wired into `verify` + CI) fails when the
Drizzle model declares a column the database lacks. The existing
`schema-drift-guard.mjs` is a *static text* scan for **dropped** columns and never
opens a connection, so it structurally could not have caught this. Five
pre-existing drift items are allowlisted with reasons in
`scripts/schema-model-parity-allowlist.json`; the list is **shrink-only** (an entry
that stops drifting fails the gate until deleted).

### Why no test caught it

`scripts/provision-qa-org.ts` seeds **no locations**, so the QA org's shelf picker
is empty and the PATCH 400s. Per [`verify.md`](../../.claude/rules/verify.md) E2E
asserts against the QA org — so no spec could ever have driven
staging → `triage_complete` → the metric. **Seed a location fixture before writing
coverage for this path.**

### Still open

§2.3 — whether the shelf gate is the right gate — is unchanged and still a product
call. It is now better informed: the step is reachable, the write path works, and
nobody performs it. Do not relax the gate merely to make the KPI render; that is
the defect class the parent hand-off exists to remove.

---

## 0. The finding, in one line

> **No carton on dogfood has ever been assigned a staging shelf, so the
> "Save for unbox" gate has never opened, so `triage_complete` has never been
> written — and four things downstream have been silently dead ever since.**

Measured 2026-08-02 against the whole dogfood tenant:

| Table / column | Value |
|---|---|
| `receiving_triage` rows | **2474** |
| `staging_location_id IS NOT NULL` | **0** |
| `priority_lane IS NOT NULL` | 18 |
| both (the readiness gate) | **0** |
| `triage_complete = true` | **0** |
| `triage_completed_at IS NOT NULL` | **0** |
| `entity_signals` where `signal_kind = 'triage_outcome'` | **0** |

Nothing is null-vs-false ambiguous here: `triage_complete` is `false` on all
2474 rows, never null.

---

## 1. The chain

`completeTriage` ([`src/lib/receiving/complete-triage.ts:112`](../../src/lib/receiving/complete-triage.ts)) gates on:

```ts
const ready = !!rt && rt.staging_location_id != null && rt.priority_lane != null;
if (!ready) return { ok: false, status: 422,
  error: 'Assign a shelf and a priority lane before saving for unbox.' };
```

`staging_location_id` is null on every row, so `ready` is never true, so the
route always 422s and line 152 (`triageComplete: true`) is unreachable in
practice. Everything below it inherits that:

| Downstream | State today |
|---|---|
| `triage_complete` | never written |
| `triage_outcome` entity signal (`complete-triage.ts:174`) | never emitted — 0 rows |
| `save_without_pair_rate` (`/api/receiving/triage/metrics`) | denominator 0 → **`null`** |
| `TriageKpiStrip` "Saved unpaired %" | returns `null` on a null rate → **has never rendered** |
| `resolveTriageFocus` → `'already-staged'` (`triage-focus.ts:43`) | unreachable branch |

**The metric predicate itself is now correct and is NOT what to fix** — it was
repaired in the same pass (`PAIRING_ANSWERED_STATES`, so `WAIVED` stops counting
as a skipped step). It is right for the day the denominator stops being zero.

---

## 2. What has to be decided (and by a person)

The write path exists and looks complete — `StagingSection.tsx` +
`useTriageStaging.ts` on the client, `PATCH /api/receiving/[id]` →
`triagePatch.stagingLocationId` ([route.ts:677](../../src/app/api/receiving/[id]/route.ts)) →
`upsertReceivingTriage` on the server. So this is not a missing feature; it is
**a shipped feature nobody uses, or one that cannot be reached.** Establish
which, in this order:

1. **Is `StagingSection` reachable on a real carton today?** Which route/tab
   mounts it, and is that surface gated behind a flag, a permission, or a mode
   the floor never opens? Start at its consumers, not at the component.
2. **Does the PATCH actually land?** Drive it once against the QA org
   (`pnpm provision:qa-org`) and re-read `receiving_triage.staging_location_id`.
   18 rows have a `priority_lane`, so *something* has written that column —
   find out what, and why the shelf half never rode along with it.
3. **Then, and only then, decide whether the gate is the right gate.** If the
   floor genuinely does not stage cartons to a shelf, requiring one before
   "Save for unbox" is a rule the operation does not follow, and the honest fix
   is to change the gate — not to nag operators into filling a field so a KPI
   can render.

**Do not "fix" this by relaxing the gate to make `triage_complete` writable.**
That would start producing a metric from a step nobody performs, which is the
same class of defect the parent hand-off exists to remove: a number that is
technically computed and means nothing.

---

## 3. Do not reopen

| Decision | Where |
|---|---|
| `WAIVED` is an ANSWER, so the metric counts the complement of `PAIRING_ANSWERED_STATES`, not `<> 'MATCHED'` | `triage-focus.ts` + `triage-focus.test.ts` |
| The metric's `COALESCE(rt.pairing_state,'UNFOUND')` stays — it is a filter over rows that already have a triage row, not an invented display value | `metrics/route.ts` docblock |
| `pairing_state` is no longer COALESCEd on display paths | `carton-read-timeline-honesty-HANDOFF.md` §3.2 |

---

## 4. Reproducing the numbers

Read-only, safe to re-run:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) rows, COUNT(*) FILTER (WHERE staging_location_id IS NOT NULL) shelf, COUNT(*) FILTER (WHERE priority_lane IS NOT NULL) lane, COUNT(*) FILTER (WHERE triage_complete) complete FROM receiving_triage;"
```

---

## End of hand-off
