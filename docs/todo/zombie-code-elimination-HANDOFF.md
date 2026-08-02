# Handoff — zombie-code elimination: delete the dead, then close the door

**Copy the section below the line into a fresh Claude Code / Cursor session.**
Repo: `cycleforge-app` · stay on the checkout's branch · attach to the user's dev
server on `:3050` (never start / restart / kill it).
**Do not edit this handoff file** as part of the implementation.

**Prior art — the worked example this whole document generalises:**
`7367c9441 refactor(grid): retire chrome Fields; the table lip is the sole column-display entry`
([`fields-chrome-to-table-lip-HANDOFF.md`](./fields-chrome-to-table-lip-HANDOFF.md)).
That change removed a **two doors, one destination** fork: `GridFieldsMenu`
(page chrome) and the grid header lip both mounted `GridColumnDetailsPanel`, on
seven surfaces at once. Cost of the fork while it lived: 184 LOC, a public
`fields` slot, 9 mounts, and a latent dual-mount bug. **`knip` never saw it —
both doors were imported and both were "used".** That blind spot is the reason
this document exists.

---

You are an agent in the Cycle Forge monorepo with **fresh context**.

## Mission

Delete the measured dead code, then install the **cheapest enforcement that
would have caught it** — in this repo's own idiom, not by importing a foreign
toolchain.

Two halves, and the first funds the second:

1. **Burn down** the 82 orphaned files (10,540 LOC) that `knip` already knows about.
2. **Close the door** so the next retired surface cannot sit for months.

## Hard laws (unchanged, and they bind this work)

- **Compose the named SoT; never fork a page-local twin.** Growing the SoT is
  correct; inventing beside it is not (`pattern-evolution.md`).
- **`npm run verify` before done. Never raise a ratchet baseline to pass.**
  Baselines only shrink (`verify.md`).
- **The user manages commits.** The git index is **shared with concurrent
  sessions** — run `git diff --cached --name-only` before every commit and
  unstage anything that is not yours. Never `git stash`.
- **A red gate is often not yours.** Attribute before fixing. Untracked (`??`)
  files are always another session's.
- **Do not import a foreign architecture** to satisfy a standard. This is not an
  Nx monorepo and it does not use LaunchDarkly; see *Translation* below.

## Measured state (2026-08-02 — re-measure before acting, the tree moves fast)

Commands: `npx knip --no-progress`, `node scripts/knip-gate.mjs`.

| Signal | Value |
|---|---|
| Orphaned files | **82** — **10,540 LOC** |
| `knip-baseline.json` parked findings | **3,063** |
| Unused exports / exported types | 1,137 / 1,761 |
| Duplicate exports (named **and** default) | 22 |
| Guard tests (the repo's real enforcement layer) | 96 |
| DS ratchet debt | focus-ring **1,075** · control-size 178 · surface-box 130 · receiving-events 94 · others ~209 |

**Known-broken at `7367c9441`, and NOT caused by this work:** `HEAD` does not
typecheck. `src/design-system/components/procedure/index.ts` exports from
`./ProcedureColumn`, which commit `92fdb3593` ("finish ProcedureColumn rename")
deleted. Three `TS2307` errors. Verify this is fixed before trusting a green
typecheck; if it is still red, it belongs to the Unbox-procedure lane.

### Do NOT chase the 2,877 "unused exports"

Only 186 are barrel over-exports. Most of the rest are symbols whose bodies
**are** used locally — the `export` keyword is surface noise, not a dead body.
Removing them shrinks the public surface and deletes nothing. The genuinely
deletable mass is the **files**.

---

## Part 1 — Burn down (do these in order; each is one PR)

### 1A. `components/audit-log/**` — 16 files, 2,222 LOC ⭐ start here

There is **no `/audit-log` route**. Sixteen files are unreachable.

**Precision matters:** `AuditLogFilterStrip.tsx` in that directory **is live** —
`src/components/sidebar/AuditLogSidebarPanel.tsx` imports
`useAuditLogFilterRefinements` / `AuditLogFilterDropdown` from it. Delete the
sixteen, keep that one. Do not `rm -rf` the directory.

Dead: `AuditLogDailyReport` · `AuditLogTraceClient` · `AuditLogSkuClient` ·
`AuditLogStaffClient` · `AuditEventCard` · `AuditLogTechClient` ·
`AuditLogPackingClient` · `AuditLogReceivingClient` · and all eight of
`audit-log/receiving/**`.

**Free win inside it:** `audit-log/receiving/EventTimeline.tsx` (135 LOC) is a
**page-local fork of the `EventTimeline` primitive** — the exact fork
[`display/reference-timeline.md`](../../.claude/rules/display/reference-timeline.md)
bans ("Never build a second timeline component"). Deleting the cluster retires
the violation at zero risk. Say so in the commit message.

**Leave `AuditTimeline` alone.** `reference-timeline.md` calls it the ONE
sanctioned fork, and it has five live consumers (`app/bin/[barcode]/page.tsx`,
`WarehouseSidebarPanel`, `SkuDetailCards`, `BinDetailFlyout`, + the dead
`AuditEventCard`). It is not in scope.

### 1B. `components/walk-in/**` — 10 files, 1,362 LOC

`src/app/walk-in/page.tsx` is now a **redirect stub** to `/dashboard?mode=sales`
(Local Pickup: `?mode=pickup`). Its ten components render nowhere.

**Keep the redirect page and its hooks** — `useWalkInTaskRedirect` still serves
live intake deep-links (`?new=`, `?openRepair=`), and
`WALK_IN_ROUTE_PARAMS` exists to stop param hygiene stripping them. Delete only
the orphaned components. `salesCartStore.ts` (214 LOC) is in the dead set;
`source-of-truth.md` says it is "staff `/pickup` only" — **verify that claim
against call sites before deleting**, because a stale SoT row is exactly the
drift this document is about.

### 1C. `features/operations/components` — 9 files, 1,489 LOC

Transitively unreachable: the references these files have are to **each other**.
That mutual-reference island is the shape Standard 5 targets — see Part 2D.

**Running total for 1A–1C: 35 files, ~5,073 LOC — 48% of all orphaned code in
three PRs.**

### 1D. Trivial, zero-risk (fold into any PR above)

- **22 duplicate exports** — same symbol exported as named *and* default. Pick one.
- **`src/hooks/index.ts`: 56 unused exports** — the worst barrel by 25 points.

### After each PR

`npm run knip:baseline` and commit `knip-baseline.json` **only if the count went
DOWN**. If a delete raises it, you orphaned something else — chase that instead.

---

## Part 2 — Close the door

### Translation: five industry standards → this repo's idiom

The five standards below came from the user and are the target state. Three
translate cleanly, one is already half-built, and one needs a real decision.
**Do not implement them literally where the repo already has a better-fitting
mechanism** — that would be importing a foreign architecture, which
`pattern-evolution.md` bans.

| # | Standard | This repo already has | Verdict |
|---|---|---|---|
| 1 | **Strict Definition of Done** — replacement ships *and* old code deleted before the ticket closes | Nothing. Handoff docs describe phase 1 only | **Adopt as written** (2A) |
| 2 | **Feature-flag lifecycle** (LaunchDarkly / Split, cleanup sprints) | `src/lib/feature-flags.ts` — **21 exported `isXxx()` predicates** over private `readBoolEnv` (sync env) + `resolveForOrg` (per-org, DB→env, ~30s cache) | **Adopt the discipline, NOT the vendor** (2B) |
| 3 | **Production runtime coverage** — alert on code not executed in 30 days | Nothing. Only `@vercel/analytics`. No APM | **Real gap. Needs a decision, not a task** (2C) |
| 4 | **15–20% tech-debt allocation / Fix-it Weeks** | Nothing formal | **Process, not code** (2D) |
| 5 | **Strict dependency boundaries** — orphaned feature ⇒ build error | `eslint.config.mjs` already uses `no-restricted-syntax` heavily (tenancy guard), plus **96 guard tests** | **Adopt — as a guard test** (2E) |

### 2A. Definition of Done — the retirement guard

**The principle to institutionalise, learned twice this week:**
*a retirement claimed in prose but not enforced in code is not a retirement.*

Evidence it is already failing here:

- `source-of-truth.md` says `useIsColumnHidden()` "survives only for
  `ChipColumns` / `RowMetaColumns`." It has **four** consumers — those two plus
  `OrderIdentityChips` and `StationRowColumnHeader`. Nothing tests the claim.
- `workbench-ops-queue.md` said Fields lived in page chrome long after 11 of 13
  grids had moved to the lip. The doc described a state that had stopped being
  true; only a guard would have caught it.

**Do:**
1. Add to [`.claude/rules/pattern-evolution.md`](../../.claude/rules/pattern-evolution.md)
   under **Always**: *"A retirement is not done until the old path is deleted
   **or** a guard names the exact surviving call sites. A prose-only retirement
   is a TODO wearing a ruling's clothes."*
2. Close the live instance: either finish `useIsColumnHidden`'s retirement, or
   write `use-is-column-hidden.guard.test.ts` pinning the allowed consumers as
   an explicit shrink-only list — and correct the SoT row to say four, not two.

Cheap, and it is the rule that would have prevented every finding in Part 1.

### 2B. Flag lifecycle — a flag-age guard, not a vendor

`src/lib/feature-flags.ts` is a working two-tier SoT: `readBoolEnv` and
`resolveForOrg` are **private** helpers, and the public surface is **21 exported
`isXxx()` predicates** in one file — which is exactly the shape a guard can walk.
**Do not replace it with LaunchDarkly** — that is a second flag system, and the
repo already forbids "a second X outside the SoT module."

*(Note for whoever writes the guard: `backend-patterns.md` → Feature flags
documents the API as `readBoolEnv` / `resolveForOrg`, i.e. the private helpers.
The real call-site surface is the predicates. Correct that row while you are
there — it is a small instance of the same doc-vs-code drift as 2A.)*

What is missing is *lifecycle*: nothing records when a flag was born or forces a
decision once it is at 100%. Several are explicitly mid-strangler — 
`isUnifiedEngineApplyTransition`, `isUnifiedEngineFulfillmentTaps`,
`isUnifiedEngineVerdictConfig`, `INVENTORY_V2_*`, `surface_composed_render` —
and `backend-patterns.md` says the unified-engine path is *"mid-strangler, so it
is not yet a hard requirement."* A strangler with no deadline is how the losing
branch becomes zombie code.

**Do:** give each flag a declared `bornAt` (civil date) + `owner` in
`feature-flags.ts`, and add `feature-flag-age.guard.test.ts` that fails when a
flag is older than N days without an explicit `plannedRemoval` or
`permanent: true`. Same shrink-only shape as every other ratchet. No new
dependency, no dashboard.

### 2C. Runtime coverage — the one that needs a DECISION, not a ticket

This is the standard that would have caught the "two doors" bug, and it is the
**only** one that cannot be built from what is already here. There is no APM in
`package.json` — just `@vercel/analytics`.

**Be honest with the user rather than opening a ticket:** this costs money and
integration work, and it should come **last**, after Part 1 has banked ~5k LOC
for free. Present the options and let them choose:

- **Vercel-native** (the app already deploys there) — cheapest integration, but
  request-level, not statement-level coverage. Catches dead *routes*, not dead
  *branches*.
- **Sentry / Datadog / PostHog** — real code-level signal; a per-seat or
  per-event bill, plus a client bundle cost this repo actively polices
  (`build-gotchas.md` → bundle altitude).
- **Repo-native proxy, ~free:** the app already writes `audit_logs`,
  `inventory_events` and `station_activity_logs` with typed action vocabularies.
  A quarterly query for action codes with **zero rows in 90 days** finds dead
  *product surfaces* without any new vendor. Weaker than statement coverage, but
  it is the 80% answer at 0% of the cost, and it fits the existing SoT.

**Recommend the third first.** Do not install an APM without the user's explicit
go-ahead.

### 2D. Tech-debt allocation — make the ledger visible

`knip-baseline.json` holds **3,063 parked findings** and the DS ratchets hold
~1,686 more. Because ratchets are shrink-only they never *force* cleanup — they
silently legitimise it. That is the mechanism by which 10,540 LOC sat orphaned.

**Do:** publish the two numbers where they are seen. Add a `npm run debt` script
printing baseline count + each ratchet's current value, and have `verify` echo
the totals on success. A ledger nobody is charged for is a ledger nobody pays.

Highest-volume single target once Part 1 lands: **focus-ring at 1,075** — it has
a codemod-shaped fix (one canonical `focusRing(archetype, tone)` per call site),
mechanical and low-risk.

### 2E. Dependency boundaries — an orphan guard, not Nx

**Do not add Nx.** This is a single Next.js app, not a monorepo; Nx would be a
second build system to satisfy one rule.

The repo already has both mechanisms: `no-restricted-syntax` in
`eslint.config.mjs`, and 96 `*.guard.test.ts` files run by `verify`. The
`features/operations/components` island — nine files that reference only each
other — is precisely what a reachability check catches.

**Do:** `orphan-island.guard.test.ts` — walk imports from the real entry points
(`src/app/**/page.tsx`, `route.ts`, `layout.tsx`) and fail on any
`src/features/**` or `src/components/**` file unreachable from them. Seed the
allowlist with today's 82 so it lands green, then **shrink-only** — identical to
every other ratchet. This makes Standard 5's "build throws an error" real
without a new toolchain.

*(`knip` already computes reachability. Check whether a thin gate over its
output is cheaper than a bespoke walker before writing one — prefer composing
the existing tool.)*

---

## Explicit non-goals

- Chasing the 2,877 "unused exports" as if they were dead bodies.
- Deleting `AuditTimeline` (sanctioned fork, five live consumers).
- Deleting `/walk-in/page.tsx` or `useWalkInTaskRedirect` (live deep-links).
- Replacing `src/lib/feature-flags.ts` with a vendor.
- Adding Nx, or an APM without explicit approval.
- Raising any ratchet baseline, or `--no-verify`.

## Definition of done

- [ ] 1A / 1B / 1C landed; `knip` orphan count down by ~35 files / ~5k LOC
- [ ] `knip-baseline.json` count **decreased** and committed
- [ ] `pattern-evolution.md` carries the retirement rule (2A)
- [ ] `useIsColumnHidden` either retired or guarded, and its SoT row corrected
- [ ] `npm run debt` prints the ledger; `verify` echoes it
- [ ] `orphan-island.guard.test.ts` green with a shrink-only allowlist
- [ ] Flag-age guard landed, or a written decision that it is deferred
- [ ] 2C presented to the user as a costed decision — not silently installed
- [ ] `npm run verify` green (attribute foreign red gates, do not inherit them)

## Paste prompt (short)

> Read `docs/todo/zombie-code-elimination-HANDOFF.md` and execute Part 1 (1A →
> 1B → 1C → 1D), then Part 2. Re-measure with `npx knip --no-progress` first —
> the numbers are from 2026-08-02 and the tree moves. Do not delete
> `AuditLogFilterStrip.tsx`, `AuditTimeline`, or `/walk-in/page.tsx`. Do not add
> Nx, LaunchDarkly, or an APM; translate each standard into a guard test as the
> handoff specifies. `npm run verify` before done; never raise a baseline.
