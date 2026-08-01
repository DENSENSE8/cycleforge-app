# EXECUTION PROMPT — Note/label grain: E2E coverage + follow-ups

> Paste below the line into a fresh session at `/Users/icecube/repos/cycleforge-app`.
> **Predecessor:** lane C (`docs/todo/unbox-C-label-note-grain-PLAN.md`) — shipped, pushed as `topic/note-grain`.
> **Lane:** WS-NOTE-GRAIN · worktree `../cycleforge-note-grain` · branch `topic/note-grain` (registered in `dev-worktrees.json`).

---

# Cycle Forge — E2E the note/label grain, then finish the follow-ups

You are Claude Code in the Cycle Forge monorepo. The note/label grain work is **built, guarded, and
pushed**; the migration is **applied to live data**. What it does not have is a single browser-level
test. Your job is to close that gap, then work the follow-up list.

## What already shipped (do not rebuild it)

Seven commits, `58ff8a900 … 5c331b60a`, on `topic/note-grain` (pushed; green on a clean checkout).

| Concern | Where |
|---|---|
| `receiving_line.notes` = operator item note, **never printed** | migration `2026-07-31b_receiving_lines_label_note.sql` (**applied**; backfilled `label_note := notes`, 331/331, 0 drift) |
| `receiving_line.label_note` = the printed face center | same |
| Grain law + per-line-item rule | `.claude/rules/source-of-truth.md` → **Note vs label grain** |
| Wiring guard (mutation-tested) | `src/components/receiving/workspace/line-edit/label-note-grain.guard.test.ts` |
| Receive may set a note, never clear one | `mark-received` `SET notes = COALESCE($1, notes)` + `src/app/api/receiving/receive-note-preservation.guard.test.ts` |
| Label kind → grain in every picker | `src/lib/print/workspace-label-kinds.ts` (`workspaceLabelGrainLabel`) |

**Composers:** notes dock (`LineNotesCard`) writes `notes`; label editor (`LabelEditPopover` / As Listed)
writes `label_note`. Neither touches the other's column — that is the invariant under test.

## STOP — read this before you plan the E2E

**The Unbox workspace only opens on a SCAN.** It is a Station contract (`.claude/rules/display/station.md`):
clicking a queue row selects it, double-clicking toggles the multi-select checkbox, and neither opens the
carton. The previous session got as far as the Queue grid and stopped rather than fire a scan, because a
scan writes `unbox_opened_at` and work attribution.

On the **QA org** a scan is the correct thing to do — that tenant exists to be mutated. Budget for it:
your spec must drive the scan bar (`StationScanBar`, focus-locked, Enter submits) with a QA fixture's
tracking / PO value, not try to click its way in.

## Mission

1. **Prove the grain holds in a browser**, on the QA org:
   - typing an item note and blurring **does not** change the label preview's center text;
   - editing the label face via **Edit label → Label text (center) → Save & print** **does not** change
     the item note;
   - both survive a reload (they are two durable columns, not view state).
2. **Pin the regression that shipped**: a receive that supplies no note must not erase one. The mobile
   QA sheet's Pass-all sends `notes: null` (`ReceivingQaActionSheet.tsx` → `markAllLines(..., null, …)`).
   An API-level spec is enough and is far cheaper than driving the phone shell.
3. Then work **Follow-ups** below, in order.

## Read first

1. `.claude/rules/verify.md` — **E2E asserts against the QA org**, never the dogfood tenant.
2. `.claude/rules/source-of-truth.md` → Note vs label grain.
3. `src/lib/tenancy/qa-org.ts` — `QA_FIXTURE_*` constants; assert on these, never on live row counts.
4. `.claude/rules/display/station.md` §3 — the focus-lock / scan loop you must drive.

## Build rules

- `pnpm provision:qa-org` (idempotent) → `npx playwright test <spec> --project=qa-desktop`.
  Storage state `tests/.auth/qa-admin.json` is already minted.
- **Extend, do not orphan**: `tests/e2e/receiving-zoho-notes-price.spec.ts` already asserts the row
  exposes both `notes` and `label_note`. `receiving-silent-print.spec.ts` covers the print mechanism.
- Seed what you need by extending `qa-org.ts` + `scripts/provision-qa-org.ts` — never `test.skip` around
  missing data, and never hardcode a tenant UUID.
- The dev server runs on **`:3050`** — attach, never start/restart/kill it. `PW_BASE_URL` if you need to point elsewhere.
- `npm run verify` green before done. **Never raise a ratchet baseline.**
- Stage only your own files; several sessions share this tree.

## Follow-ups (after the E2E lands)

1. **The QA fail-reason overwrites the operator note.** `runFail` passes a real `reason` string into
   `markAllLines`, so `mark-received` replaces the item note with it. That is the documented "a provided
   value overwrites" contract, so it is *consistent* — but a QA fail reason is structured data with a
   real home (`receiving_line_testing`, the reason-codes engine). **Ask first**: append, overwrite, or
   move it out of the note entirely? Do not change it silently.
2. **A per-item label has no text slot.** The `unit` face is `kind: 'product'` — full-width title row,
   condition·color, **no center band** (`src/lib/print/labelFace.ts`). So "a note per item that prints"
   is not expressible today. If it is wanted, that is a face-layout change, not a data change.
3. **Multi-qty printing stays on-demand, one press per label** (operator decision, 2026-08-01). If
   print-×N is ever wanted, it goes on an explicit count control — never a silent loop.
4. **`derive-capture-step-states` / `StepDot` / `UnboxCaptureStack` orphans** are lane B/E's, not yours.

## Known blocker — check this first, it may already be fixed

**`main`'s HEAD does not build.** Commit `33a3eb609` committed `LineEditPanel.tsx` importing
`./UnboxProcedureRail`, but that file is **untracked** (not gitignored — never staged). It typechecks in
`main`'s working tree only because the file is present on disk, which is why it was not caught.

- Symptom: `TS2307: Cannot find module './UnboxProcedureRail'` on any clean checkout / CI run.
- Fix, for **the unbox lane's author** (it also clears 2 of 5 knip findings):
  `git add src/components/receiving/workspace/UnboxProcedureRail.tsx`
- **Do not stage it yourself** unless the human says so — it is another session's file and may be mid-edit.

Until that lands, `main` cannot be pushed. Work in the lane worktree
(`../cycleforge-note-grain`, branch `topic/note-grain`), where a clean checkout verifies green.

## Do NOT

- Assert against the dogfood tenant, or on row counts that change between runs.
- Re-open the note/label split — it is decided (separate, per line item) and applied to live data.
- Hoist `label_note` to the carton. It is per LINE ITEM; a carton-level face would make every line on a
  multi-line PO print the same text. `label-note-grain.guard.test.ts` fails if you try.
- Start, restart, or kill a dev server.
- Raise any ratchet baseline, or `--no-verify` past the pre-push hook.

## Report back

1. What the E2E actually proves vs. what it only asserts at the API layer — be honest about the gap.
2. Whether the scan-driven entry cost more than expected, and what you had to seed.
3. Your recommendation on follow-up 1 (the fail reason).
4. Whether `main` is still broken.

Commit only when asked. Stage only files you changed.
