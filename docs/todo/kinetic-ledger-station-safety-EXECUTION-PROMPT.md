# EXECUTION PROMPT — Kinetic Ledger Station Safety & DS Governance

> Paste everything below the horizontal rule into a fresh agent session at the repo root
> (`/Users/icecube/repos/cycleforge-app`). Prefer a strong reasoning model.
> **Default scope for a new session: Phase 1 only** unless the human names another phase.

**Plan SoT:** [`kinetic-ledger-station-safety-PLAN.md`](./kinetic-ledger-station-safety-PLAN.md)

---

# Cycle Forge — Kinetic Ledger Station Safety (executable)

You are executing the **Kinetic Ledger station-safety & DS governance** roadmap.

**Authoritative plan:** Read and follow
[`docs/todo/kinetic-ledger-station-safety-PLAN.md`](./kinetic-ledger-station-safety-PLAN.md)
end-to-end for the phase you are assigned. If this prompt conflicts with the plan, **the plan wins**
— except where the human explicitly overrides in chat.

**Product:** Cycle Forge multi-tenant reseller-ops SaaS (not “USAV tool”). USAV = dogfood tenant only.

**Phase 0 is already shipped** (2026-07-29). Do **not** re-implement Station honesty, CardShell
motion bridge, `/api/tech/serial` idempotency, or the `alert` / `station-motion-bridge` ratchets
unless you are fixing a regression.

## Default mission (this paste)

**Execute Phase 1 — Ubiquitous barcode-mutation idempotency** for:

1. `POST /api/orders/add`
2. `POST /api/packing-logs` (+ `/update` and `/api/packerlogs` if they are live write paths)

Stop after Phase 1 verify. If the human asks for Phase 2+ in the same chat, finish Phase 1 first
(or get explicit approval to parallelize Phase 2 only).

---

## Read first (in this order, before writing)

1. **`docs/todo/kinetic-ledger-station-safety-PLAN.md`** — phases, audit corrections, exit criteria
2. **`AGENTS.md`** + **`.claude/rules/workflow-safety.md`** (attach to `:3050`; never start/kill dev server)
3. **`.claude/rules/display/station.md`** §6–§7 (honest card ≠ hard-stop modal; client key must be honored)
4. **`.claude/rules/backend-patterns.md`** — route skeleton, tenant GUC, idempotency / `clientEventId`
5. **`.claude/rules/pattern-evolution.md`** — compose SoT; grow when wrong
6. **Gold idempotency path (copy this shape):**
   - `src/lib/api-idempotency.ts`
   - `src/app/api/receiving/mark-received-po/route.ts` (`claimOrReplay` / finalize)
   - `src/components/receiving/workspace/line-edit/hooks/useReceiveAction.tsx` (client UUID + header)
   - Phase 0 already-done: `src/app/api/tech/serial/route.ts` + wrappers
7. **Clients to update:**
   - Order create: `src/components/sidebar/dashboard-sidebar-hooks.ts` (`useShippedFormSubmit` or equivalent)
   - Pack: `src/components/station/StationPacking.tsx` and any pack-log POST helpers

For **Phase 3 only**, also read `docs/research/gemini-briefing-serial-label-order-binding.md`
and Ask-first before schema changes.

---

## Hard laws (non-negotiable)

- **House Station contract:** unmatched tracking = amber exception card + continue scanning.
  Do **not** add `onHardDismiss` / blocking modals that steal keyboard-wedge focus.
- **Never raise** a DS ratchet baseline (`ALERT_BASELINE`, button/title/focus baselines, etc.).
- **Never** `git stash`; user manages commits; stay on the checkout’s branch.
- **Never** start/restart/kill the dev server.
- `orgId` from `ctx` only; status changes via `transition()` / domain transition helpers.
- `npm run verify` before calling the phase done (at least `verify -- --fast` mid-loop; **full**
  `npm run verify` before “Phase N done”).
- E2E against **QA org**, not dogfood.

---

## Phase 1 — Implementation checklist

### A. Discovery (read-only, ≤15 min)

Confirm current state:

```bash
rg -n "readIdempotencyKey|idempotencyKey|clientEventId|Idempotency-Key" \
  src/app/api/orders/add \
  src/app/api/packing-logs \
  src/app/api/packerlogs \
  src/components/station/StationPacking.tsx \
  src/components/sidebar/dashboard-sidebar-hooks.ts
```

Produce a one-paragraph scorecard in chat: which of the four critical writes still lack route-level
replay (Receiving + tech.serial should already be HAS).

### B. `POST /api/orders/add`

1. Import `readIdempotencyKey`, `getApiIdempotencyResponse`, `saveApiIdempotencyResponse` (or
   `withIdempotentResponse` / `claimOrReplay` if concurrent create races matter — prefer the same
   pattern as receiving when double-click is likely).
2. Route key name: e.g. `orders.add`.
3. On cache hit, return cached `status` + `body` unchanged.
4. Persist responses with `status < 500` only.
5. Client: mint `crypto.randomUUID()` (or existing `safeRandomUUID` / station helper), send as
   `Idempotency-Key` header **and/or** body `idempotencyKey` / `client_event_id` — match
   `readIdempotencyKey(req, body…)` signature.
6. Keep natural 409-on-duplicate-order-id behavior; idempotency is for **retry of the same client
   event**, not for collapsing different orders.

### C. Packing logs

1. `POST /api/packing-logs` — request-level key; do not rely only on `shipment_id` existence
   (non-order / SKU path always INSERT today).
2. `POST /api/packing-logs/update` — replace or supplement the 5-minute heuristic with a client key
   when provided.
3. `POST /api/packerlogs` — same if still a live writer.
4. `StationPacking` (and any other POST callers): mint and send the key on every create.

### D. Tests

- Extend or add unit tests beside `src/lib/api-idempotency.test.ts` and/or route-local tests:
  same key → same JSON, second call does not insert a second row.
- Do not delete CF-02 E2E; do not weaken pack-queue E2E.

### E. Docs touch (minimal)

- Append one line to the plan §12 Status log when Phase 1 exits.
- If you change SoT behavior, one sentence in `.claude/rules/backend-patterns.md` §Idempotency
  pointing at `orders.add` / packing-logs as covered routes — do not duplicate the whole plan.

### F. Verify

```bash
npm run verify -- --fast
# then before declaring done:
npm run verify
```

Fix every ✗ gate you introduced. If the branch already has unrelated typecheck failures
(e.g. WIP `PackKpiStrip`), **do not expand scope to fix the world** — either isolate your files
prove clean, or fix only if the human asks. Prefer leaving Phase 1 green on its own surface.

---

## Phase 2 prompt block (only if human asks)

**Theme:** migrate remaining `alert()` (ratchet baseline 20 → 0) + Station framer → motion bridge.

1. List offenders: `rg -n "window\\.alert\\(|[^.\\w]alert\\(" src --glob '!*.test.*'`
2. Migrate Station hooks first → toast; then shipped stacks; then settings.
3. Shrink `ALERT_BASELINE` in `src/components/ui/alert.guard.test.ts` on every PR.
4. Migrate Station Up Next / Packing raw motion to `useMotionTransition` /
   `useMotionPresence`; expand `station-motion-bridge.guard.test.ts` only after files comply.
5. `npm run test:ds-guards` + full verify.

**Do not** invent a hard-dismiss Station modal.

---

## Phase 3 prompt block (only if human asks — Ask-first schema)

**Theme:** CF-03 serial grain + CF-04 pack-queue membership.

1. Read `docs/research/gemini-briefing-serial-label-order-binding.md`.
2. Propose the write/read/queue change set in chat and **wait for approval** before migrations.
3. Prefer `order_unit_allocations` and/or `order_id` on TSN — not a fake `order_line` table.
4. Replace shipment-join smear in lookup / linkage / neon queries.
5. Fix Up Next / `excludePacked` shipment-grain `NOT EXISTS`.
6. Extend E2E `audit-order-lifecycle-control` + `audit-pack-queue-membership`.
7. Full `npm run verify` + QA-org E2E.

---

## Phase 4 / 5 (summary only)

- **4:** `LedgerValue`/`DateTimeValue` stop defaulting to `"N/A"`; Monitor “Reconciliation Hub”
  using monitor rollup SoT — after Phase 3 truths exist.
- **5:** unify framer-motion 11 vs motion 12; Tailwind v4 spike — debt, not floor safety.

---

## Done definition (Phase 1)

Reply with:

1. Scorecard of the four critical writes (all HAS)
2. Files touched (routes + clients + tests)
3. Verify output summary
4. One-line status log entry for the plan

Do **not** commit unless the human asks.
