# Unbox Procedure Focus Deck — remaining work · HANDOFF

**Date:** 2026-08-02 · **Lane:** WS-DOGFOOD (`main`, uncommitted) ·
**Status:** the deck **shipped and is verified**; this is the tail.

> **Update 2026-08-02 (second pass).** §1, §3's guard and §4 have landed —
> see the per-section notes below. **§2 (`skipped` has no writer) is untouched**
> and is the only remaining code work; §3's bench observation is still a human
> task. Full state, including what deliberately did NOT change, is in the
> per-section `LANDED` blocks.
**Supersedes:** [`unbox-procedure-focus-deck-HANDOFF.md`](./unbox-procedure-focus-deck-HANDOFF.md)
(that document's build is done — keep it for the rulings, not the task list).
**Sibling handoff:** [`unbox-dock-step-context-photo-pairing-HANDOFF.md`](./unbox-dock-step-context-photo-pairing-HANDOFF.md)
— the bottom dock's per-step leading zone and photo pairing. **Do not do that work here.**
**Binding rules:** [`display/station-workbench.md`](../../.claude/rules/display/station-workbench.md)
§ *The Procedure Focus Deck* · [`unbox-procedure-chat-progression-GROK-RULES.md`](./unbox-procedure-chat-progression-GROK-RULES.md)

---

## 0. What is already done — do not redo it

The deck is built, rendered at 1440×900 against the QA org, and measured. The rule
files were rewritten in the same change, so `station-workbench.md`, `station.md`,
`source-of-truth.md`, `ui-design-system.md` and the GROK rules all describe the
surface that is actually in the tree.

| Shipped | Where |
|---|---|
| `ProcedureColumn` → **`ProcedureDeck`** (+ `UnboxProcedureColumn` → `UnboxProcedureDeck`) | `src/design-system/components/procedure/` · `line-edit/` |
| Bottom-pinned focus card · full-title history rows above · **one** queued peek behind | `ProcedureDeck.tsx` |
| Functional hue moved from a left accent edge to a **50-level card fill** (`stepBorderClass` → `stepSurfaceClass`); medallion up to 100/300 | `steps/step-face.tsx` |
| Step **pager** as pinned chrome above the composer (`prevStep` / `nextNeighbour`, never the skip target) | `UnboxProcedurePager.tsx` |
| `reserveScrollClearance="pager"` + `STATION_TERMINAL_PAGER_SCROLL_CLEARANCE` | `StationWorkbench.tsx` · `StationTerminalDock.tsx` |
| **API fix:** `normalizeRow` was dropping `condition_graded_at` / `contents_confirmed_at` / `label_previewed_at` | `api/receiving-lines/route.ts` + `receiving-lines-procedure-gates.guard.test.ts` |

Verified in Playwright on `qa-desktop`: one scroll port, page does not scroll,
peek click promotes and hands focus back to `data-station-scan-input`, and the
`label` step round-trips (confirm → `done`, reopen → `pending`).

**Three defects were found only because the surface was rendered**, which is the
argument for §4 below:

1. Tailwind v4 compiles `space-y-N` to `margin-block-**end**` on the *preceding*
   sibling, so the pile's per-item pull-up could not cancel it — it shipped 12px
   apart while the computed `margin-top` read exactly as intended.
2. Every queued card carried the peek's `z-20`; the covered ones are later
   siblings, so they painted **over** the peek and swallowed every click on its
   sliver. The deck's only forward affordance was pointer-dead and looked
   perfect in a screenshot.
3. The three-layer pile double-imaged the queued labels through each other —
   the *record* going illegible, which is the one thing the occlusion rule
   forbids. Cut to one peek on operator instruction.

---

## 1. A settled step still has no time on it

**The rule says the timestamp is evidence; the derivation does not produce one.**

`ProcedureStepRow.at` is declared (`procedure/types.ts`) and the deck renders it
under the label when present — but `deriveProcedureSteps`
(`derive-capture-step-states.ts`) returns `{ key, label, state, position, stage }`
and never an `at`, so it is `undefined` on every row and every history card
renders name-only.

That is honest absence, not a lie, so it is not urgent. It *is* a gap against
`station-workbench.md`'s own words — *"a settled step's timestamp is evidence,
and a pile that covers it is the refused depth pile"* — because there is
currently nothing to cover.

**Do:**

- Return `at` from `deriveProcedureSteps`, resolved from **the fact that closed
  the gate**, not from a generic row timestamp: `condition_graded_at` for
  `condition`, `contents_confirmed_at` for `contents`, `label_previewed_at` for
  `label`, and the newest matching photo's `created_at` for the capture steps.
- Format through `src/utils/date.ts` — `formatTime12hPST` for same-day,
  `formatDateTimePST` otherwise. **Never** `toLocaleTimeString`.
- `at` stays **absent while pending**. `types.ts` already says why: a step can
  hold partial evidence, and printing that evidence's time beside a pending row
  reads as a completion.

**Don't:**

- **`photos.client_captured_at` is the tablet's wall clock and is not
  server-attested** (GROK-RULES §5). If it is shown at all it is a clearly
  labelled secondary detail, never the step's time.
- No per-step **duration**. Still refused, still for the same reason: there is
  no `step_started_at`, the gap between completions is not time-on-step, and
  timing an operator who can waive steps corrupts the record.

Blast radius: the checklist (`ProcedureChecklist`) reads the same rows, so it
gets times for free — which is the point of the one-derivation rule and also the
thing to eyeball, because the checklist is narrow and a long timestamp wraps.

### LANDED — how it resolved

`deriveProcedureSteps` now returns `at: string | null`, and **that is the only
place the "a time rides only on a `done` step" rule is expressed** — the receipt's
`attach()` takes the resolved instant as a parameter instead of re-gating its own.
Two readers, one rule, same as the state.

WHICH instant is the caller's job; WHETHER to show it is the derivation's:

| Step family | Instant | Resolved by |
|---|---|---|
| `condition` · `contents` · `label` | the gate column itself | the derivation, off the gate input — a caller's `evidenceAt` entry is deliberately **ignored**, so two callers cannot pass different "same" instants |
| photo steps | first shot of that stage/aspect (`item_photos` folds to the last required aspect's first shot — that is when its gate closed) | the bench from the photos payload; the receipt from aggregate SQL |
| `classify` · `serial` | — | bench renders **honest absence** (neither leaves a client-side instant); the receipt still fills both, because it can see the audit row and the provenance |

- Photo instants reach the bench through four new fields on
  `useReceivingPhotoStageCounts` (`arrivalFirstAt`, `itemFirstAt`,
  `cartonAspectFirstAt`, `itemAspectFirstAt`) — **first**, not last: a re-shoot
  half an hour later did not make the step done again.
- Formatting stays at the display layer (`useUnboxProcedureSteps`): clock for
  today, date + clock otherwise, both through `@/utils/date` against the
  warehouse zone. The derivation is shared with a server read model and never
  formats.
- **`ProcedureChecklist` deliberately still does NOT render `at`.** The handoff
  expected it "for free"; in fact the component never read the field, and the
  narrowness warning above is the reason to leave it that way — its trailing slot
  already carries the summary, which is the more useful fact in a 360px column.
  The deck's full-width history rows are where evidence-time belongs.
- Coverage: 4 cases in `derive-capture-step-states.test.ts` + 3 in
  `procedure-receipt-derivation.guard.test.ts`.
- **Spec change, stated plainly:** that guard's *"a done step with no recorded
  evidence reports no time"* now exempts the three acknowledgement steps. Their
  gate IS an instant, so reporting it is the opposite of fabricating one — a
  `condition` row reading "done" with no time would be the receipt withholding a
  fact it holds. Every other done step still must report `null`.

---

## 2. `skipped` has no writer (BE-3b)

Supported end-to-end as a **state** — the pointer walks past it, the card wears
its own glyph and never a check, `resolveActiveStep` honours it — and written by
nothing. `useUnboxProcedureSteps` says so at the fold:

> `deriveProcedureSteps` never reports `skipped` … Fold it in HERE when it lands,
> so both surfaces and the pointer read one list.

Still needed: the waiver store, the `unbox_step_skip` vocabulary, and the skip
routes.

**A UI-only skip is worse than no skip.** It produces a waiver that vanishes on
reload while the operator believes a decision was recorded — and the whole point
of storing a waiver is that it is the one thing *not* derivable from the carton's
own evidence.

When it lands, the deck needs no change: it already renders `skipped` and
`skipReason`. The **pager** does: `nextNeighbour` is positional and will happily
page onto a waived step, which is correct (you can re-open one), but confirm that
reading at the bench before assuming it.

---

## 3. Reachability past the peek — verify at the bench, then decide

Only ONE queued card peeks, so there are exactly three pointer paths to
everything after the next step:

1. the peek's ~14px sliver (click to promote),
2. the **pager** pinned above the composer,
3. the right-edge **`checklist` display**.

Path 3 is the deck's stated **precondition** — the centre is only allowed a
compressing geometry because the checklist owns the shape of the whole job. That
coupling is written in three rule files and enforced by **nothing in code**.

**Do, in order:**

- Watch a real operator work a 9-step carton. Ask specifically: did they ever
  need a step that was neither the peek nor a pager neighbour?
- If yes → the sanctioned next move is the one the design source already named:
  **hover the pile to open it to full titles** (`unbox-procedure-focus-deck-HANDOFF.md`
  §2.2, *"build the sliver first, then verify at the bench"*). Hover must be off
  while any push rail is open, same as the scan-progress ring's checklist peek.
- If no → say so in the rule file and close the question. An open question that
  nobody closes is how a surface accretes affordances.

**Don't** grow a second visible peek layer to solve this. It was tried, and three
translucent slivers read as a paint failure rather than as depth.

**Consider a guard for the coupling.** A test asserting `checklist` is in
`buildUnboxSideTabs`' output and is the ring's default would turn a prose
precondition into a mechanical one. Cheap; do it while the reason is fresh.

### LANDED — the coupling guard (the bench observation is still open)

`unbox-procedure-checklist-coupling.guard.test.ts` (beside the deck adapter)
pins both halves of the precondition in one file, so they have to move together:

1. the covering geometry still exists (`isCovered`, `pointer-events-none`, and
   `onSelectStep && !isCovered` — a covered card is never a `<button>`);
2. `checklist` survives every gate and never falls back to another display;
3. `buildUnboxSideTabs` mounts a `checklist` body rendering
   `UnboxProcedureChecklist`;
4. `LineEditPanel` wires the ring to `openDisplays('checklist')` — it is
   ring-only, so losing that handler makes it unreachable from the bench;
5. both views call `useUnboxProcedureSteps` and neither calls
   `deriveProcedureSteps` directly.

**If the deck is ever legitimately flattened back to a full column, check 1 goes
red and the right answer is to DELETE that guard in the same change** — not to
relax it. Making the pair move together is the whole job.

**Still open: the bench observation.** Nothing here answers "did a real operator
need a step that was neither the peek nor a pager neighbour" — that needs a
person watching a 9-step carton. The hover-to-open-the-pile move remains the
sanctioned next step if the answer is yes.

---

## 4. Committed coverage — there is none for the deck

Everything in §0 was proven with **throwaway** Playwright probes that were
deleted. The three defects listed there are all invisible to typecheck, lint and
every existing guard, and two of them (the v4 margin semantics, the covered-card
z-order) are the kind that come back on the next refactor.

Highest value first:

| Spec | Asserts | Why it earns its keep |
|---|---|---|
| `unbox-procedure-deck.spec.ts` (E2E, `qa-desktop`) | every vocabulary step is in the DOM in order; exactly one `zone="focus"`; peek bottom = focus bottom + one peek unit; covered cards are coincident with the peek and are not `<button>`; clicking the sliver promotes; focus returns to `data-station-scan-input` | pins all three shipped defects |
| `procedure-deck-order.test.ts` (unit) | the deck renders **every** step from `deriveProcedureSteps`, none filtered / re-sorted / unmounted | attempt #1's exact defect (`33a3eb609`) |
| extend `receiving-lines-procedure-gates.guard.test.ts` | a new capture-step gate column is added to the list | already written; it just needs the next gate added to `GATE_COLUMNS` |

Assert the **invariant**, not a sample (`verify.md`): the peek's geometry is
`focusBottom + PROCEDURE_PEEK_REM`, not a pixel literal that drifts with the
Settings text-size control.

**Use the QA org** (`--project=qa-desktop`), create the fixture through
`/api/receiving-entry` + `/api/receiving/add-unmatched-line`, and open with
`/unbox?openReceivingId=…&lineId=…` — that is the recipe `unbox-scan-focus.spec.ts`
already uses and the one the throwaway probes proved works.

**Do not `waitForLoadState('networkidle')`** on `/unbox`. It never settles (the
carton subscribes to a realtime photo channel), and it cost a 60s timeout on the
first probe run.

### LANDED — with one honest caveat

| File | Covers |
|---|---|
| `src/design-system/components/procedure/procedure-deck-order.guard.test.ts` | 8 structural checks: no filter/sort/slice/reverse on `steps`; **no `space-y-*` anywhere in the deck** (defect 1, pinned at the point it gets written); covered z strictly below the peek + `pointer-events-none` (defect 2); `isPeek === depth 1` (defect 3); the two face-height spellings agree; the pull-up is rem, never px; no scroll port or height floor; CSS transitions are `motion-safe:` gated |
| `tests/e2e/unbox-procedure-deck.spec.ts` (`qa-desktop`) | rendered order == `captureStepVocabulary` (imported, not restated); exactly one `zone="focus"`; the sliver is `> 0` and `< one face`; covered cards coincident within 1px and never `<button>`; clicking the sliver at `y = height - 3` promotes it and hands focus to `data-station-scan-input`; the document itself does not scroll |

The unit half is a **source guard, not a render test** — this repo's unit layer
is pure logic + structural guards with no React renderer, and standing one up
would have been a larger change than the thing being protected. It is named
`procedure-deck-order.guard.test.ts` (not `.test.ts`) to match that convention.

Geometry is asserted as **relationships between measured boxes**, never a pixel
literal: the sliver against the peek's own height, covered cards against the
peek's bottom. `PROCEDURE_PEEK_REM` was deliberately **not** exported for the
spec — `tests/` sits outside knip's `project` globs, so an export consumed only
from there reads as dead code.

**Caveat — the E2E has not been executed.** The dev server was not running on
`:3050` and agents do not start one. It parses and its imports resolve
(`--list` enumerates all 4 tests); it has not been run against a live carton.
Run it before trusting it:

```bash
npx playwright test tests/e2e/unbox-procedure-deck.spec.ts --project=qa-desktop
```

---

## 5. Smaller things, honestly scoped

- **`nextStep` vs `prevStep`/`nextNeighbour` now co-exist on the hook.** That is
  deliberate and documented — one is the skip target, the others are positional
  neighbours — but it is exactly the pair a future reader will "simplify". The
  docblock explains it; keep it there.
- **History opacity is a two-rung ladder** (`100` recent / `80` older) with the
  floor set by legibility, not taste. If it ever needs to change, change it in
  `PROCEDURE_HISTORY_OPACITY` and say why in the same commit.
- **The tint is faint by design** — `sky-50` on `background-canvas`. If it ever
  stops reading as depth, the fix is a **stronger canvas, never a heavier
  shadow** (`step-face.tsx` docblock says why).
- **`DeckSkeleton` is flat, not a deck.** Which card takes focus is precisely
  what has not resolved while counts hydrate; a skeleton that guessed would move
  under the operator's hand on settle.

---

## 6. Do not re-open

- **Nothing is ticked by hand.** Completion derives from the carton's own facts.
  The org-editable `checklist_templates` list and `/api/checklists` are deleted
  and stay deleted.
- **The deck is a TRANSFORM, never a filter and never a sort.** Every step
  mounted from the first frame, strict `deriveProcedureSteps` order.
- **Occlusion of a BODY is allowed; occlusion of the RECORD is not.**
- **No layout animation.** Height and flow position change on advance — as an
  un-animated reflow. A step advances 9–24 times per carton.
- **Nothing on this surface takes focus**; every pointer control dispatches
  `receiving-focus-scan` after it acts.
- **Motion imports** come from `@/design-system/motion`; CSS motion carries
  `motion-safe:`.
