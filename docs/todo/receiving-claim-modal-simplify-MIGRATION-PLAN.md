# Migration plan — simplify `ReceivingClaimModal` (5 steps)

**Executor:** Grok (this doc is the self-contained prompt).
**Verifier:** Claude (this session or a follow-up) — reviews Grok's diff against the acceptance criteria and verification commands in each step before it's considered done. Do not treat a step as complete just because the code compiles; the verifier re-runs the exact commands listed.
**Source:** [`receiving-claim-modal-auto-ticket-GEMINI-RESEARCH-BRIEFING.md`](receiving-claim-modal-auto-ticket-GEMINI-RESEARCH-BRIEFING.md) (the research brief) + its answer (external deep research, verdicts D1–D7) + this session's direct verification of every claim below against the real codebase (not inferred — grepped).

---

## 0. Ground rules (read first — these are hard, not house style)

- **Lane:** `main` (this checkout). Stay on it — no new branch, no worktree switch, never `git stash`.
- **Dev server:** already running on `:3050`. Attach, never start/restart/kill it.
- **Commits:** the user manages commits. Leave changes uncommitted in the working tree; stage nothing yourself.
- **`npm run verify` must be green before any step is called done** — lint, typecheck, unit tests, DS ratchet guards, route-auth drift, schema drift. **Never raise a ratchet baseline to make it pass** — fix the code instead.
- **Do not touch anything outside the file list given in a step.** If you find something else that looks wrong while working, note it at the end of your report — do not fix it inline. Scope creep is the #1 way this kind of refactor goes wrong.
- **Each step is independently revertible.** Finish and verify one step fully (including `npm run verify`) before starting the next. If a step's verification fails and you can't fix it within that step's own scope, stop and report — do not carry a red step into the next one.
- **No product/UX decisions.** Steps 1–4 are pure internal refactors (same behavior, less code). Step 5 is explicitly **not authorized to execute** — see §Step 5.

---

## 1. Verified facts — do not re-derive, do not contradict

Everything below was confirmed by grep against the live tree on 2026-07-30. If your own exploration suggests otherwise, trust the grep, re-run it, and stop to report the discrepancy rather than silently acting on a different premise.

| Claim | Evidence |
|---|---|
| `POST /api/receiving/zendesk-claim/draft` (route.ts + `src/lib/zendesk-claim-draft-llm.ts`) has **zero callers** anywhere in `src/` | `grep -rn "zendesk-claim/draft" src` matches only the route file itself |
| `POST /api/receiving/zendesk-claim/assist` (route.ts) has **zero callers** anywhere in `src/` | `grep -rn "zendesk-claim/assist['\"\`]" src` (excluding `assist-seller`) matches only the route file itself |
| `POST /api/receiving/zendesk-claim/classify` (route.ts + `src/lib/zendesk-claim-classify-llm.ts`) has **zero callers** anywhere in `src/` | `grep -rn "zendesk-claim/classify" src` matches only the route file itself |
| `POST /api/receiving/zendesk-claim/assist-seller` is **live** — 3 real call sites | `SellerMessageChip.tsx:241`, `useClaimSellerMessage.ts:92`, `useReceivingClaimController.ts:633` and `:735` |
| A **generic**, already-correct "rewrite a deterministic template via Hermes" module already exists and is NOT the claim-specific one | `src/lib/ai/zendesk-ticket-draft.ts` — its own doc comment: *"The claim-specific drafter (`zendesk-claim-draft-llm.ts`) predates this and stays as-is; new ticket surfaces... use this generic one."* Used today by `src/app/api/receiving/unfound-queue/[kind]/[id]/push-to-zendesk/draft/route.ts`. |
| The "dry-run test" block in `useReceivingClaimController.ts` (~137 lines: `submitTestCreate`, `submitTestSeller`, `clearTestOutputs`, `submitDryRun`, `draftTestSellerMessage`, and state `isDryRun`/`testCreating`/`testResult`/`testSellerLoading`/`testSellerPreview`) is **fully wired but has zero UI triggers** — no component calls any of these 5 functions | `grep -rn "submitTestCreate\|submitTestSeller\|clearTestOutputs\|submitDryRun\|draftTestSellerMessage" src` — every hit is inside `useReceivingClaimController.ts` itself (definition + its own return statement) |
| Of that dead block's state, only **`isDryRun`** has an external reader | `src/components/receiving/workspace/claim/components/ClaimConfirmStep.tsx` lines 9, 14, 24, 46 — reads `c.isDryRun` to toggle copy + `canArchive` |
| The two **live** routes each still contain a small server-side `dryRun` branch that only the dead client code above ever triggered | `route.ts:143` (`if (body.dryRun === true)`), `assist-seller/route.ts:71` (`if (body.dryRun !== true)`) |
| The 5 "link-flow" booleans are **not one linear lifecycle** — they're 2–3 independent concerns read by different UI elements at different times | See the full read/write site list in §Step-2 below; e.g. `unlinking` gates its own button's spinner independent of `linking`/`linkCommitted` |
| `ReceivingClaimModal.tsx` itself is thin (128 lines) and is **not** part of the problem — the weight is in `useReceivingClaimController.ts` (938 lines) and the two step-order enums it drives | Direct read this session |

**Total confirmed-dead surface for Step 1: 3 route files + 2 lib files + ~150 lines of controller state/handlers.** Nothing in this list requires a product decision — it is unreachable code, full stop.

---

## Step 1 — Delete verified-dead code

**Goal:** remove code with zero live callers. No behavior change is possible because nothing renders or invokes any of it today.

**Delete entirely:**
- `src/app/api/receiving/zendesk-claim/draft/route.ts`
- `src/lib/zendesk-claim-draft-llm.ts`
- `src/app/api/receiving/zendesk-claim/assist/route.ts`
- `src/app/api/receiving/zendesk-claim/classify/route.ts`
- `src/lib/zendesk-claim-classify-llm.ts`

**Edit `src/components/receiving/workspace/claim/hooks/useReceivingClaimController.ts`:**
- Remove state: `isDryRun`/`setIsDryRun`, `testCreating`/`setTestCreating`, `testResult`/`setTestResult`, `testSellerLoading`/`setTestSellerLoading`, `testSellerPreview`/`setTestSellerPreview`.
- Remove functions: `submitTestCreate`, `submitTestSeller`, `clearTestOutputs`, `submitDryRun`, `draftTestSellerMessage`.
- Remove all 5 lines' worth of matching `setX(null)`/`setX(false)` resets wherever they appear in other effects (grep `isDryRun\|testResult\|testSellerPreview\|testCreating\|testSellerLoading` inside this file after your edit — must return zero hits except none, since you're deleting the declarations too).
- Remove the corresponding entries from the hook's return object (`// dry-run tests` block, and the loose `isDryRun` if it's listed elsewhere).

**Edit `src/components/receiving/workspace/claim/components/ClaimConfirmStep.tsx`:**
- `isDryRun` will no longer exist on the controller. Remove the `const { filedTicket, template, isDryRun } = c;` destructure's `isDryRun`, and collapse both ternaries (line ~14 and ~24) to their `false` branch permanently: always "Internal ticket filed" copy, always `<ClaimNasBackupCard c={c} canArchive={true} />`.

**Do NOT touch:**
- `src/app/api/receiving/zendesk-claim/assist-seller/route.ts` and `src/lib/receiving-claim-seller-assist.ts` — live, real callers, not part of this cleanup. (The research answer's D2 verdict said "fold assist-seller into assist" — that's superseded by the verified-facts table above: `/assist` is dead, `/assist-seller` is alive and does a materially different job — drafting an external, link-stripped, ticket-numbered marketplace message with its own persistence — not a rewrite of internal ticket prose. Leave it exactly as-is.)
- The server-side `dryRun` branches inside `route.ts` and `assist-seller/route.ts` (now unreachable from the client, but still small, harmless, and inside otherwise-live files). Note them in your report; do not remove them in this step — that's a separate, lower-priority cleanup a human should approve after confirming nothing else (an internal QA script, a future feature) is meant to hit them.

**Verification (must all pass before this step is done):**
```bash
# 1. Confirm nothing references the deleted routes/files anymore
grep -rn "zendesk-claim/draft\|zendesk-claim/assist['\"\`]\|zendesk-claim/classify\|zendesk-claim-draft-llm\|zendesk-claim-classify-llm" src
# → must return ZERO matches

# 2. Confirm no dangling references to the removed controller symbols
grep -rn "isDryRun\|testCreating\|testResult\|testSellerLoading\|testSellerPreview\|submitTestCreate\|submitTestSeller\|clearTestOutputs\|submitDryRun\|draftTestSellerMessage" src
# → must return ZERO matches

# 3. Typecheck + lint
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/receiving/workspace/claim src/app/api/receiving/zendesk-claim

# 4. Full gate
npm run verify
```

**Report:** file list actually deleted/edited, output of the 4 verification commands, and the `dryRun`-branch note above.

---

## Step 2 — Model the link-flow state precisely (not a blind union)

**Read this before writing code — the naive version of this step is wrong.**

The 5 booleans (`linking`, `unlinking`, `linkCommitted`, `linkUpdating`, `linkUpdatePosted`) are **not** one 5-state sequence. Grep every read site first (already done once this session — re-verify, don't trust this table blindly):

| Symbol | What it actually gates |
|---|---|
| `linking` | in-flight spinner on the initial "Link ticket" button only (`ClaimModalFooter.tsx:127-130`); also a guard in the commit handler itself |
| `linkCommitted` | **persistent** fact "has this claim committed a link at all" — read by `ClaimFiledBanner` (label text), `ClaimModalFooter` (gates the "Seller" tab), and step-navigation guards in the controller (`isLinkStepDisabled`-style checks around lines 343/376/439) |
| `unlinking` | in-flight spinner on the **separate** "Unlink" action in `ClaimFiledBanner` — independent of `linking`, can be true whether or not `linkCommitted` is currently true |
| `linkUpdating` | in-flight spinner on the **post-link** "Update ticket & back up" button (`ClaimModalFooter.tsx:164-167`) — a different sub-flow that only makes sense after `linkCommitted` |
| `linkUpdatePosted` | persistent fact gating whether the Linked/Seller steps are reachable (`isLinkStepDisabled` lines ~345-346, ~378) |

**Correct model — two small discriminated unions, one boolean left alone:**

```ts
type LinkCommitStatus = 'idle' | 'linking' | 'committed';
type LinkUpdateStatus = 'idle' | 'posting' | 'posted';
// `unlinking` stays a plain boolean — it is a genuinely independent, always-
// available action, not a state in either sequence above.
```

Replace `linking` + `linkCommitted` with one `linkCommitStatus` state. Replace `linkUpdating` + `linkUpdatePosted` with one `linkUpdateStatus` state. Leave `unlinking` exactly as it is.

**At every call site**, replace the boolean read with the equivalent status comparison (`c.linking` → `c.linkCommitStatus === 'linking'`, `c.linkCommitted` → `c.linkCommitStatus === 'committed'`, etc.) — **the rendered disabled/spinner/label behavior must be byte-identical before and after.** This is a state-shape refactor, not a behavior change. If preserving identical behavior requires a third value or an extra field, add it — do not force a mismatch to make the union "clean."

**Files to touch:** `useReceivingClaimController.ts` (state + all internal reads/writes + return object), `ClaimModalFooter.tsx`, `ClaimFiledBanner.tsx`, `ClaimLinkedStep.tsx`, `ClaimSellerStep.tsx` (all four just change prop types from `boolean` to the new union member, and the comparison at the call site — not their internal logic).

**Verification:**
```bash
npx tsc --noEmit -p tsconfig.json
npm run verify
```
Then a manual behavior check against the running dev server (`:3050`) — open a carton's "File a claim" → "Link existing ticket" flow and confirm: the Link button shows a spinner while linking and becomes "Linked" after; Unlink shows its own spinner and doesn't fight the Link button's state; "Update ticket & back up" behaves the same before/after. Screenshot or describe what you saw in your report — this is the part a type-check cannot catch.

**Do NOT touch:** the wizard step enums (`CreateClaimStep`/`LinkClaimStep`), `submitting`/`archiveSubmitting` (unrelated to this state), any sub-hook (`useClaimPhotos`, `useClaimTemplate`, etc.).

---

## Step 3 — Decouple NAS backup from the wizard step

**Goal:** the local photo backup (`archive-only` route + `ClaimNasBackupCard`) currently only fires from inside `ClaimConfirmStep`/`ClaimLinkedStep`, gated on the operator being on that exact step. Make it fire automatically as a side-effect once the ticket is actually filed (or the link is committed), independent of which step the operator is currently viewing, while **keeping the existing inline partial-failure + manual-retry affordance** — do not regress that.

**Before you touch anything:** read `ClaimNasBackupCard.tsx` (131 lines) and the `archiveState`/`archiveSubmitting`/`archiveToNas` wiring in `useReceivingClaimController.ts` in full. Identify exactly: (a) what triggers the archive call today (is it already automatic on mount of the Confirm/Linked step, or does the operator have to click something?), (b) what `archiveState` shapes exist (`ok`/`warning`/error), (c) whether `archiveToNas` is idempotent (safe to have already run once and be called again, e.g. if the operator navigates away and back).

**If the archive call is already automatic on step-mount** (likely, per the code comments seen this session — "which also auto-triggers the local backup"), then the actual change here is small: move the trigger from a `useEffect` scoped to the step component into the controller's ticket-filed / link-committed success handlers (`submitInternal`'s success path, `submitLink`'s success path), so it fires once, regardless of which step is on screen, and store `archiveState` exactly as today. Keep `ClaimNasBackupCard` as the **display** of that state (still shown on the Confirm/Linked/Seller steps) — only move the *trigger*, not the UI.

**If it is not already automatic**, stop and report — that changes this step's risk profile (an operator-initiated action becoming automatic is a real behavior change, not a pure refactor) and needs a decision before proceeding.

**Files likely touched:** `useReceivingClaimController.ts` (move the trigger call), `ClaimNasBackupCard.tsx` (display only, should need minimal/no change), `ClaimConfirmStep.tsx`, `ClaimLinkedStep.tsx` (remove the now-redundant trigger-on-mount if one exists there).

**Verification:**
```bash
npx tsc --noEmit -p tsconfig.json
npm run verify
```
Manual check on `:3050`: file a real (or your existing dry-run-equivalent, if you rebuilt one — you have not, per Step 1, so use a real low-stakes test claim if the QA org has a safe fixture) claim end-to-end and confirm the backup card still shows the same success/warning/retry states it did before this step.

---

## Step 4 — Unify the two wizards

**Goal:** one `ClaimWizard` concept instead of two parallel enums (`CreateClaimStep` 5-value / `LinkClaimStep` 6-value) and the 25-line nested ternary in `ReceivingClaimModal.tsx`'s `ClaimStepBody`.

**4a — Merge the two "success" steps first (smallest, safest slice).**
`ClaimConfirmStep.tsx` and `ClaimLinkedStep.tsx` are already near-duplicates (confirmed this session — both render a success banner + `ClaimNasBackupCard`, and `ClaimLinkedStep`'s own doc comment says it mirrors Confirm). Merge them into one `ClaimFiledStep({ c, mode }: { c: ReceivingClaimController; mode: 'created' | 'linked' })` that renders the mode-appropriate copy. Delete the two originals. Update `ReceivingClaimModal.tsx`'s step-body switch to call the merged component for both `createStep === 'confirm'` and `linkStep === 'linked'`.

**4b — Only after 4a is verified green, unify the step-order types.**
Collapse `CreateClaimStep | LinkClaimStep` into one `ClaimWizardStep = 'find' | 'photos' | 'compose' | 'review' | 'filed' | 'seller'`, with a single step-order array and a `startStep` derived from `mode` (`'find'` for link, `'photos'` for create) instead of two arrays. Update `claimWizardStepStates`/`linkWizardStepStates` (`claim-types.ts`) into one function taking `mode`. Update `ClaimWizardNav.tsx` and the `ReceivingClaimModal.tsx` step-body switch accordingly — the switch should collapse from ~25 lines of nested ternary to a single-level switch on one enum.

**Do NOT** attempt to also merge `ClaimPhotosStep`/`ClaimComposeStep`/`ClaimReviewStep`/`ClaimSellerStep` into anything — they're already shared verbatim between the two flows today (same component instances); there is nothing to unify there.

**Files touched:** `ReceivingClaimModal.tsx`, `claim-types.ts`, `ClaimWizardNav.tsx`, `useReceivingClaimController.ts` (step-state, `goToStep`/`goNext`/`goBack`/etc.), `ClaimModalFooter.tsx` (per-step button logic — expect this file's internal branching to change shape, not necessarily shrink, since the two flows' CTAs genuinely differ per step; do not force footer unification if it makes the button logic harder to read).

**Verification:**
```bash
npx tsc --noEmit -p tsconfig.json
npm run verify
```
Manual walk-through on `:3050` of **both** flows end-to-end (create a new ticket; separately, link an existing ticket) confirming every step still renders, the stepper still reflects progress, and back/forward navigation still works exactly as before.

---

## Step 5 — Form flattening (NOT AUTHORIZED — proposal only)

The research answer's step 5 ("convert the remaining shared steps into a single scrolling progressive-disclosure form") is a real UX change affecting every operator who files a claim, not an internal refactor. Per this repo's own rule (`pattern-evolution.md`, "Ask first" category — UX changes with wide blast radius), **do not implement this.**

Instead: after Steps 1–4 are verified and merged, write a short before/after description (what the wizard looks like now, what a flattened single-page version would look like, and the concrete risk — losing the stepper's "where am I" affordance for a 4-6-field form isn't obviously a win for an infrequent, evidence-heavy task) and stop. A human decides whether to pursue it as its own, separately-scoped task.

### Step 5 proposal (written after Steps 1–4 landed — 2026-07-30)

**Before (current, post Steps 1–4):** One `ClaimWizardStep` drives both modes. Create: Photos → Ticket → Review → Filed → Seller. Link: Find → Photos → Ticket → Review → Linked → Seller. A compact linear stepper is the stable map; only the step body crossfades. Each step owns one job (evidence, compose, review/submit, backup confirmation, marketplace message). Seller is omitted for `'return'`.

**After (hypothetical flatten):** A single scrolling pane with progressive disclosure — photos picker, claim-type + subject/body, recipients, then primary CTA — with filed/backup and seller revealed after submit. No stepper; progress is scroll position + section headings.

**Risk / why this is Ask-first:** Claim filing is infrequent and evidence-heavy. The stepper's "where am I / what is left" affordance is valuable when the operator may pause mid-flow (photos loading, ticket search, review before Zendesk write). Collapsing to one page trades that orientation for fewer clicks — not an obvious win, and it would touch every host that opens `ReceivingClaimModal`. **Decision:** leave as a separately scoped product task; do not implement without explicit approval.

---

## Verifier checklist (Claude — run this after each step, not just at the end)

1. `git diff --stat` — confirm only the files listed in that step's "Files touched" changed. Anything else is scope creep; ask Grok to revert it.
2. Re-run every command in that step's "Verification" block yourself — don't trust a pasted "✅ passed" in the report.
3. `npm run verify` full gate, confirm zero ratchet-baseline diffs (`git diff -- '**/*baseline*' '**/*.guard.test.ts'` should be empty unless the step explicitly touches a guard).
4. For Steps 2–4: attach to `:3050` and manually replay both the create-ticket and link-ticket flows, same as this session's live verification of the FBA subject fix — confirm no regression in either.
5. Read the actual diff, not just the summary — specifically check that Step 1's deletions didn't leave an unused import, and that Step 2's union refactor didn't silently change which button is disabled when.
6. Only after all of the above: report the step done and move to the next.
