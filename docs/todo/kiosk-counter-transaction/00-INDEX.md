# Kiosk counter transaction — parallel execution index

**Parent SoT:** [`../kiosk-counter-transaction-PLAN.md`](../kiosk-counter-transaction-PLAN.md) — decisions, schema, rationale.
**This file:** how the five phases split across agents, what may run at once, and what must not.
**Created:** 2026-07-29 · **Status:** none started

---

## ⚠️ The phases are NOT all parallel. Read this before dispatching.

Three of five are independent. Two are chained by a hard dependency, and one is a **gate**.

```
WAVE A  (dispatch all three NOW, fully parallel)
  ├── 01 · Tenancy gate .............. lane kiosk-tenancy   :3140
  ├── 02 · Catalog projection ........ lane kiosk-catalog   :3150
  └── 03 · Join model + outbox ....... lane kiosk-join      :3160

WAVE B  (starts when 03 is merged; 01 must ALSO be merged before any sales write ships)
  └── 04 · Unified route ............. reuse lane kiosk-join

WAVE C  (starts when 04 is merged)
  └── 05 · Kiosk UI .................. reuse lane kiosk-catalog
```

**Why 04 and 05 cannot be dispatched now:** 04 writes rows into `counter_transactions`, a table that does not exist until 03 lands. 05 posts to the route 04 creates. Starting them early produces code that compiles against nothing and cannot be verified.

**The gate:** Phase 01 is a hard gate on *shipping* kiosk sales, not on writing code. 04 may be **built** before 01 merges; the `sales: 'live'` flip in 05 may **not** ship until 01 is green. `square_transactions` currently has a nullable `organization_id`, inert RLS, and a global `ON CONFLICT` — writing tenant sales data through it before 01 is a cross-tenant leak.

### Want more parallelism than this?

The honest answer is no, not safely. 04 is one coherent orchestrator (~1 file + 1 route) and splitting it across agents costs more in coordination than it saves. If you want 05 earlier, the only sound move is to have the 03 agent land the **TypeScript contract** (`CounterTransactionInput` / `CounterTransactionResult`) in its first commit; 05's form work can then build against those types while 04 implements them. That is called out in 03 §5 and 05 §0.

---

## Lane setup (per `.claude/rules/workflow-safety.md`)

Each agent gets its **own worktree**. One lane per agent — never two agents in one checkout.

```bash
git worktree add ../cycleforge-kiosk-tenancy  -b topic/kiosk-tenancy
git worktree add ../cycleforge-kiosk-catalog  -b topic/kiosk-catalog
git worktree add ../cycleforge-kiosk-join     -b topic/kiosk-join
```

Register each in `dev-worktrees.json` (`trees[]` with `appPort` 3140 / 3150 / 3160) and add a row to `docs/portfolio/WORKTREE-LANES.md`. **Never start a dev server with a raw shell command** — `pnpm dev` resolves the lane's own port.

| Lane | Port | Phase(s) | Branch |
|---|---|---|---|
| `kiosk-tenancy` | 3140 | 01 | `topic/kiosk-tenancy` |
| `kiosk-catalog` | 3150 | 02, then 05 | `topic/kiosk-catalog` |
| `kiosk-join` | 3160 | 03, then 04 | `topic/kiosk-join` |

---

## File ownership — the collision map

Two phases touch `src/lib/drizzle/schema.ts`. **They own different regions and must not stray**, or Wave A ends in a merge conflict.

| File | Owner | Region |
|---|---|---|
| `src/lib/drizzle/schema.ts` | **02** | `skuCatalog` (~L2316) + `platformListings` (~L2438) — *existing* blocks |
| `src/lib/drizzle/schema.ts` | **03** | a **new appended** `counterTransactions` block — touches **no existing line** |
| `src/lib/neon/square-transaction-queries.ts` | **01** | whole file |
| `src/app/api/webhooks/square/route.ts` | **01** | whole file |
| `src/app/api/walk-in/terminal/checkout/route.ts` | **01** | whole file |
| `src/lib/ecwid-square/sync.ts` | **02** | whole file |
| `src/lib/repair/ecwid-repair-catalog.ts` | **02** | whole file |
| `src/lib/support/ticket-link.ts` | **03** | whole file |
| `src/app/api/kiosk/intake/route.ts` | **04** | whole file |
| `src/lib/repair/submit-repair-intake.ts` | **nobody** | read-only in every phase — **compose it, never edit it** |
| `src/app/kiosk/page.tsx` | **05** | whole file |

**Migrations never collide** — each phase writes its own dated file. Use these exact names so two agents cannot pick the same one:

- 01 → `src/lib/migrations/2026-07-29a_square_transactions_tenant_contract.sql`
- 02 → `src/lib/migrations/2026-07-29b_platform_listings_price_projection.sql`
- 03 → `src/lib/migrations/2026-07-29c_counter_transactions.sql`

---

## Rules every agent follows

1. **Stay on your lane's branch.** No ad-hoc branches, no mid-session switches, never `git stash`.
2. **The user manages commits.** Stage only files you changed; commit only when asked.
3. **`npm run verify` green before you report done.** Never raise a DS-ratchet baseline to pass.
4. **If another session's red appears**, report it as pre-existing — do not inherit or silently fix it.
5. **Do not edit files outside your ownership row above.** If you believe you must, stop and report it — that is a collision, not a judgement call.
6. **Read `.claude/rules/backend-patterns.md`** before touching any route, and `.claude/rules/polymorphic-tables.md` before any migration.

## Dispatch order

Send 01, 02, 03 together. When 03 reports merged → dispatch 04. When 04 reports merged → dispatch 05.
