# HANDOFF — burn the `*GridView` forest + land the ratchet (AI authoring LAST)

**Re-sequences** [`nonlinear-data-table-engine-PLAN.md`](nonlinear-data-table-engine-PLAN.md).
The plan's **Phase 2 (constrained AI authoring in Studio/Canvas) is DEFERRED to the
very end** — it does not start until every foundation below is landed. The focus of
this handoff is the *code-simplification* payoff: **delete the `*GridView` forest and
freeze it so it cannot regrow.**

**Lane:** `topic/tables` (worktree `../cycleforge-tables`, WS-TABLES · `:3150`).
**Companions:** [`nonlinear-data-table-engine-HANDOFF.md`](nonlinear-data-table-engine-HANDOFF.md) ·
[`tables-phase3-finish-and-checklist-boxes-HANDOFF.md`](tables-phase3-finish-and-checklist-boxes-HANDOFF.md) ·
auto-memory `nonlinear-table-registry-waist.md`.

---

## Verified state (checked in code, 2026-08-08)

| Phase | Status |
|---|---|
| **P1 — registry waist** | ✅ **DONE on `main`.** `table-definition.ts` (Zod + `superRefine` linter, `MAX_DEFAULT_VISIBLE_TRACKS=10`), `NonlinearTableHost.tsx`, `table-definition-registry.ts` (16 definitions). |
| **P3 — migration onto the engine** | ✅ **DONE.** Every workbench grid mounts via `NonlinearTableHost`; **0 direct `<LedgerGridSurface>`/`<LedgerGrid>` mounts remain in pages** (only the host mounts the engine). |
| **P3 — burn the forest (DELETE wrappers)** | ✅ **DONE.** `GRID_VIEW_FOREST === []`; 0 `*GridView.tsx` on disk. Shared adapters are `ReceivingGridHost` / `OrdersGridHost` (non-forest); Units inlined in `UnitsWorkspaceView`. |
| **P3 — anti-regrowth ratchet** | ✅ **LIVE.** Disk-walk freeze in `grid-surface-capabilities.guard.test.ts` — list only shrinks; new `*GridView.tsx` fails CI. |
| **P2 — AI authoring (Studio/Canvas)** | ❌ **not started — and DEFERRED to last** (this handoff). Only the schema-level density linter exists; no authoring UI / publish gate. |

**The blocker on landing the ratchet is the same one this initiative has hit all week:**
`main`'s committed tree is RED (concurrent-session tsc errors + 4 IDOR tenant tests in
`src/lib/tenancy/idor-regression.test.ts`) **and** `main` is being live-rewritten by the
fleet (HEAD moved during a single session). The ratchet cannot merge+push until `main` is
independently green and stable. **Do not `--no-verify`; do not `git add -A`.**

---

## Re-ordered phases (foundations first, AI authoring last)

### Phase A — Land the ratchet (unblock, do FIRST)
The forest-freeze already exists on `topic/tables`; it just isn't on `main`.

1. Confirm `main` is green: clean detached checkout at main tip →
   `npm run verify`. If red, it's **not yours** — the IDOR tests may just need
   `pnpm provision:qa-org` (check if env/data), and the tsc errors need the
   concurrent unbox/testing/FBA sessions to commit their impls. Report; don't sweep.
2. Merge `topic/tables` → `main` via the plumbing recipe (never in the dirty `main`
   checkout): `git worktree add --detach /tmp/land <main-tip>` → `git merge topic/tables`
   → run the table guard set → `git update-ref refs/heads/main <M> <old>` (CAS).
3. Push from a CLEAN checkout at main's tip (pre-push `verify` must pass).

**Exit:** `grid-surface-capabilities.guard.test.ts` forest-freeze is live on `main`; a
new `*GridView.tsx` fails CI.

### Phase B — Burn the forest — ✅ DONE
`GRID_VIEW_FOREST` is empty; 0 `*GridView.tsx` on disk. New queues bind
`NonlinearTableHost` + a registry entry (shared multi-consumer logic may live in a
non-`*GridView` host such as `ReceivingGridHost` / `OrdersGridHost`).

**Keep / do NOT delete:**
- **`OrdersGridHost` header fork** — `OrdersQueueColumnHeader` is a *permanent allowlisted
  fork* (resize + viewport force-hide). The former `OrdersGridView` wrapper is burned; the
  header fork stays allowlisted, not "unified for consistency."
- **`StationListTable` / `FbaBoardTable`** — documented raw-mount exceptions (no column
  model; declared capability bag without a definition). Keep.
- **Station PO accordion (`PoLinesAccordion` / `PoLineMetaGrid`)** — NOT LedgerGrid, never
  migrate (plan §3.5).
- **`DataTable`** admin sibling — different family, keep.

**Exit (met):** "New queue ships without a new GridView file."

### Phase C — Display-consistency cleanup (Horizon A) — foundation, before AI
The engine is unified, but *displays* still diverge (per-family cell maps + chrome). This
is the "massive inconsistencies" the operator sees. Close the Horizon-A display SoT items
(row anatomy, column justification, header casing, Sheets flush, typed track floors) so
every family reads as one system. Details live across the `grid-*` / `ledgergrid-*` docs in
`docs/todo/`. **Do this before AI authoring** — AI should author against a consistent,
finished display foundation, not codify today's drift.

### Phase Z — Constrained AI authoring (Studio/Canvas) — **LAST, do NOT start early**
Only after A + B + C are landed and dogfood-stable. Then build the Studio/Canvas UI that
authors **Zod-validated `TableDefinition` payloads** (never JSX / DDL / new terminal
statuses / capability-bag lies), with the density linter + a gated publish path. This is
plan §Phase 2, intentionally moved to the end.

---

## Green signal (use these, not full verify, while iterating)
```bash
cd ../cycleforge-tables && npx tsx --test \
  src/lib/tables/table-definition.test.ts \
  src/components/tables/table-definition-registry.guard.test.ts \
  src/lib/tables/grid-surface-capabilities.guard.test.ts \
  src/components/dashboard/dashboard-orders-sheet.guard.test.ts \
  src/design-system/components/grid/grid-view-plumbing.guard.test.ts \
  src/components/workbench-cohort-wave7-sheet.guard.test.ts \
  src/features/review/review-workspace-sheet.guard.test.ts
```
Full `npm run verify` is the gate before any commit/push.

## Guardrails
- Stay on `topic/tables`; stage only your own files (`git commit -- <paths>`; never
  `git add -A` / `git stash` — the shared checkout has 100s of concurrent dirty files).
- Never raise a ratchet baseline to pass; the freeze allowlist only **shrinks**.
- Never `--no-verify`; never bypass `.claude/settings.json` hooks.
- AI authoring (Phase Z) stays off until foundations are done.

---

## Implementer prompt (≤30 lines)
```
Read docs/todo/nonlinear-table-burn-forest-and-ratchet-HANDOFF.md (this file) and
docs/todo/nonlinear-data-table-engine-PLAN.md (APPROVED). Work in ../cycleforge-tables
on topic/tables.

Focus: BURN THE *GridView FOREST + land the anti-regrowth RATCHET. Do NOT build the
Studio/Canvas AI-authoring surface — that is Phase Z, dead last.

Phase A: land the forest-freeze ratchet (3e522a690) on main once main is green.
  Merge via detached worktree + update-ref CAS; push from a clean checkout. No --no-verify.
Phase B: delete the 14 *GridView.tsx wrappers one at a time. Per wrapper: move residual
  chrome/intents into the page binding NonlinearTableHost directly, delete the wrapper,
  shrink the freeze allowlist by one, verify green. Orders last. Keep the Orders header
  fork, StationListTable, FbaBoardTable, the PO accordion, and DataTable.
Phase C: close Horizon-A display-consistency items so families read as one system.
Only after A+B+C: Phase Z AI authoring (Zod-only defs, density linter, gated publish).

Green signal = the table guard set above; full npm run verify before any commit.
Stage only your files; never raise a baseline; never git add -A.
```
