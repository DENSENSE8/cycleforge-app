# Unbox right-edge — source-of-truth updates HANDOFF

**Created 2026-08-02.** Two right-edge rulings landed on the same day and both
are recorded in the rules files. This document is the record of *what the SoT
now says*, why, and the enforcement that is still missing.

**Scope:** the Unbox right edge only — the Displays push column and the pane
utility row. Not `RightRailHost` occupancy, not the record-inspector header
grammar (`display/right-rail-inspector.md`), neither of which changed.

---

## Paste this into a new session

> Read `docs/todo/unbox-right-edge-sot-updates-HANDOFF.md`.
>
> Both rulings are implemented, guarded and browser-verified (§1–§4). Two real
> defects surfaced during that verification and are fixed (§3a).
>
> **What is left is one E2E re-run** — `:3050` went down mid-suite and the last
> assertion of *the carton # ---- chip opens the pairing display on its PO tab*
> has not re-run since the fix. §5 has the command; run it with `--workers=1`.
>
> Verify by call site, not by docblock. Attach to `:3050` (never start, restart
> or kill one). `npm run verify` before done; never raise a baseline.

---

## 1. Ruling A — Package Pairing is a DISPLAY

**Where it is written:** `.claude/rules/display/station-workbench.md` — the
Displays strip-order paragraph plus a new *"Package Pairing is a DISPLAY, not a
centre surface"* block; `.claude/rules/source-of-truth.md` → **Right-rail
modality** (the Displays-strip sentence).

**What changed.** Package Pairing rendered inline at the bottom of
`POUnboxingSection` — the `contents` step body of the procedure deck — behind a
`pairingOpen` boolean whose only toggle, the `PairingTogglePill` pencil, sat in
the Displays strip's `rightSlot` on the right edge. It is now the `pairing` tab
of the Displays push column.

**The rule the SoT now carries:** *a control on the right edge must not open a
surface in the centre.* On any step other than `contents` the pencil flipped a
boolean whose consumer was off-screen and the operator saw nothing happen. The
stopgap that "fixed" it (`focusContentsStep`, which moved the centre's focused
step so the click had a visible effect) was a patch over the placement, not the
placement — it is deleted.

**Why a display and not a fourth push column:** it is reference-and-edit work the
operator *chooses* to look at, not an exception that interrupts them — the SoT's
own test. And not a `RightRailHost` occupant: Unbox would become a second
permanent consumer of an edge that renders exactly one app-wide occupant.

**The load-bearing consequence:** the tab's selected-ness IS the open state.
`pairingOpen`, `togglePairing`, `editPoControl` and the strip's `rightSlot` prop
are deleted outright — a boolean living beside `activeSideTab === 'pairing'`
would re-create the drift the move removed.

**Also recorded:** the strip has **no `rightSlot`** (both in the strip-order
paragraph and in the *Section tabs* / *Station bookmark chrome* rows of the
anatomy table), the gate is a carton record (`row.receiving_id != null`), the hub
mounts **non-embedded** (in a display the column IS the card, so `collapsed` /
`showTopRule` have nothing to fold under — those props survive for their Triage /
Testing callers), and the `# ----` chip's deep link opens the display and hands
the PO tab over.

> **Superseded in part — see §3a.** That deep link originally dispatched
> `RECEIVING_OPEN_PAIRING_PO_EVENT` on the next frame, on the theory that one
> frame was enough for the hub to mount. It never worked, and neither did the
> display itself. Both are fixed; the ruling is unchanged.

---

## 2. Ruling B — the cursor trio is rail-scoped; the ring is not

**Where it is written:** `.claude/rules/source-of-truth.md` → **Right-rail
modality**, as a new bullet directly under the pane-anchored-utility-row bullet.

**What changed.** `close · up · down` (and the hairline separating them from the
ring) now mount only while a push column actually occupies the edge. Closed, the
scan-progress ring sits alone in the corner.

**The reasoning the SoT carries:** those three controls belong to the column —
close parks it back against the edge it came from, and prev/next step the record
it is describing. With nothing open there is no column to park and nothing beside
the carton to describe, so they read as chrome for a region that is not on
screen.

**The ring is the deliberate exception**, and the SoT says why: it is the toggle
that *opens* the column, so it must stay put in both states — which makes it the
one control that cannot be gated on `railOpen` without making the Displays column
unopenable.

**One derivation, named:** `railOpen` in `LineEditPanel` is now a single const
feeding both the ring's hover-peek suppression and the cursor trio. It was
computed inline twice before. The parked ticket expand strip is deliberately
**not** included — it is a restore affordance, not an open rail.

---

## 3. What is implemented (uncommitted working tree)

| Change | File |
|---|---|
| `'pairing'` in the vocabulary + `hasPairingTab` gate | `line-edit/unbox-side-tabs.ts` |
| The `pairing` tab (mounts `CartonMatchHub`) | `line-edit/terminal/unbox-tabs.tsx` |
| Inline pairing render removed — PO line list only | `line-edit/POUnboxingSection.tsx` |
| `pairingOpen` / `togglePairing` / `focusContentsStep` deleted; `onEditPo` → `openDisplays('pairing')`; `poEditOpen` → `activeSideTab === 'pairing'` | `workspace/LineEditPanel.tsx` |
| `rightSlot` prop deleted | `workspace/ReceivingDisplaysPushStack.tsx` |
| `railOpen` const; cursor trio gated on it | `workspace/LineEditPanel.tsx` |

Tests that moved with it: `carton-match-hub.guard.test.ts` (the "Auto-match
embeds inside the hub, never a sibling strip" assertions were **re-pointed** to
the new home, not deleted, plus a new assertion that `POUnboxingSection` mounts
neither) and `unbox-side-tabs.test.ts` (a `pairing` case). 14/14 pass.

---

## 3a. Verification found TWO real defects (2026-08-02, later session)

Both rulings were verified in a browser on the QA org for the first time. Ruling
B was correct as shipped. **Ruling A did not work at all**, and the reason was
two independent bugs stacked on top of each other — neither visible from the
code, both invisible to every existing test.

### Defect 1 — the `pairing` display was unreachable (`?display=` vocabulary drift)

`UNBOX_ROUTE_PARAMS.display` was a hand-copied `paramEnum([...])` listing eight
tabs. `pairing` was added to `UNBOX_SIDE_TAB_ORDER` when Package Pairing became a
display — and not there. Surface hygiene therefore stripped `?display=pairing` on
the pass right after `setDisplay` wrote it, so the column never opened **from the
`# ----` chip, from its own strip cell, or from a shared link**. Every layer
above was correct: the chip fired, `openPoPairing` ran, `setDisplay` built the
right URL. Nothing threw.

**Fixed** by round-tripping the param against `UNBOX_SIDE_TAB_ORDER` —
`paramRoundTrip`, whose own docblock says *"A schema that duplicates the list is
a second SoT and drifts the first time someone adds a tab."* That is exactly what
happened. Pinned by `route-params.test.ts` → *"EVERY Unbox display survives
surface hygiene"*, which loops the SoT list, so a tab added tomorrow is covered
the day it is added.

### Defect 2 — a timed dispatch cannot outrun a navigation

With the column opening, the PO tab still arrived unselected. The
`requestAnimationFrame(() => dispatchReceivingOpenPairingPo())` documented in §1
was never sufficient: opening the display is a `router.replace`, so
`CartonMatchHub` mounts a *navigation* later, not a frame later. The event fired
into an empty room every single time.

**Fixed** by carrying the intent as data — a `focusTab` / `focusRequestId` prop
on the hub, read on mount. Same handoff shape as `classifyExpand` →
`TriageClassifySection`, which is the house pattern for this.

**Triage keeps the event, and that is not drift.** `TriagePanel`'s PO pencil
toggles a local `pairingOpen`, so its hub is mounted in the same commit and the
one-frame dispatch genuinely does reach it. Two hosts, two mount timings, two
mechanisms — deleting the listener breaks the Triage pencil (it is a live caller,
which an early attempt at this fix discovered the hard way).

**Rules updated:** `display/station-workbench.md` — the rAF paragraph is replaced
by the prop handoff, the Triage exception, and the one-list rule for `?display=`.

---

## 4. The gap — neither ruling has a guard  *(CLOSED)*

`pattern-evolution.md` Always #6: *a rules file cannot fail.* Both rulings are
prose plus one unit test, and the unit test only covers the vocabulary — not the
placement, and not the gating. Specifically:

1. **Nothing fails if `rightSlot` comes back.** The prop deletion is enforced by
   the type system today, which is real but shallow: re-adding the prop and a
   pencil is a two-line change that no test objects to, and the rules paragraph
   explaining why it must not exist would go quietly stale — exactly the failure
   mode Always #6 describes.
2. **Nothing fails if the cursor trio stops being rail-scoped.** `railOpen` could
   be dropped from `showCartonCursor` and every test stays green.
3. **Nothing fails if pairing goes back to the centre.** The guard asserts
   `POUnboxingSection` does not mount `CartonMatchHub` — good — but nothing
   asserts the ring stays ungated, which is the asymmetry most likely to be
   "tidied up" by someone who reads the rail-scoped rule and applies it
   uniformly. That would make the Displays column unopenable.

**Built:** `src/components/receiving/workspace/unbox-right-edge-chrome.guard.test.ts`
— 11 assertions over `LineEditPanel.tsx` + `ReceivingDisplaysPushStack.tsx` +
`CartonMatchHub.tsx`. It reads the files as CODE (block/line comments stripped
first): both files document at length what they must *not* do, so a naive
`doesNotMatch` over the raw text passes or fails on the docblock explaining the
rule rather than on the rule. The cursor-gate body is brace-matched, not sliced
at the first `) : null}` — each control is its own nested ternary.

**Mutation-tested, six for six.** A guard that cannot fail is the thing this
whole section is about, so each assertion was checked against the regression it
claims to catch:

| Mutation | Caught by |
|---|---|
| drop `railOpen` from `showCartonCursor` | *the cursor trio mounts only while a push column is open* |
| add `showExpandStrip` to `railOpen` | *railOpen excludes the parked ticket expand strip* |
| move the ring **inside** the cursor gate | *the RING renders outside the gate* |
| re-add `rightSlot` to the Displays stack | *the Displays strip takes no rightSlot* |
| re-add a `pairingOpen` flag | *no second open-state flag beside the selected tab* |
| revert `?display=` to the drifted hand-copied enum | `route-params.test.ts` → *EVERY Unbox display survives surface hygiene* |

**E2E:** two tests added to `tests/e2e/unbox-displays-column.spec.ts` —
*the cursor trio is rail-scoped; the ring holds its corner in both states* (both
halves: no chevrons at rest, and the ring still opens the column after the trio
leaves — the asymmetry someone "tidying up" would break) and *the carton # ----
chip opens the pairing display on its PO tab*.

---

## 5. Verify

**Ruling B is verified in a browser.** `tests/e2e/unbox-displays-column.spec.ts`
→ *the cursor trio is rail-scoped* passes on the QA org: ring alone at rest, trio
joins with close LEADING it to the ring's left, ring un-moved (same rounded x),
trio leaves when the column is parked, ring still opens it.

**Ruling A is verified up to the last assertion.** Before the §3a fixes the
pairing display never opened at all; after Defect 1 it opens and renders its PO
tab. The final step — that the tab arrives **selected** via the `focusTab` prop —
had not re-run when `:3050` went down mid-suite and stayed down. **Re-run this
one test first.** Never start, restart or kill a dev server; attach to the
operator's.

```bash
npx playwright test tests/e2e/unbox-displays-column.spec.ts --project=qa-desktop --workers=1
```

Run it serially. At the default worker count the parallel cold-compile of
`/unbox` blows the 30s `receiving-workspace` wait and 7 of 9 tests fail for
reasons that have nothing to do with the code.

Manual walk (unchanged, but step 3's failure mode is now different):

1. **Matched carton** — open Displays, select `Pairing`, change / unlink the PO.
2. **Unfound carton** — the lane where the hub carries the most (Quick-match +
   link live inside it, and `autoMatch` is only built when `c.isUnfound`).
3. **The `# ----` chip** → opens the `pairing` display **with the PO tab already
   selected**. If the display does not open, `?display=pairing` is being stripped
   — check `UNBOX_ROUTE_PARAMS`. If it opens on the wrong tab, the `focusTab`
   prop handoff has been replaced by an event again.
4. **Cursor trio** — with no display open: ring alone, no chevrons, no hairline.
   Open any display: `close · up · down` appear to the ring's LEFT, hairline
   between, ring still in the corner.

```bash
npx tsx --test src/components/receiving/workspace/unbox-right-edge-chrome.guard.test.ts src/components/receiving/workspace/line-edit/carton-match-hub.guard.test.ts src/components/receiving/workspace/line-edit/unbox-side-tabs.test.ts src/lib/routing/route-params.test.ts
```

**State as handed over:** 60/60 on the unit + guard specs above; `tsc --noEmit`
clean tree-wide; `eslint` clean on every touched file.

**One stale assertion left deliberately red, and it is NOT this work.**
`unbox-displays-column.spec.ts:113` — *"the column opens from the parked strip"* —
waits for `unbox-push-expand-strip`, but `showExpandStrip = showTicketExpand`
requires `ticketId != null` and the fixture carton has no ticket. The strip is
**ticket-restore only** by ruling (`source-of-truth.md` → Right-rail modality;
`LineEditPanel`: *"Parked strip is ticket-restore only — Displays opens from the
pane-anchored progress ring"*), so the spec is asserting a behaviour that was
deliberately removed. Fixing it means opening from the ring and renaming the
test — a one-line change left out of this pass because it belongs to whoever
owns that lane's copy, not because it is unknown.

**Known-red on arrival, NOT from this work.** At handover, `npm run verify` was
red on Lint / Typecheck / Unit / knip, and **every** finding traces to other
sessions' in-flight files — verified file by file:
`incoming-removal-reason.ts`, `tracking-paste.ts`, `tracking-removal-status.ts`,
`zoho-receipt-face.ts` (all untracked-new), `incoming-grid-layout.ts(.test.ts)`
and `CopyChip.tsx` (modified elsewhere). Typecheck in particular reported errors
in `unbox-tabs.tsx` / `SidebarNavList.tsx` on one run and **zero** minutes later
— that is a concurrent session mid-save, not a real failure. Check whether a
failing file is one you touched before attributing it.

---

## 6. Files

| Role | Path |
|---|---|
| Right-edge modality law | `.claude/rules/source-of-truth.md` → Right-rail modality |
| Unbox column anatomy | `.claude/rules/display/station-workbench.md` |
| Ring behaviour (unchanged, still accurate) | `.claude/rules/display/station.md` → Procedure progress chrome |
| Panel + gating | `src/components/receiving/workspace/LineEditPanel.tsx` |
| Displays column | `src/components/receiving/workspace/ReceivingDisplaysPushStack.tsx` |
| Tab vocabulary + gates | `line-edit/unbox-side-tabs.ts` (+ `.test.ts`) |
| Tab builder | `line-edit/terminal/unbox-tabs.tsx` |
| The hub | `line-edit/CartonMatchHub.tsx` |
| Guards | `line-edit/carton-match-hub.guard.test.ts` · `workspace/unbox-right-edge-chrome.guard.test.ts` |
| `?display=` vocabulary | `src/lib/routing/receiving-routes.ts` (+ `routing/route-params.test.ts`) |
| E2E | `tests/e2e/unbox-displays-column.spec.ts` |

---

## 7. Do not re-litigate

- **`PairingTogglePill` is not dead.** Triage (`TriagePanel.tsx`) and Testing
  (`TestingPanel.tsx`) still build their own `editPoControl` from it. Only
  Unbox's consumer went away.
- **`embedded` / `collapsed` / `showTopRule` on `CartonMatchHub` are not dead
  props.** Triage and Testing still pass them; the Unbox display simply does not.
- **`display/right-rail-inspector.md` is untouched and still correct.** Its
  `close · up · down` cluster is the *record inspector* header grammar
  (`PaneHeaderActionBar`), a different surface from Unbox's pane utility row.
  Ruling B applies to the Unbox pane row only — do not propagate the rail-scoped
  gate to `RightRailHost` occupant headers, where the panel's own presence *is*
  the rail.
