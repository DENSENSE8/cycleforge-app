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
- **Lanes are yours to run; `:3050` and `usav-dev` are not.** Removed
  2026-08-28 at the operator's instruction: the blanket "never start, restart,
  or kill a dev server" is struck, and an agent may `pnpm lane up` / `down` a
  lane and its tunnel freely. What survives is the narrow case the rule was
  really about — **the main checkout's `:3050` dev server and the `usav-dev`
  tunnel stay the operator's.** Those are the surface they are watching and a
  remotely-managed tunnel whose ingress lives in the Cloudflare dashboard; a
  restart there costs them their session and can take the public hostname
  down. A broken `:3050` is still a **report, not a repair**, and never delete
  `.next/` or `.next/dev/lock` to "fix" a server you did not start.
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
- **No layout animations. This is WMS software and it has to be fast.**
  Nothing may tween a property that triggers reflow — `height`, `width`, `top`,
  `left`, margin, padding, or framer's `layout` / `layoutScroll` position
  tracking. Show it or do not. A collapse that animates its height still
  occupies the space for the length of the tween, which is backwards for an
  interaction whose only purpose is to hand space back; a row that springs into
  its new position delays the paint that tells a scanning operator the scan
  landed. Opacity and colour are fine — they composite off the main thread and
  never move a neighbour. This applies to new code and to anything you touch;
  a full sweep of the pre-existing offenders (e.g. the orders-queue row's
  `layout` / `layoutScroll`) is still outstanding.

- **`npm run verify` before done** — lint · typecheck · unit. That is the whole
  automated gate set.

## Interaction budget (operator's standing rule, 2026-08-28)

Every surface must let its user VIEW the information it exists for and ACT on
it within a fixed budget, measured from the surface's entry point:

- **See the primary information: ≤ 2 interactions.** Opening the page counts
  as one; a tab or row-expand is the second. If the answer needs a third
  click, the page is hiding its own point.
- **Take the primary action: ≤ 3 interactions**, confirmation included.
- **Status overviews: ≤ 1** — the truth is on screen when the page opens,
  never behind a filter someone must rebuild by hand.

"Interaction" = a click, tap, or keystroke chord; scrolling is free and typing
a value is one. A change that adds a fourth click to an existing flow is a
regression even when the feature works. Deep-linkable state (the URL carries
the tab/filter) is the cheapest way to hit these budgets — prefer it over
modal nesting. The loop's verifier judges diffs against this rule.

## Performance

**Target: Lighthouse Performance ≥ 92 on every route** (operator ruling
2026-08-27; raised from 90 — "test until it hits ninety two, that is the law
throughout the entire codebase"). The other categories keep the ≥ 90 floor —
A11y 93–95, Best Practices 96, SEO 91, CLS ~0 and TBT 22–158 ms already clear
it. Performance sits at 67–78 and the entire gap is **LCP (5.9–12.3 s)**.

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
- **Request shape** (how many calls a route fires, not how big the bundle is) is
  a separate axis with its own harness: `npm run perf:requests -- --route=…`
  captures depth / width / redundancy / poll-vs-push against a production build.
  Method + fix catalog + the suspects already ruled out:
  [`.claude/skills/request-shape/SKILL.md`](.claude/skills/request-shape/SKILL.md).

## Verify

```bash
npm run verify       # lint + typecheck + unit — the whole gate set
npm run verify:fast  # lint + typecheck — inner loop
```

`npm run verify --fast` does **not** work — npm eats the flag before the script
sees it (`EUNKNOWNCONFIG`). Use the `:fast` script, or `npm run verify -- --fast`.

The pre-push hook (`.githooks/pre-push`) runs the full gate on any push to
`main`. If it is red, fix the gate — do not reach for `--no-verify`.
