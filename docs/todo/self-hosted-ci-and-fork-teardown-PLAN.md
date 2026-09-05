# Self-hosted CI + fork teardown — PLAN

**Date:** 2026-09-04 · **Status:** in progress — law + tripwire landed (§5.1), stale CI comments fixed (§3.3 step 9), visual walk seeded idle-only (§7.4 step 1), **runner + input-hash cache + post-commit queue + `--user` timer + `ci-status` landed 2026-09-04 (§3.3 steps 1–4, 7)**; §3.3 steps 5–6 and 8, §5.2 and §7.4 steps 2–6 are unbuilt · **Validated:** 2026-09-04 against industry CI practice (§4) — four gaps found, build order amended · **Reviewed:** 2026-09-05 (§0 corrections)
**Related:** [`nonlinear-data-table-engine-PLAN.md`](nonlinear-data-table-engine-PLAN.md) · [`one-table-sot-teardown-HANDOFF.md`](one-table-sot-teardown-HANDOFF.md) · law: `src/lib/tables/table-engine-law.ts` · tripwire: `src/lib/tables/table-engine-law.test.ts`

Three questions, answered in order: is the toolchain eating the agent's context,
where does CI actually live now, and how do the remaining forks get deleted with
proof rather than assertion.

---

## 0. Sequence across sections (read this before any section's own order)

Each section orders its own steps; none says what comes first across them. This
does. Dependencies, not preferences:

1. **§2 fixes** — cap `ds_contract`, default `limit: 2`. Cheap, and every later
   step gets cheaper. (Garisek engine change; law stays here.)
2. **§3.3 steps 1–4 + 7** — runner, input-hash cache, post-commit queue, timer,
   `ci-status`. This is the receipt every later step is verified against.
3. **§7.4 fixtures** (the precondition named in step 1's finding) — route-mocked
   feeds per family. Until this lands the visual gate is advisory: it is
   measuring the dev database, not the grid.
4. **§5.2 steps 1–2** — field-bound verbs, proved by `scan-out`. The
   architecture step; do it with the full spec in front of the model, not
   incrementally.
5. **§3.3 steps 5–6** — affected-test selection and flake quarantine. Needs the
   cache from (2) and a week of receipts to have anything to quarantine.
6. **§5.2 steps 3–6** — migrate the debt sites, host sweep, ratchet to zero.
   Mechanical, each verified by the tripwire.
7. **§3.3 step 8** — merge queue. Last, because it changes how commits land and
   everything above must already be green under the runner.
8. **§7.4 steps 2–6** — axe, `ds_critique` wiring, reviewer, sibling diffs.

Run **§6** (the audit) after (4) and again after (6). It is report-only; its
answer is the state, not the plan.

---

## 1. Current state (measured, not assumed)

**There is no remote CI.** `.github/` does not exist — the workflows were deleted
in `2f6dcd784 chore(ci): remove all GitHub Actions workflows`. Everything that
calls itself CI today runs on this machine:

| gate | trigger | where |
|---|---|---|
| `verify` (Lint · Typecheck · Unit tests …) | `git push` → `main` | `.githooks/pre-push` |
| `verify:dogfood` | `git push` → any other ref | same hook |
| `verify:fast` | agent inner loop | agent runs it by hand |
| `eval:cohort <id>` | agent, before "done" | agent runs it by hand |
| `eval:station <id>` | agent, floor-station work | agent runs it by hand |

**Two pieces of stale prose to fix while we are here** — both claim a CI that no
longer exists, and this repo has now been bitten three times by comments that
described behaviour nothing enforced:

- `scripts/verify.mjs` header: *"the local mirror of CI (.github/workflows/ci.yml → `ci` job)"*.
- `.githooks/pre-push`: *"CI on GitHub still runs the full gate on every PR / push to main."*

---

## 2. Is the toolchain eating context?

**Partly — but not where it looks.** Measured this session:

| source | cost | verdict |
|---|---|---|
| `ds_contract` (design MCP) | 5 matches × up to ~3.9 KB of `doNot` = **4–6 k tokens per call** | **The real bloat.** `pinned.json` is 57 KB / ~13.5 k tokens total and grows every time a law is written |
| `code-graph` `find_symbol` / `impact_analysis` | ~200–600 tokens per call | Cheap. Leave alone |
| `eval:cohort` | ~150 tokens of JSON tail | Cheap in CONTEXT; **30–60 s of wall clock per run** — the cost is time, not tokens |
| Agent file reads (`sed`/`grep` windows into 1 500-line files) | Largest single consumer overall | Not a toolchain problem |

So the correct diagnosis is: **the eval runners are a latency problem, not a
context problem; the design pins are a context problem; the graph is neither.**

Two specific regressions to fix:

1. `DataTable`'s pin is **3 630 chars** and I appended the engine law to it on
   2026-09-04, making the worst offender worse. `DeskPageChrome` is 3 876.
   A `doNot` that long is not read carefully by a human OR a model.
2. `ds_contract` returns **five** full entries by default. Most calls need one.

### Fixes (cheap, do first)

- **Cap the payload.** `ds_contract` returns `useWhen` + a `doNot` **summary**
  (first ~400 chars) + a `lawRef` path. Full text on `ds_contract({ id, full: true })`.
  Engine change in Garisek (`target-engine.mjs`); law text stays here.
- **Split long pins** into `doNot` (the refusals, short) and `why` (the reasoning,
  fetched only on `full`).
- **Default `limit: 2`**, not 5.
- **Move the gates out of the conversation** (§3) so the agent stops spending
  minutes of wall clock re-running what a daemon already knows.

---

## 3. Self-hosted CI

The goal is not to rebuild GitHub Actions. It is: **the gates run without the
agent, on every commit, and leave a receipt anyone can read.**

### 3.1 Shape

```
git commit ──► post-commit hook ──► enqueue sha in .ci/queue
                                        │
        systemd --user timer (30 s) ────┤
                                        ▼
                            scripts/ci-runner.mjs
                    (clone sha to /var/tmp worktree, run gates)
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
          .ci/receipts/<sha>.json                 desktop notification
       (gate × pass/fail × duration × log)         on first red only
```

Why a **worktree per run**: the working tree is shared with concurrent agent
sessions (this repo's standing hazard — a sibling session's in-flight edit made
`tsc` red three times today). CI that reads the live tree measures a moving
target and reports failures that belong to somebody else.

### 3.2 Gate tiers

| tier | gates | when |
|---|---|---|
| **fast** | lint, typecheck | every commit |
| **full** | + unit tests, `eval:cohort slot-table`, `eval:cohort shortcuts` | every commit to `main`, and on demand |
| **deep** | + e2e, perf gate, `eval:station` peers | nightly timer |

### 3.3 Build order (amended after §4)

1. ✅ `scripts/ci-runner.mjs` (2026-09-04) — takes a sha + profile, makes a worktree under
   `/var/tmp/cycleforge-ci/<sha>`, copies `.env` in (worktrees do not carry
   gitignored env — standing hazard), runs `gatesForProfile()` (reuse
   `verify-profile.mjs`; do not fork the gate list), writes the receipt, removes
   the worktree. **Measured caveat:** `pnpm install --offline --frozen-lockfile`
   fails in a fresh worktree (`ERR_PNPM_NO_OFFLINE_TARBALL` — the store does
   not hold the tarballs), so `node_modules` is SYMLINKED from the main
   checkout and named in the receipt (`toolchain.nodeModules`). The lockfile
   stays an input to every compile gate, so a dependency bump never serves a
   stale pass; it re-runs against whatever the main tree has installed.
   Worktree creation is ~1.2 s; typecheck in it passes with no `.next/` and no
   `next-env.d.ts` (measured 1m32s).
2. ✅ **Input-hash the gates** (§4.1; 2026-09-04). Each gate declares the paths it reads; its
   result is keyed by `hash(git ls-files -s <paths>)`, and a hit is served from
   `.ci/cache/<gate>/<inputHash>.json` without running. The sha receipt is then a
   list of `(gate, inputHash, hit|ran)`. This is the "checksum" — the same
   action-cache idea Bazel / Buck2 run on, at the granularity this repo has.
   Only PASSES are cached; every outcome is appended to `.ci/history/<gate>.jsonl`
   so step 6 can see a fail→pass on identical inputs. Tripwire:
   `src/lib/ci/ci-core.test.ts` (an undeclared gate fails the test).
3. ✅ `.githooks/post-commit` (2026-09-04) — append the sha to `.ci/queue`. Non-blocking; a
   commit must never wait on CI. Resolves the queue through the git common dir
   so a hop-worktree commit lands in the same queue.
4. ✅ `~/.config/systemd/user/cycleforge-ci.{service,timer}` (2026-09-04; source of
   truth `scripts/ci/systemd/`) — drain the queue every 30 s (`OnUnitInactiveSec`,
   so a drain never overlaps itself). `--user` so it dies with the session and
   needs no root. `Nice=10`, `TEST_CONCURRENCY=4`.
5. ✅ **Affected-test selection** (§4.2; 2026-09-05) — `unit tests` is two gates:
   `Unit tests (affected)` (the co-located tests of everything
   `impact_analysis` reaches from the diff, on every non-`main` commit) and
   `Unit tests` (all, postsubmit on `main`). The decision lands on the receipt
   as `selection`; an empty impact set over a real source change is read as a
   STALE graph and falls back to the full run (`all (graph stale)`), because on
   presubmit there is no second net. Pure half + tripwire:
   `selectAffectedTests` in `scripts/ci/ci-core.mjs`.
6. ✅ **Flake quarantine** (§4.3; 2026-09-05) — a gate that both failed and
   passed on the SAME `inputHash` is recorded in `.ci/flaky.json`; its next
   failure on that hash is `advisory-fail`, named in the receipt's
   `quarantined` and printed by `ci-status`. Entries are only ever added —
   clearing one is a human decision. **Granularity is (gate, inputHash), not
   (test, inputHash):** per-test quarantine needs the TAP reporter parsed, which
   is the next cut. Nothing is quarantined yet — it needs a week of receipts,
   which is the point of building it now.
7. ✅ `scripts/ci-status.mjs` (2026-09-04) — print the last N receipts (with cache hit ratio
   and quarantine list); wired into AGENTS.md / CLAUDE.md as the thing to READ instead
   of re-running gates. Exit 0 = HEAD green, 1 = HEAD red, 2 = no receipt yet.
8. **Merge queue** (§4.4) — the push/merge automation tests the MERGE RESULT
   (`main` + branch, in a worktree) before landing, not the branch tip.
9. ✅ Fix the two stale comments in §1 (done 2026-09-04: `scripts/verify.mjs` header, `.githooks/pre-push`).

### 3.4 What this buys the agent

The rule becomes **"read the receipt, do not run the gate"** — the agent runs
`verify:fast` only on files it just touched, and asks `ci-status` for everything
else. That reclaims the 30–60 s × N eval runs per session, which is the actual
cost being paid today.

---

## 4. Validation against industry CI (2026-09-04)

The plan as first written was **structurally right and operationally naive**:
it had the hermetic run and the receipt, and none of the four mechanisms that
let Google / Meta / Anthropic run thousands of builds a day without either
re-running the world or drowning in red. Each is named with what they do, what
this plan had, and the fix — sized for a one-machine repo, not a fleet.

| practice | what they do | plan had | gap | fix |
|---|---|---|---|---|
| **Action cache / content addressing** (Bazel, Buck2) | Every action's result is keyed by the hash of its INPUTS; unchanged inputs ⇒ cached result, nothing runs | Receipt keyed by **sha** | A docs-only commit re-runs lint + tsc + tests; a revert re-runs everything it already proved | §4.1 — key each gate by its input hash; sha receipt becomes an index over gate hashes |
| **Presubmit vs postsubmit** (Google TAP) | Affected tests before merge; everything at head continuously | Tiers by branch/time (fast / full / deep) | Tier choice ignores what the change TOUCHED | §4.2 — "affected" is a tier computed from the diff, not a schedule |
| **Test selection** (Meta, *Predictive Test Selection*, 2018) | ML picks the tests likely to fail; halves infra cost while catching >99.9 % of faulty changes | Whole profiles every run | No selection at all | §4.2 — dependency-based selection via the code graph (`impact_analysis`); ML is unnecessary at this scale |
| **Flake quarantine** (Google presubmit rescue; Anthropic's >99 % signal reliability) | Auto-detect fail→pass on identical inputs, remove from the critical path, file a bug | Nothing | This session alone produced three flake sources: sibling-session edits in the shared tree, `server-only` shim tests in the plain runner, torn `.next` type files | §4.3 — quarantine by input hash; advisory until cleared |
| **Merge queue** (Anthropic on Buildkite; GitHub merge queue) | Serialize landings; test the MERGED result, not the branch tip | Pre-push tests the local tip | Two sessions push to `main` concurrently; the merge automation stashes/lands untested combinations (memory: swept stashes, `git add -A` collisions) | §4.4 — the landing script tests `main`+branch in a worktree first |
| **Culprit finding** (TAP) | Bisect the red range using stored per-change results | Nothing | Postsubmit red on `main` has no cheap way to name the commit | Falls out of sha-indexed receipts: bisect over cached results, no re-runs |
| **Eval gates for model-judged checks** (golden sets, thresholds, N-run averaging) | Deterministic checks are hard gates; model-scored checks are thresholded with noise handling, small set per PR, full set nightly | Cohort/station evals are deterministic code checks — already hard gates | The Garisek goal-run / Host loops are model-judged and currently un-gated | Keep cohorts hard; any model-judged gate is advisory with a 3-run median and a golden set ≤ 100 items on PR, full nightly |
| **Hermeticity** (all of them) | A test declares its inputs; anything reaching the network/DB is an integration test | Worktree per run ✓ | Worktrees lack `.env`; unit tests that hit the dev DB are non-hermetic and flake with data | §4.1 copies `.env`; DB-touching tests move to the **deep** tier against a seeded DB |

### 4.1 The checksum: input-hashed gates

A gate is `(name, cmd, inputs: glob[])`. Before running:

```
inputHash = sha256( git ls-files -s -- <inputs> )      # blob ids, no file reads
hit       = .ci/cache/<gate>/<inputHash>.json exists
```

`git ls-files -s` already carries every tracked blob's content hash, so the
input hash costs one git call and reads no files. Untracked files are included
via `git ls-files -o --exclude-standard` + `git hash-object`, so an uncommitted
edit in the tree is part of the key (this matters: the runner works on a
worktree of a sha, so untracked files should be EMPTY there — a non-empty set is
itself a receipt-level warning that the run was not hermetic).

Inputs per gate, first cut: lint / typecheck → `src/** tsconfig*.json eslint.config.* package.json pnpm-lock.yaml`
(the lockfile is an input: a dependency bump changes what `tsc` says about
`src/` without touching `src/`) plus the toolchain version (`node --version`,
`pnpm --version`) folded into the hash; unit → the graph-selected test files +
their transitive imports + the lockfile; cohort → the cohort's `critiqueFiles`
+ `tripwires` + `PRODUCT_TABLES` sources. A gate whose inputs are not declared
runs every time — undeclared is never cached.

### 4.2 Affected tests from the code graph

The repo already owns the dependency graph big companies build test selection
on. `impact_analysis` from each changed file yields the reachable set; the
`unit:affected` gate runs the `*.test.ts` files inside it. `unit:all` runs
postsubmit on `main`. No ML: at this repo's size the graph is exact and cheap,
and Meta's paper is explicit that selection buys cost, not correctness — the
postsubmit full run is what guarantees the 0.1 % it misses.

**Precondition: the graph must be at least as new as the sha.** The code graph
is indexed by Garisek-OS on its own cadence, and a graph that lags the commit
under-selects silently — exactly the failure the postsubmit run exists to catch,
but on presubmit there is no second net. `src/lib/eval/find-freshness.ts`
already decides whether a `find` is fresh enough to trust; `unit:affected` uses
the same decision and **falls back to `unit:all`** when the graph is stale,
recording `selection: 'all (graph stale)'` in the receipt.

### 4.3 Flake quarantine

Same `inputHash`, different outcome ⇒ flaky. Record `{ test, inputHash, seen[] }`
in `.ci/flaky.json`; the hard gate excludes it and the receipt lists it as
advisory. A human clears the entry. Three known sources to expect on day one:
sibling-session edits (fixed by the worktree), `server-only`-shimmed tests
(fixed by tiering), torn `.next` generated files (fixed by not building in-tree).

### 4.4 Merge queue, one-machine edition

The existing push/merge automation lands `main` from the working tree. Before it
does: `git worktree add /var/tmp/cycleforge-ci/merge-<sha> main`, merge the
branch there, run the **fast** profile on the result, and land only on green.
Serialized by a lockfile. It is not Buildkite; it is the one property that
matters — *what lands is what was tested*.

### 4.5 What this does NOT adopt, and why

- **Remote execution / distributed cache** — one machine, 16 cores; the action
  cache in §4.1 gets ~all of the benefit with none of the infrastructure.
- **ML test selection** — the graph is exact here; a model would be guessing at
  something we can compute.
- **A hosted CI product** — the constraint is context and wall clock in agent
  sessions, not compute; a hosted runner adds a network hop to every receipt
  the agent needs to read.

---

## 5. Fork teardown — delete the components, port the items

Scope: every surface that re-implements what the engine owns. The display axis
was cut on 2026-08-29 (thirty tables). What remains is the axis around it.

### 5.1 The inventory (build it, do not guess it)

Extend `slot-table-discover.ts` with a second axis so the same DELETE/KEEP
machinery covers actions and hosts:

| axis | DELETE signal | KEEP signal |
|---|---|---|
| **verb declaration** | `SelectionAction` literal outside `VERB_CATALOG_MODULES` | the catalog modules themselves |
| **lane key list** | a hardcoded array of action keys switched on a route/lane | a catalog's own key enumeration |
| **grid host** | `*GridView` / `*GridHost` / `*GridRow` for a registered family | `NonlinearTableHost`, `DataTable` |
| **row source** | a page-local fetch that duplicates a family reader | the family reader + a scope param |

Known today (the ratchet in `table-engine-law.ts`):

- `src/components/photos/PhotoLibraryPage.tsx` — a PAGE mints five photo verbs.
- `src/components/tech/useTechTestingSelection.tsx` — declares two assign verbs
  instead of binding keys from the receiving catalog.
- `orderBulkActionKeys()` — the hardcoded per-lane key list the law forbids.

### 5.2 Order of work

Each step is independently shippable and leaves the tree green.

1. **Field-bound verb resolution.** A verb declares `writesField` + `direction(row)`.
   `resolveSelectionAction` gains the direction, and the offered set is derived
   from the mounted layout instead of a lane list. *Deletes `orderBulkActionKeys`*
   — and with it `PENDING_BULK_ACTION_KEYS`, which the e2e specs assert against
   by name ("named so specs assert against the registry"). Those specs move to
   deriving the expected set from the catalog + the mounted layout, in the same
   change, or the step is not green.
2. **`scan-out` as the proof case.** One reversible verb, both directions
   (`POST` / `DELETE /api/shipped/scan-out` already exist), bound to
   `orders.scanned_out`. It must appear on To-ship **and** Shipped from one
   declaration, with the direction resolved per row.
3. **Media family catalog.** Move `PhotoLibraryPage`'s five verbs into a catalog
   module; the page binds keys. Remove its debt line.
4. **Testing binds, stops declaring.** Same for `useTechTestingSelection`.
5. **Host sweep.** Any remaining `*GridHost` for a registered family collapses
   onto `NonlinearTableHost` (already planned as `one-table-engine-orders-host-PLAN.md`).
6. **Ratchet to zero.** `VERB_DECLARATION_DEBT` empties; the tripwire's allowlist
   is then the catalogs alone.

### 5.3 Definition of done

Not "the diff looks right" — these three, mechanically:

- `VERB_DECLARATION_DEBT` is `[]` and the tripwire still passes.
- No file outside `VERB_CATALOG_MODULES` matches the declaration regex.
- Adding a table touches zero `.tsx` (`TABLE_ENGINE_ACCEPTANCE`).

---

## 6. Verification prompt

Paste this to audit the teardown. It is written to make a *report*, not a fix —
so a green answer cannot be produced by editing the thing being measured.

```text
Audit the one-table-engine teardown. Report only; change nothing.

For each item, give me: the mechanical check you ran, its raw output, and a
verdict of CLEAN / DEBT / UNKNOWN. If a check cannot be made mechanical, say so
and mark it UNKNOWN — do not substitute reading the code for running a check.

1. VERB DECLARATION. List every file matching
   /useMemo<SelectionAction|satisfies SelectionAction|:\s*SelectionAction<[^>]*>\s*=\s*\{/
   under src/ (excluding *.test.*). Compare against VERB_CATALOG_MODULES and
   VERB_DECLARATION_DEBT in src/lib/tables/table-engine-law.ts. Any file in
   neither list is a FORK — name it and the verbs it mints.

2. LANE KEY LISTS. Find every hardcoded array of action keys selected by route,
   lane, orderView or page. `orderBulkActionKeys` is the known one; report any
   others and whether each is still referenced.

3. GRID HOSTS. List files matching *GridView|*GridHost|*GridRow under src/.
   For each, say which entity family it serves and whether that family is in
   PRODUCT_TABLES / REGISTERED_BINDINGS. A host for a registered family is a FORK.

4. DESCRIPTOR BEHAVIOR. Show that compoundColumnsFor still takes no arguments,
   that compound-row-model.ts contains no ReactNode/JSX types, and list every
   call site that post-processes the shared base array (a .map/.filter over
   compoundColumnsFor). For each, state whether it changes DATA (tier, key
   filtering) or BEHAVIOR — behavior is a FORK.

5. ROW SOURCES. For each registered table, name the reader it queries. Two
   readers for one entity, or a page-local fetch duplicating a family reader,
   is a FORK.

6. ACCEPTANCE. Take the most recent commit that added or ported a table. List
   the .tsx files it created or modified. Zero is the passing answer; anything
   else names the engine capability that was missing.

Finish with a single table: axis | CLEAN/DEBT/UNKNOWN | count | the exact
command that produces the number. Then run `pnpm run eval:cohort slot-table`
and paste its JSON tail. If tripwire is false, the audit is void — say so.
```

### 6.1 Why the prompt is shaped this way

- **Report-only** — an audit that may edit becomes a fix that reports itself green.
- **Raw output required** — this session had two cases where the code said one
  thing and the running system did another (the Shortage desk's "locked to
  BLOCKED" docblock; `moneyText` printing `$0.00` for absent). Prose is not
  evidence.
- **UNKNOWN is a legal answer** — a checker forced to say CLEAN will say CLEAN.
- **Ends on the cohort** — a tripwire failure voids the audit, because the
  measuring instrument is part of what is being audited.

---

## 7. UI / UX CI — what a "10/10" gate should actually be

**Measured first:** 220 Playwright specs, **zero** `toHaveScreenshot`, **zero**
axe-core, a perf gate that exists (`perf-gate.mjs`), and `ds_critique` as the
only design check — heuristic, per file, run by hand. Every UI regression found
today (`$0.00` on unpriced rows, the amount slot not rendering, a packed order on
the Shortage desk, the select-all hidden behind a probe) was caught by a
**rendered screenshot**, never by a unit test — and the unit tests were green
every time. That is the whole argument for this section.

### 7.1 A score is the wrong shape for a gate

A model-judged "impeccable 10/10" as a hard gate fails the same way LLM eval
gates fail everywhere (§4): the score moves ±1 with no code change, the first
random red gets the gate disabled, and a number is not a diff anyone can act on.
Use the judge — but as the **reviewer**, not the gate. The gate is deterministic:

| layer | what it is | hard / advisory | exists? |
|---|---|---|---|
| **Law tripwires** | the rulings already made, as code (`slot-table` paint law, `table-engine-law`, header-sort, shortcut display) | hard | ✓ |
| **Token drift** | `ds_critique` on changed `.tsx`: arbitrary literals, forked primitives | hard on **new** literals (ratchet), advisory on existing | ✓ by hand → wire |
| **Visual regression** | screenshot every `PRODUCT_TABLES` peer + every station shell at one viewport, two states (idle · selection), diff against an **operator-approved baseline** | hard on drift > threshold; a change is a diff a human approves, not a score | idle only (§7.4 step 1); selection state + fixtures unbuilt |
| **a11y** | axe on the same screens; zero new violations | hard (ratchet) | ✗ — To-ship already lost 10 points once (`aria-required-children`) |
| **Perf budget** | existing `perf-gate` per surface | hard on regression vs baseline | ✓ |
| **Design review** | `impeccable` finish-reviewer over the *diff images* + changed files, against the direction contract | **advisory** — posts findings to the receipt, never blocks | plugin exists, unwired |

The score becomes a trend line in the ledger, not a bar. "10/10" is then a
statement about the *ratchets*: zero literals, zero new violations, zero
unapproved pixel drift, every law green — each of which is a yes/no a machine
can answer.

### 7.2 The most useful case: the one-engine fan-out

Screenshot **one desk per registered family** (24 peers) in two states. Because
every peer mounts the same engine, one regression in `CompoundCells.tsx` shows
up as 24 diffs at once — the fan-out that makes a per-page screenshot suite
uneconomic elsewhere is exactly what makes it decisive here. Same for a floor
station: one `StationComposerHost` change, every station shell diffs.

The second most useful case is the **fork detector**: a screen that *should*
match its sibling (Exceptions vs To-ship, Pack vs Unbox) is diffed against the
sibling, not against itself. Drift between siblings is a fork surfacing as
pixels before it surfaces as code.

### 7.3 Approval is the operator's verdict

Baselines are not committed by agents. A visual diff lands in the receipt with
before/after; the operator approves it (the same "Operator verdict" block every
LEDGER already carries), and only then does the baseline move. That is the one
human step, and it is the right one: the operator already walks the desks —
this makes the walk a checkpoint instead of a memory.

### 7.4 Build order

1. ✅ `tests/e2e/visual-peers.spec.ts` (2026-09-04) — iterates
   `DESIGN_LAB_VIEWPOINTS` (derived from the station cohort + `PRODUCT_TABLES`,
   so it cannot drift from the registry), `toHaveScreenshot` idle at 1600×900
   on the desktop project, mobile viewpoints on the iPhone project (**the mobile
   project has not been run once — unverified**). Baselines
   live beside the spec (`visual-peers.spec.ts-snapshots/`, Playwright's own
   convention — one fewer path to configure). Only `[data-col="dates"]` is
   masked (clock-derived); the Next dev-overlay badge is hidden; a page that
   paints an error face (`Internal server error`, …) FAILS rather than seeding
   — an error is not a baseline. Selection state is the next cut once the
   select-mode entry is parameterised.

   **Finding from the first seed (2026-09-04):** the live dev DB is a moving
   target in a way that defeats the point — To-ship baselined as the first-run
   "No orders yet" empty state because the one in-warehouse order had been
   deleted by a sibling session's E2E cleanup minutes earlier. A baseline of an
   empty grid tests nothing about the grid. So fixtures are not step 2, they
   are the precondition for the desks: each family gets a route-mocked feed
   (the shape `pending-grid-tanstack-tested.spec.ts` already uses) with a
   fixed row set that exercises every cell state — priced/unpriced, urgent,
   blocked, note/no note, multi-line order. Stations and composers, whose
   chrome is the subject, can stay live-data with masks.

   **Seed results (desktop, 2026-09-04): 25 baselined, 2 refused, 5 mobile skipped.**
   - `station:unbox` and `composer:unbox` refused by the error-face guard —
     `/unbox` paints "Internal server error" because
     `GET /api/zoho/purchase-orders` returns 500:
     *"integration payload could not be decrypted with INTEGRATION_KMS_KEY — it
     was encrypted under a different key."* The dev DB's Zoho token was
     encrypted by another environment's key. Config, not code; the guard did
     exactly what it is for — an error is not a baseline.
   - `desk:receiving` baselined an EMPTY STAGE: the lab catalog routes it to
     `/receiving`, which mounts `ReceivingSurfacePage` (rail + blank centre
     until a line is picked). The receiving compound grid actually renders
     inside `UnboxWorkspaceView` on `/unbox`. The catalog entry's `exercise`
     ("read a dense compound row") cannot be performed at its own `route`.
     Not changed here — the lab catalog is its own SoT with its own tripwire;
     the operator should re-route `desk:receiving` or add a `?open=` param.
   - **First comparison pass: 7 of 25 desks drifted against baselines minutes
     old** (0.01–0.05 of pixels). Two signatures, both the spec's fault, not
     the product's: (a) every glyph on the page differed with identical layout
     — the web font had not loaded in one run; (b) skeleton bars vs rows — the
     desk paints an RSC stand-in → skeleton → live rows, and a fixed delay
     after `networkidle` lands on whichever is up. Fixed by waiting on the
     STATES (`document.fonts.ready`, no `[aria-busy]`, no
     `[data-paint-surface]`, no visible `.animate-spin`), each capped at 20 s
     so a never-loading page is a finding, not a hang. This is the flake
     class §4.3's quarantine exists for; better to remove the cause.
   - **Second pass: 21 / 27, 6 drifted, and the walk took 12.7 min.** Two more
     causes, both now handled in the spec: (c) the orders desks keep an
     `sr-only` copy of the first-paint stand-in in the DOM permanently (1×1 px
     for the RSC seed), and Playwright's `hidden` wait counts a 1 px box as
     visible — every orders desk sat at the 20 s cap. The settle now polls
     real bounding boxes (> 4 px) under one 15 s cap. (d) Overlay scrollbars
     are LAYOUT — a body that crosses the overflow threshold between runs
     shifts every column by the gutter and every glyph "changes"; hidden for
     capture, as Chromatic does. Tolerance set to 1 % from the measured
     anti-aliasing variance on text-heavy desks (~0.7 % with identical
     layout), not from taste.
   - **Third pass (hardened spec): 24 / 27 compare clean, walk 5.0 min (was
     12.7).** The two `/unbox` refusals are the KMS 500 (expected until the
     token is re-encrypted). One real drift remains — `desk:unfound` at 0.03 —
     classified below. Everything the spec could fix is fixed; what is left is
     the dev database moving, which is the fixtures argument in this same
     section, not another settle tweak.
     **Correction after classifying it:** `desk:unfound`'s drift was NOT data.
     Baseline and actual were identical except the animated "Compiling…" pill
     — Next's dev indicator, inside `nextjs-portal`, which the spec hides… by an
     `addStyleTag` after `goto`. Under `next dev` a route can recompile and
     hot-reload between `goto` and the shot, replacing the document and
     discarding the injected style. Fixed by passing the CSS as
     `toHaveScreenshot({ style })`, which Playwright re-injects at capture.
     Verified: re-seed + two compares on `desk:unfound`, both clean. Lesson for
     the runner (§3): capture against `next start` on a built worktree, not
     `next dev` — a dev server is not a hermetic subject.
   - Baselines are UNCOMMITTED under `tests/e2e/visual-peers.spec.ts-snapshots/`.
     Seeding is the one time an agent runs `--update-snapshots`; committing
     them is the operator's approval step.
2. Add `@axe-core/playwright` to the same walk; snapshot the violation set per
   screen; ratchet (no new ids).
3. Wire `ds_critique` as a gate over `git diff --name-only -- 'src/**/*.tsx'`;
   fail on `arbitrary_literals` increasing for a file.
4. `impeccable` finish-reviewer as an advisory step on the diff images; findings
   into the receipt under `review`.
5. Sibling-diff pairs declared as data: `[['orders','exceptions'], ['pack','unbox']]`.
6. Tier: visual + axe run **full** (main + on demand); the reviewer runs **deep**
   (nightly) — model-judged, so it never sits on the commit path.
