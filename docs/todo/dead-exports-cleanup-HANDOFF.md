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
**Status:** in progress — 13 batches landed, next tier identified in §4
**Lane:** current checkout, `main`. Attach to `:3050`. User owns commits.
**Date:** 2026-08-08

---

## Why this matters (the short version)

Dead code is not neutral. It costs something every day it stays:

1. **It lies to the next person.** An exported function looks like a supported way to do
   something. Someone finds `getPackingKpisForPeriod`, assumes it is the house way to get packing
   KPIs, and builds on a function nobody calls and nobody maintains. Every dead export is a
   wrong turn left on the map — and this codebase's whole discipline is *compose from the named
   SoT*, which only works if the named thing is the real one.

2. **Duplicates hide inside it.** Half the deletions here were not merely unused — they were
   **second copies of something that already had one home**: a `SOURCE_PLATFORM_LABELS` beside
   the real one in `source-platform.ts`, a `ClaimSeverity` beside `receiving-claim-type.ts`, a
   `canTransition` beside the warranty state machine, `CONDITION_GRADES` declared three times.
   Those are the ones that actually bite: two copies drift, and then the same fact reads two ways
   on two screens. You cannot see them until you go looking for the dead ones.

3. **Barrels hide corpses.** A dead `export *` line keeps a whole retired component family
   "reachable", so no tool reports it. That is exactly how the pre-flush-square DS shell family
   (10 files) stayed in the tree long after `RedesignedMobileShell` replaced it — and how
   `DESIGN_SYSTEM.md` came to document components nobody could use.

4. **Every dead export widens the public surface you must not break.** Narrowing a module to
   what it actually offers is what makes the next refactor cheap. A module with 21 exports and
   3 real consumers is 18 imaginary contracts.

5. **It is the only cleanup that is provably safe.** Removing code with zero callers cannot
   change behavior — `tsc` and the test suite prove it in minutes. Compare that to the DS ratchet
   baselines (1,677 parked call sites), which are real UI migrations with real blast radius.
   This work buys clarity at near-zero risk, which is why it is worth doing steadily rather than
   in one heroic sweep.

**The honest counter-argument, so you can weigh it:** un-exporting a symbol that is genuinely
useful-but-unused makes it slightly harder to pick up later. That is why §2 has three buckets
instead of two, and why §6 exists — anything with a stated future, an external consumer, or a
docblock naming a plan is left alone and reported rather than deleted.

---

## 0. Where it stands

| | |
|---|---|
| knip baseline | **2795 → 2387** (408 findings cleaned) |
| Commits | 14, `b73a49b53`..`d453252f7` (`git log --oneline b73a49b53~1..HEAD`) |
| Files deleted | 12 |
| Also removed | 26 unused locals eslint found that knip structurally cannot see (§3.9) |
| Prior tier | `853e71315` (39 whole dead files, 2877 → 2791) |

**Two numbers that matter more than the total:**

- **~740 dead value exports remain** — the real remaining surface.
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
| `src/components/station/workbench/index.ts` | 6 — in the other session's active zone, wait for it |

**Done:** `stations/index.ts`, `support/context/index.ts`, `po-triage/types.ts` (`6fb705618`);
`workflow/index.ts`, `receiving/facts/registry.ts` (`16d13846e`); `hooks/_ui.ts`,
`hooks/_lifecycle.ts`, `nas-photos.ts` (`d453252f7`).

Then the long tail: ~780 value exports across ~380 files, mostly 1–4 each. Nothing in it is
individually interesting; work it by file, batch of 3–5, verifying each batch.

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
| `src/lib/shipping/repository.ts` (5) | Carrier **webhook subscription** helpers. Migration `2026-06-02_carrier_webhook_subscription.sql` ships the `webhook_subscription_status` column they read, but no route or cron calls them — an unplugged feature, not dead code. Deleting strands the column. |
| `allocateNextUnitId` in `src/lib/inventory/unit-id.ts` | Zero code callers, but `docs/todo/serial-label-pairing-split-combine-plan.md` names it as the unit-UID mint step of an in-flight plan. |
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
- **Resolved on the fifth attempt** (`d453252f7`) after ~40 minutes of quiet in that part of the
  tree. The pattern that worked: cut, then `git add` in the *same* command, before any
  verification. A staged deletion survived; an unstaged one did not.
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
