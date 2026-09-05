# EXECUTION PROMPT — One table engine: self-hosted CI + fork teardown

> Paste everything below the line into a fresh session at the repo root
> (`/home/michaelgarisek/Projects/cycleforge-app`). Recommended: Claude Fable 5.1
> at `xhigh` for §4 and §6 (architecture); Claude Opus 5 at `high` for §5, §7
> and §8 (mechanical, verifier-backed); the §9 audit in a **separate** session.
>
> **Plan SoT:** [`self-hosted-ci-and-fork-teardown-PLAN.md`](self-hosted-ci-and-fork-teardown-PLAN.md) — read §0 first, it is the cross-section order.
> **Law:** [`AGENTS.md`](../../AGENTS.md) + [`CLAUDE.md`](../../CLAUDE.md) + `src/lib/tables/table-engine-law.ts`.
> If this prompt conflicts with AGENTS.md, **AGENTS.md wins**. If it conflicts
> with the plan, **the plan wins** — this prompt is how to run it, not a second
> copy of it.

---

## 1. Mission

Make it impossible for the slot data table to fork again — not by remembering
not to, but by making the fork **fail a machine** before a human sees it — and
move the machine out of the agent's conversation and onto this box, where it
runs on every commit and leaves a receipt.

Done is not a feature list. It is three things a command can answer:

1. `node scripts/ci-status.mjs` shows a receipt for `HEAD` with every gate
   green or quarantined-and-named, and a cache hit ratio that is not zero.
2. `VERB_DECLARATION_DEBT` in `table-engine-law.ts` is `[]`, the tripwire
   passes, and `scan-out` appears on To-ship **and** Shipped from one
   declaration with its direction resolved per row.
3. `pnpm run eval:cohort slot-table` is green and the visual walk compares
   clean against operator-approved baselines built on fixtures, not on the dev
   database.

---

## 2. Rulings in force (LAW — do not re-litigate)

| # | Ruling | Where it lives |
|---|---|---|
| 1 | **One engine, generic over the row.** A family contributes an adapter + a column array — never a cell, never a row component, never a host | `TABLE_ENGINE_LAW.engineIsMonomorphic` |
| 2 | **Register to entities, mount on pages.** Scope, lane lock and layout are parameters of the mount | `TABLE_ENGINE_LAW.registerEntityNotPage` |
| 3 | **The descriptor carries data, never behavior.** No render props, no override hook, no per-family cell | `TABLE_ENGINE_LAW.descriptorCarriesDataNotBehavior`; `compoundColumnsFor()` takes no arguments |
| 4 | **Verbs bind to fields, not lanes.** One declaration per family catalog; direction from row state; bulk is a cardinality, not a mode | `TABLE_ENGINE_LAW.verbsBindToFields`; `VERB_CATALOG_MODULES` |
| 5 | **A registration is zero new `.tsx`** and zero lines in any existing component | `TABLE_ENGINE_ACCEPTANCE` |
| 6 | **The tripwire ratchets down only.** `VERB_DECLARATION_DEBT` never gains an entry; a stale entry fails the test | `table-engine-law.test.ts` |
| 7 | **Baselines are the operator's verdict.** An agent runs `--update-snapshots` only to seed; it never commits a baseline | plan §7.3 |
| 8 | **An error face is not a baseline.** A page painting `Internal server error` fails the walk; it is never masked | `visual-peers.spec.ts` `ERROR_FACES` |
| 9 | **Deterministic checks are hard gates; model-judged checks are advisory** | plan §4, §7.1 |
| 10 | **What lands is what was tested.** The merge automation tests `main`+branch in a worktree before landing | plan §4.4 |
| 11 | **Never hand-edit** `docs/eval/**/LEDGER.md`, `docs/eval/goals/**`, `docs/eval/sessions/**` — the runners write those | AGENTS.md |
| 12 | **Design tools before UI writes** (`ds_contract` / `ds_tokens` / `ds_critique`); graph `find_symbol → impact_analysis` before shared-component edits | CLAUDE.md |

### The standard

- **A law with no check is a comment.** Every invariant you add gets a line in
  a tripwire in the same change, or it does not land.
- **Raw output is evidence; prose is not.** This repo has been burned three
  times by docblocks that described behaviour nothing enforced. When you say a
  thing works, paste the command and its output.
- **A fork you find is named, not fixed in passing.** Add it to
  `VERB_DECLARATION_DEBT` (or the discover axis) with a `why`, and finish the
  step you are on.

---

## 3. How to work this prompt

- **Order is plan §0.** Do not start a later section because it looks easier.
- **Each step ends green.** `verify:fast` on touched files, the relevant cohort,
  and — once §4 lands — a receipt for the commit. A step that cannot end green
  is reported as blocked with the exact failure, not narrowed until it passes.
- **Give the model the whole section.** The architecture steps (§4, §6) are
  designs to hold in one head; hand over the full plan section and the law
  file, not a step at a time.
- **Concurrent sessions edit this tree.** A red `tsc` in a file you did not
  touch is usually someone else's in-flight work: re-run before you repair,
  and never revert a sibling's change. The runner in §4 exists precisely so
  this stops mattering.
- **Stop and report** when: a gate needs a secret you do not have (the
  `/unbox` Zoho token is one — `INTEGRATION_KMS_KEY` mismatch, config not code);
  a step requires deleting an operator-facing behaviour the plan does not name;
  or the fix for a fork is a new engine capability (that is a finding to
  surface, per ruling 5, not a thing to improvise on one family).

---

## 4. Phase A — The runner (plan §3.3 steps 1–4, 7; §4.1)

Build `scripts/ci-runner.mjs`, the post-commit hook, the `--user` systemd
timer, and `scripts/ci-status.mjs`. Reuse `gatesForProfile()` from
`scripts/verify-profile.mjs` — **do not fork the gate list**.

Non-negotiables:

- **Worktree per sha** under `/var/tmp/cycleforge-ci/<sha>`, `.env` copied in,
  removed after. Never run gates against the live tree.
- **Input-hashed gates.** Each gate declares its inputs; result keyed by
  `sha256(git ls-files -s -- <inputs>)` plus toolchain versions; **the lockfile
  is an input to lint/typecheck/unit**. An undeclared gate runs every time.
  A non-empty untracked set in the worktree is a receipt-level warning.
- **The receipt** is `.ci/receipts/<sha>.json`: `(gate, inputHash, hit|ran,
  status, durationMs, logPath)`. `ci-status` prints the last N with hit ratio.
- **A commit never waits on CI.** The hook enqueues and returns.

Prove it: two consecutive commits that touch only `docs/` produce a receipt
whose gates are all `hit`. Paste both receipts.

## 5. Phase B — Fixtures for the visual walk (plan §7.4 step 1's finding)

The idle walk exists (`tests/e2e/visual-peers.spec.ts`) and is measuring the
dev database. Give each **desk** family a route-mocked feed with a fixed row set
that exercises every cell state — priced / unpriced, urgent, blocked, note /
no note, multi-line order — in the shape `pending-grid-tanstack-tested.spec.ts`
already uses. Stations and composers stay live-data.

Capture against `next start` on the runner's built worktree, not the `:3050`
dev server — `next dev` recompiles and hot-reloads mid-capture and its
"Compiling…" pill has already landed in a baseline once (plan §7.4). Then seed,
compare twice, and paste the comparison summary. **Do not commit the
baselines** (ruling 7). Report the `desk:receiving` route question from plan
§7.4 to the operator; do not re-route the lab catalog yourself.

## 6. Phase C — Field-bound verbs, proved by `scan-out` (plan §5.2 steps 1–2)

The architecture step. A `SelectionAction` gains `writesField` and
`direction(rows)`; `resolveSelectionAction` returns the direction; the offered
set on a surface is derived from the mounted layout's resolved fields, not from
`orderBulkActionKeys`. Delete that function **and** move the e2e specs that
assert on `PENDING_BULK_ACTION_KEYS` to derive their expectation from the
catalog + layout in the same change.

Then `scan-out`: one verb, `writesField: 'orders.scanned_out'`, direction
`hasLeftWarehouse(row) ? 'undo' : 'do'`, runs `POST` / `DELETE
/api/shipped/scan-out`. A mixed selection offers the majority direction and
names the remainder in `disabledReason`. It must appear on To-ship and Shipped
with **no lane list anywhere**. Prove it with a mounted test on both desks and
the tripwire green.

## 7. Phase D — Selection + quarantine (plan §3.3 steps 5–6; §4.2–4.3)

`unit:affected` from `impact_analysis` over the diff, **falling back to
`unit:all` when `find-freshness` says the graph is stale**, recorded in the
receipt. Flake quarantine keyed by input hash, advisory until a human clears
`.ci/flaky.json`. Needs a week of receipts to be meaningful — build it, do not
tune it.

## 8. Phase E — Ratchet to zero (plan §5.2 steps 3–6)

Media catalog for `PhotoLibraryPage`'s verbs; `useTechTestingSelection` binds
instead of declaring; host sweep onto `NonlinearTableHost`; each step removes
its `VERB_DECLARATION_DEBT` line and the tripwire stays green. Mechanical —
one family per commit, each with its receipt.

Then the merge queue (plan §4.4): locate the existing push/merge automation
first (it stashes with `-u` — see the memory notes on swept stashes), and
make it test `main`+branch in a worktree before it lands. Last, because it
changes how commits land.

## 9. Audit (plan §6) — separate session, report only

Run the §6 prompt verbatim after Phase C and again after Phase E. It changes
nothing. If its tripwire line is red, the audit is void and says so.

---

## 10. Definition of done

All of these, pasted as command + output, not described:

- `node scripts/ci-status.mjs` — receipt for `HEAD`, all gates green or
  quarantined by name, hit ratio > 0.
- `npx tsx --test src/lib/tables/table-engine-law.test.ts` — green with
  `VERB_DECLARATION_DEBT = []`.
- `pnpm run eval:cohort slot-table` — `"tripwire": true, "verify": true`.
- `npx playwright test tests/e2e/visual-peers.spec.ts --project=desktop` —
  compares clean against fixture baselines, twice.
- The §9 audit's final table with every axis `CLEAN` or `UNKNOWN` with a
  stated reason — no `DEBT`.
- A one-paragraph list of what you did **not** do and why, if anything.
