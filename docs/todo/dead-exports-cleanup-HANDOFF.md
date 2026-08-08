# Handoff — Dead-export cleanup (tier 2: symbols inside live files)

> **Find this doc when:** continuing the knip dead-code burn-down, or when a knip finding looks
> dead but you are not sure it is safe to delete. §3 is the trap list — **read it before deleting
> anything**; every entry is a mistake that was actually made (by a prior session or by this one)
> and cost real time.
>
> **The method in one line:** knip ranks candidates, but **knip is not the authority** — a direct
> word-boundary grep over `src tests scripts` is, and `tsc` is the final word.

**For:** the next Claude Code / Cursor session
**From:** Cycle Forge engineering
**Status:** in progress — 8 batches landed, next tier identified in §4
**Lane:** current checkout, `main`. Attach to `:3050`. User owns commits.
**Date:** 2026-08-08

---

## 0. Where it stands

| | |
|---|---|
| knip baseline | **2795 → 2478** (317 findings cleaned) |
| Commits | `b73a49b53` · `4ada59977` · `831669c18` · `e4d5ec79c` · `45edfdcc3` · `c80acda75` · `058b1eccf` |
| Files deleted | 12 |
| Prior tier | `853e71315` (39 whole dead files, 2877 → 2791) |

**Two numbers that matter more than the total:**

- **~947 dead value exports remain** — the real remaining surface.
- **~1,085 "dead types" in 647 files are NOT dead.** They are `Input`/`Result` types for live
  functions, used inside their own file. knip flags them because no *other* module imports the
  name. Un-exporting them is knip-appeasement that degrades the module's API for zero benefit.
  **Do not sweep them.** Judge a file by its dead *value* exports.

---

## 1. The loop (repeat exactly)

```bash
# 1. fresh knip — never trust knip-baseline.json counts alone
npx knip --cache --reporter json > /tmp/knip.json

# 2. classify (see §2 for the helper), then edit

# 3. verify, in this order, skipping none
npx tsc --noEmit -p tsconfig.json                       # must be silent
npx eslint <every file you touched>                     # REQUIRED — see §3.9
node --test --require ./scripts/register-server-only-shim.cjs \
     --import tsx --test-reporter spec 'src/**/*.test.ts'  # plain `npx tsx --test` falsely fails on server-only
node scripts/knip-gate.mjs                              # no NEW findings

# 4. bank the shrinkage — see §5, do NOT blindly `--update`
```

**Baselines only ever shrink** (`.claude/rules/verify.md`). Never raise one to make a gate pass.

---

## 2. Classify before touching anything

Three buckets, and the second and third are **ask-first**:

| | Meaning |
|---|---|
| 🗑️ **DEAD** | zero importers, confirmed by a **word-boundary grep over `src tests scripts`** |
| 🔌 **UNPLUGGED** | finished and correct, but nothing mounts it — deleting is regressive |
| ⏸️ **PARKED** | a docblock names a future phase, a plan doc, or an external consumer |

**Read the docblock first.** This repo self-documents *why* something exists, whether it is
`@deprecated`, and what superseded it. That is usually enough to classify without guessing, and
it is how every genuine save in §3 happened.

Three outcomes per symbol, not two:

- `ext=0, in<=1` → **delete** the declaration.
- `ext=0, in>1` → **un-export** (used internally). Real knip win, zero risk, no behavior change.
- `ext>0` → **CHECK by hand.** Usually a same-named symbol in another module, or a doc comment.

A classifier lives at `scratchpad/b2.mjs` in the session that wrote this; it is ~30 lines and
worth re-writing from §3's rules rather than trusting a copy.

---

## 3. Traps — every one of these actually bit

**3.1 — Substring greps false-positive constantly.** Verify every hit. `platformLabel` appears 92
times; all but one were other modules' local props. `INPUT_CLASS` matched two unrelated local
consts in `studio/`.

**3.2 — Prefix collisions in string-replace edits.** Replacing `export type ReceivingRailFeed`
silently stripped the export from **`ReceivingRailFeedId`**, which was live. Anchor with a word
boundary: `re.search(r'\bexport (const|function|type|interface) ' + name + r'\b')`. Before a
batch, list every name that is a prefix of another identifier in the repo and treat those as
hazards. `formatMonthDay` vs the SoT `formatMonthDayTimePST` is the live example.

**3.3 — knip's project globs miss `scripts/`.** `ZENDESK_CACHE_NS` and `zendeskBundleCacheKey`
are reported unused but `scripts/zendesk-bundle-cache-bench.ts` imports them. **Always grep
`src tests scripts`.** `tsc` catches this; knip does not.

**3.4 — Source-scanning guard tests.** ~228 test files `readFileSync` other files by path and
assert on their contents. Grep the bare filename in `*.guard.test.ts` before editing. A prior
session broke `tech-serial.test.ts`, which reads `insertTechSerialForTracking.ts` via a
`CALL_SITES` array. **Note the polarity**: `scan-apply.guard.test.ts` asserts
`deferInvalidateUnboxReceivingFeeds` is *absent*, so deleting it keeps the guard passing.

**3.5 — Brace matching on the wrong `{`.** A naive "find the first `{` after the name" swallows
a default-param object (`options = { year: … }`) or a return-type annotation
(`(): { x: number } {`). Both shipped broken files. Anchor on the **column-0 close**
(`\n}\n`) — this codebase is prettier-formatted, so top-level bodies always close at column 0.
Multi-line `const X = new Set([...])` needs the same care: a `;\n` search stops at the first
field terminator.

**3.6 — Deleting a symbol that a comment anchors.** `RETURN_PLATFORM_LABELS` was named by two
comments as the UI mirror of a DB enum. Deleting it is fine; leaving the comments is not.
**Fix the comments in the same change** or you have traded dead code for a lying doc.

**3.7 — A barrel hides corpses.** `hooks/index.ts` says it best: *"A barrel that re-exports
something nothing imports doesn't just widen the public surface — it hides the corpse."*
`knip` cannot see a fork whose doors are both imported, and neither can it see a component kept
alive only by an unused barrel line. Removing a barrel line usually *reveals* new findings —
that is the point, not a regression.

**3.8 — Check relative import paths, not just the `@/` alias.** Grepping only
`from '@/design-system/components/mobile'` missed `export * from './mobile'` one directory up.
`tsc` caught it.

**3.9 — `tsc` and knip BOTH miss what un-exporting leaves behind. Run eslint.**
This is the biggest process gap found, and it cost a whole extra pass. Two compounding causes:

- **The `in>1` heuristic over-counts.** It counts a symbol's own **docblock mentions** and
  `{@link X}` references as internal usage, so a symbol with only a comment referring to it looks
  "used internally" and gets un-exported when it should have been **deleted**.
- **Nothing else catches the result.** `tsc` does not run `noUnusedLocals`; knip reports unused
  *exports*, so the moment you un-export a symbol it **drops off knip's radar entirely** — the
  dead code is now invisible to the very tool you are using to find dead code.

A single pass over the files touched in this initiative surfaced **20** `unused-imports/no-unused-vars`
warnings, cascading to **26 symbols** across two more rounds (deleting one orphans its types and
its imports). Fix: **run `npx eslint <touched files>` after every batch and delete what it names,
repeating until clean.** They are warnings, not errors, and `verify.mjs` runs eslint with
`--max-warnings=10000` — so this will never fail a gate. It will just silently leave dead code
behind, which is the one outcome this initiative exists to prevent.

Leave alone the `'X' is assigned a value but only used as a type` warnings — those are `as const`
arrays sourcing a union type (`TRIAGE_PILES`, `TESTING_API_VIEWS`). The code is correct; ESLint
cannot see type-only usage of a value.

---

## 4. What is left, ranked

Barrels needing per-symbol analysis (each re-exports things imported directly from source):

| File | Dead value exports |
|---|---|
| `src/lib/workflow/index.ts` | 7 — every symbol has external refs; a barrel, needs care |
| `src/lib/stations/index.ts` | 6 — deliberate omissions documented in its docblock, read it |
| `src/components/support/context/index.ts` | 6 |
| `src/components/station/workbench/index.ts` | 6 |
| `src/components/po-triage/types.ts` | 6 |

Then the long tail: ~900 value exports across ~400 files, mostly 1–4 each.

---

## 5. Banking the baseline when the tree is shared

`node scripts/knip-gate.mjs --update` regenerates from **current** state, so it will absorb a
concurrent session's in-flight dead code into your commit. When the gate reports findings that
are not yours, update **shrink-only** instead — intersect the HEAD baseline with current reality:

```js
const head = JSON.parse(execSync('git show HEAD:knip-baseline.json').toString());
const keys = new Set(/* exports|<file>|<name> and types|… from a fresh knip run */);
head.findings = head.findings.filter(f => {
  const [k] = f.split('|');
  return (k !== 'exports' && k !== 'types') || keys.has(f);
});
```

This can only remove. **Always diff the before/after and assert `added === 0`** before staging.

---

## 6. Parked — do not delete without a ruling

| Where | Why |
|---|---|
| `src/lib/pipeline/config.ts` (5) | `scripts/jetson/trainer.py` + `setup.sh` read the same env vars; `.env.example` and `context/PIPELINE*.md` document them. TS side of a cross-language contract. |
| `src/lib/station/table-url-params.ts` (5) | `route-params.ts` **and** `param-ownership.guard.test.ts` both cite `SCOPE_PARAM`/`parseScope` *being baselined dead* as the precondition for a routing-safety argument, and the file's `*_PARAM` consts feed that guard's source regex. |
| `src/lib/settings/accessors.ts` (9) | All 9 have registry UI. **5 have zero readers anywhere** (`autoTicket`, `autoPrintLabel`, the 3 `vision.*`) — admin knobs that do nothing. Deleting the accessor hides a product bug instead of fixing it. |
| The 647 type-only files | See §0. |

---

## 7. Open SoT finding (not fixed)

`CONDITION_GRADES` is declared **three times**: `src/lib/conditions.ts` (the SoT per
`.claude/rules/source-of-truth.md`), a copy in `src/lib/schemas/failure-modes.ts`, and a third in
`src/app/api/receiving/add-unmatched-line/route.ts`. Consolidating touches validation schemas, so
it needs its own change with its own verification.

---

## 8. Concurrency warning (live as of 2026-08-08)

Another session + GitButler actively own this tree. Observed, repeatedly:

- **Edits reverted four times** — `hooks/_ui.ts`, `hooks/_lifecycle.ts`, `nas-photos.ts`, and the
  DS shell family once *after* deletion (leaving files on disk with the barrel already removed).
  **A deletion only stuck once staged in the index** (`git rm`, not plain `rm`).
- **20 confirmed-dead exports are still uncut** in those three files. They are re-baselined as
  dead and ready; they will land in minutes once that session releases them.
- **Never `git checkout --` on a shared tree.** It is the same class of destructive operation as
  `git stash`, which `workflow-safety.md` bans. Revert your own bad edit by re-editing.
- **Stage only your own files.** `git add -A` will sweep a concurrent session's work into your
  commit. Verify with `git diff --cached --name-status` before every commit.
- Attribute every red before assuming it is yours: `git status --porcelain <file>` plus
  `stat -f "%Sm" -t "%H:%M:%S" <file>`. Every failure hit this session traced to another session
  by mtime (files changing 1–60s before the check) with zero overlap with the edited files.

**Flaky, not real:** the DB-backed tenancy tests (`src/lib/tenancy/idor-regression.test.ts`) and
`neon/reason-codes-queries.test.ts` intermittently fail or hang under full-suite parallelism —
one hung for 14.6 minutes. They pass in isolation. Re-run the file before believing a failure.
