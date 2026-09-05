# CI receipts — the self-hosted runner

Plan of record: [`docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md`](../todo/self-hosted-ci-and-fork-teardown-PLAN.md) §3–§4.
There is no remote CI. Every commit on this box gets a receipt.

## The rule for agents

**Read the receipt, do not run the gate.**

```bash
node scripts/ci-status.mjs
```

prints HEAD's receipt (lint · typecheck · unit tests · the two display
cohorts), whether each gate was served from cache (`hit`) or ran, and the
cache hit ratio over the last N receipts. Run `verify:fast` on the files you
just touched; ask `ci-status` for everything else.

## How a commit becomes a receipt

```
git commit ──► .githooks/post-commit ──► one line in .ci/queue (never blocks)
                                              │
              cycleforge-ci.timer (30 s) ─────┤  (also kicked by the hook)
                                              ▼
                                  scripts/ci-runner.mjs --drain
                    worktree /var/tmp/cycleforge-ci/<sha>  ·  .env copied
                    node_modules symlinked  ·  gates from verify-profile.mjs
                                              │
                                              ▼
                                  .ci/receipts/<sha>.json
```

- **Profile by branch:** `main` → `full` (lint, typecheck, unit tests,
  `eval:cohort slot-table`, `eval:cohort shortcuts`); anything else → `fast`
  (lint, typecheck). Override with `--profile`.
- **Input-hashed gates:** each gate in `scripts/verify-profile.mjs` declares
  `inputs`; its key is `sha256(git ls-files -s -- <inputs>)` folded with the
  toolchain and the gate's own definition. A hit copies the cached pass into
  the receipt and runs nothing. Only passes are cached. A gate with no
  `inputs` fails `src/lib/ci/ci-core.test.ts`.
- **Hermetic, with one named exception:** the worktree's `node_modules` is a
  symlink to the main checkout's (an offline `pnpm install` cannot be done on
  this box). The receipt says so under `toolchain.nodeModules`, and the
  lockfile is an input to every compile gate.
- **Untracked files in the worktree** (other than the two the runner plants)
  are a receipt-level warning — the run was not hermetic.

## Which tests run

On `main` the receipt runs every unit test (`selection: all (postsubmit)`).
Anywhere else the runner diffs the commit against its parent, runs
`impact_analysis` over each changed source file, and runs the co-located tests
of everything the change reaches. The receipt records the decision:

| `selection` | meaning |
|---|---|
| `12 test file(s) from 3 changed source(s)` | the graph answered; those tests ran |
| `none (no source changed)` | docs/config only — no unit gate |
| `all (graph stale)` | the graph reached nothing from a real source change, so the FULL suite ran instead |

The last row is the important one. An empty impact set and "nothing depends on
this" are indistinguishable, and presubmit has no second net — so an unindexed
commit costs time, never coverage.

## When a gate is red

`ci-status` says whether the commit broke it:

```
✗ Typecheck (INTRODUCED here — green at 935b1d3) — .ci/logs/…/typecheck.log
✗ Unit tests (inherited from faba71b — not this commit) — .ci/logs/…/unit-tests.log
```

That comparison is free: the parent's receipt is already on disk. `unknown`
means the parent was never measured, or ran a profile that skipped the gate.

## Flaky gates

A gate that both failed and passed on the SAME input hash cannot be reporting a
property of the code — the hash covers sources, lockfile, toolchain and the
gate definition. Those pairs land in `.ci/flaky.json`; the next failure on that
hash is `advisory-fail`, named in the receipt and printed by `ci-status`.
Entries are only ever added by the runner — **clearing one is a human
decision**. Granularity today is (gate, input hash); per-test quarantine needs
the TAP reporter parsed.

## Files on disk (all gitignored under `.ci/`)

| path | what |
|---|---|
| `.ci/queue` | `<sha> <branch> <epoch>` per line; drained FIFO, `main` first |
| `.ci/receipts/<sha>.json` | the receipt: gates × (inputHash, hit\|ran, status, durationMs, logPath) |
| `.ci/cache/<gate>/<inputHash>.json` | cached passes |
| `.ci/history/<gate>.jsonl` | every outcome, for the flake quarantine (§4.3) |
| `.ci/logs/<sha>/<gate>.log` | full gate output |
| `.ci/lock` | one runner at a time (stale after 4 h) |
| `.ci/flaky.json` | quarantine — human-cleared |

## Commands

```bash
node scripts/ci-status.mjs                 # HEAD + last 10, hit ratio
node scripts/ci-status.mjs --last 25
node scripts/ci-status.mjs --sha <sha>     # one receipt in full
node scripts/ci-runner.mjs --sha HEAD      # run one commit now (profile by branch)
node scripts/ci-runner.mjs --sha HEAD --profile full --keep-worktree
journalctl --user -u cycleforge-ci -f      # watch the drain
```

## Installing the timer (already done on this box)

```bash
cp scripts/ci/systemd/cycleforge-ci.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now cycleforge-ci.timer
```

`git config core.hooksPath .githooks` is set by `npm install` (`prepare`);
the post-commit hook needs nothing else.
