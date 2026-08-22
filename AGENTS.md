# Cycle Forge — agent instructions

**Status: mid-refactor.** The app is being rebuilt from a page-oriented SaaS into
a **Warehouse OS** — a HUD shell with sessions, tabs, tools and a tiling canvas.

The previous constitution (AGENTS.md, `.claude/rules/**`, `docs/rules/**`, the SoT
manifest, the design-law lint rules and the SoT PreToolUse hook) was **deleted on
2026-08-21** at the operator's instruction. It described the architecture being
replaced, so following it would actively fight the refactor. It is all recoverable
from git history if a specific rule turns out to be worth keeping.

The design-law guards that lived under `src/` went with it (2026-08-22) — 16
`*.test.ts` files, ~2.7k lines, that `readFileSync` a `.tsx` and regex-asserted
which component composes which chrome primitive. A test that reads source text
cannot tell an import from the same word in a comment, and it pins a shape
rather than a behaviour, so it fails the moment a surface legitimately moves.
Behaviour tests that merely read a file (SQL-shape, token, capture-roundtrip)
were kept.

**Do not re-add house laws, guards, ratchets, or SoT doctrine.** New invariants get
written only after the surface they govern exists in code, and only when asked.
If an invariant is worth pinning, pin it where it can be observed — a mounted
DOM test, an ESLint AST rule, or a TS type — never a regex over source text.

## Where the plan lives

- [`docs/warehouse-os/`](docs/warehouse-os/) — the refactor spec, phases, and repo map.

## The few rules that survived (and why)

These are security / correctness / process, not design taste:

- **Never commit `.env`.** A PreToolUse hook in `.claude/settings.json` blocks
  writes to secret paths. Do not bypass it.
- **Never start, restart, or kill a dev server.** The operator owns `:3050` —
  attach to it, never spawn one (`pnpm dev` = `next dev --turbopack -p 3050`).
  A broken dev server is a **report, not a repair**: a stale Turbopack
  transform, a poisoned Tailwind cache, a port already bound — say what it is
  and ask. Restarting costs the operator one keystroke and costs you the one
  surface they were watching. Never delete `.next/` or `.next/dev/lock` to
  "fix" a server you did not start.
- **The tunnel is the operator's too.** `pnpm dev:tunnel` (named) /
  `dev:tunnel:quick` / `dev:phone` expose `:3050` for mobile testing, and are
  main-only. Never start, rotate, or kill one. A dead tunnel URL is a report.
- **Never create a branch. Always work on `main`.** No `git branch`,
  `git checkout -b`, or `git switch -c` — not to isolate work, not to keep
  `main` clean. If you need an isolated lane it is a separate **worktree**
  (its own directory), and it is still on `main`. Verify with
  `git branch --show-current` before committing; if it is not `main`, stop.
- **The operator manages commits.** Stage only files you changed (`git add -A`
  sweeps other sessions' work). Never `git stash`. Commit/push only when asked.
- **`orgId` comes from `ctx.organizationId`, never the request body.** Org-scoped
  writes go through `withTenantTransaction` (`src/lib/tenancy/db.ts`).
  `scripts/tenancy-guard.ts` is a live RLS-bypass check and stays.
- **Migrations land before the code that reads them** (expand → code → contract).
  A nullable `ADD COLUMN` is always safe to ship early; the reverse never is.
- **`npm run verify` before done** — lint · typecheck · unit. That is the whole
  automated gate set.

## Performance

**Target: Lighthouse ≥ 90 in every category, every route.** Only Performance is
short — A11y 93–95, Best Practices 96, SEO 91, CLS ~0 and TBT 22–158 ms already
clear it. Performance sits at 67–78 and the entire gap is **LCP (5.9–12.3 s)**.

The cause is one thing, not many: the data-heavy workbenches (`/dashboard`,
`/unbox`, `/triage`, `/search`, `/test`) render a shell, hydrate, and only then
fetch their first collection, so LCP waits on a post-hydration round trip.
Streaming that first payload server-side moves all five. Bundle weight was
already cut 61–68% and is no longer the constraint — do not re-run that hunt.

- **Payload budgets ratchet down, never up.** `bundle-budget.json` holds the
  per-route First Load JS ceiling; `npm run perf:budget` checks a build log
  against it. Fix a regression, don't re-seed around it.
- **`formFactor` in the `ROUTES` manifest is a claim about hardware**, and it
  drives throttling as well as viewport. Desk workbenches are `desktop` (LAN
  workstation), `/m/*` is `mobile`, `/kiosk*` is a mounted tablet. Do not repin a
  route to make a number move.
- **Scores are only comparable within one profile.** Change a route's form factor
  and its baseline floor is void — `--check` fails it until you re-seed.
- Runbook, CI wiring and how to re-seed: [`docs/performance/LIGHTHOUSE.md`](docs/performance/LIGHTHOUSE.md).

## Verify

```bash
npm run verify       # lint + typecheck + unit — the whole gate set
npm run verify:fast  # lint + typecheck — inner loop
```

`npm run verify --fast` does **not** work — npm eats the flag before the script
sees it (`EUNKNOWNCONFIG`). Use the `:fast` script, or `npm run verify -- --fast`.

The pre-push hook (`.githooks/pre-push`) runs the full gate on any push to
`main`. If it is red, fix the gate — do not reach for `--no-verify`.
