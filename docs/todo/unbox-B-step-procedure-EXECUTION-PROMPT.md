# EXECUTION PROMPT — Lane B · Unbox step procedure + Playwright

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Plan SoT:** [`docs/todo/unbox-B-step-procedure-PLAN.md`](./unbox-B-step-procedure-PLAN.md) — the plan wins on conflict.
> **Prerequisite:** `unbox-capture-stack-PLAN.md` Phases 0–2 complete (`CaptureStack` exists and is mounted read-only).
> **Parallel lane:** B — the restructure lane. Land after lanes A and C.

---

# Cycle Forge — Lane B: the unbox step procedure

You are Claude Code in the Cycle Forge monorepo. This lane restructures how an operator captures a carton. **Stop and ask before writing code** if either blocker below is unresolved.

## Mission

Drive the Unbox capture stack from a **data-driven step vocabulary** — PO/box photos → packing material → item photos → condition → serial — with back/forward navigation and full Playwright coverage against the QA org.

## Read first

1. `docs/todo/unbox-B-step-procedure-PLAN.md` — SoT for this run.
2. `docs/todo/unbox-capture-stack-PLAN.md` — the primitive you build on.
3. `.claude/rules/display/station.md` — §3 focus lock, §5 single active entity, §7 idempotency.
4. `.claude/rules/verify.md` — E2E runs on the **QA org**, never dogfood.
5. `docs/todo/dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md` — why photo stages are dangerous to default.

## STOP — two blockers to resolve with the human first

**B1 — step 3 has no desktop capture surface.** `LineEditPanel.tsx:620-626` says so in the code; `ReceivingPhotoButton:5-8, 88-93` documents an item mode no call site uses. Building the desktop item camera is **in scope for this lane and must be scoped explicitly.** Confirm before starting.

**B2 — "packing material" is not a photo stage.** `stages.ts:42-59` has exactly `arrival_package · unbox_carton · unbox_item · testing · packing`. Recommend folding packing material into `unbox_carton`. Adding a stage is Ask-first and touches six modules. **Never reuse `arrival_package`** — the `require_one` receive gate counts only that stage (`photo-policy.ts:150-164`) and contaminating it voids the insurance control.

Get an answer on both. Do not guess.

## Build rules

- **Step vocabulary is data, not code.** Compose `deriveLinearStepStates` (`derive-receiving-step-states.ts:97-113`); each intake type supplies its own `LinearStepFlag[]`. Hardcoding five steps breaks unfound, local pickup, returns, and multi-qty.
- **Condition is not a gate.** It renders as satisfied with the default grade; the active pointer skips it (`derive-receiving-step-states.ts:47-55` explains why). Tap or condition-token to change.
- **Multi-qty is a loop, not a step.** `ActiveLineConditionSerial.tsx:94` branches on `quantityExpected > 1`. Steps 3–5 iterate units with an explicit `n of N`.
- **Write through the existing waist** — `c.enqueueSerial`, `c.patch({ condition_grade })`, `c.commitSerialAbsent`. Create **no** new write path.
- **Motion from the SoT only** — `tabPagerVariants` + `framerTransition.tabPager` for back/forward, `framerPresence.stationSerialRow` for push-up, `collapseHeight` for collapse. Route through `useMotionPresence` / `useMotionTransition` (guard-enforced). **No GSAP, no `motion/react`** — `motion-major.guard.test.ts` fails CI.
- **Back must not discard data.** Steps view durable state; they are not a wizard buffer.
- **Amend `.claude/rules/display/station.md` in its own commit** before the input moves. §2 (scan bar pinned top) and §5 (card replaces, never accumulates) both change. Do not let a guard discover this for you.

## Playwright

`pnpm provision:qa-org` → `npx playwright test <spec> --project=qa-desktop`. Assert on `QA_FIXTURE_*` (`src/lib/tenancy/qa-org.ts`). **Extend** the existing 24 receiving/unbox specs — never orphan them.

Cover: step order · push-up collapse · back/forward preserves data · multi-qty `n of N` · **photo stage integrity (no bench capture writes `arrival_package`)** · condition-skip · scroll depth (current step one row above input at 50 rows) · wedge focus + F2.

Assert on invariants, not samples — measure the scrollport edge, not the last DOM row.

## Do NOT

- Touch labels or per-item notes (**lane C**) or the identity header (**lane A**).
- Raise any ratchet baseline.
- `test.skip` around missing data — seed the QA fixtures instead.
- Start, restart, or kill the dev server. It runs on **`:3050`** — attach.

## Done when

`npm run verify` green; all new + existing specs pass on `qa-desktop`; `station.md` amended; desktop wedge and mobile keyboard both verified.

## Report back

1. B1 and B2 resolutions as agreed.
2. The step vocabularies you authored, per intake type.
3. Specs added vs extended.
4. Anything in the plan you believe is wrong.

Commit only when asked. Stage only files you changed.
