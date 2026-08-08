# Unfound-order receive via the bottom dock — step-by-step, mobile-first (HANDOFF)

**Goal (one sentence):** An operator receives an **unfound** carton *completely from the
bottom dock alone* — scan → classify → capture → receive — one contextual step at a time,
and it works on a phone.

**Scope — hold this line:** Unfound orders **only**, first. Do **not** touch the found /
return flows, the desk surfaces, or the layout of steps that already work. Prove the whole
walk on **one** unfound carton on an authenticated **mobile** bench before widening a millimetre.

---

## Why this handoff exists (read first)

The last dock pass was done **without an authenticated bench** — the implementer could not
sign in to `:3050`, so layout changes were never seen rendered, only inferred from green
guards. A parallel session was also editing `LineEditPanel.tsx` at the same time. Net effect
at the bench: *"nothing is updating."*

**Rule #1 of this handoff: verify every change on a real signed-in MOBILE bench against an
unfound carton. Green guards are necessary, not sufficient. Do not report "done" from guards.**

---

## The unfound flow — ground truth

`resolveUnboxFlow({ isUnfound: true }) → 'unfound'` · steps from `useUnboxProcedureSteps(row)`
(`src/lib/stations/procedure.ts` → `UNFOUND_CAPTURE = ['classify', ...FOUND_CAPTURE]`):

| # | step `key` | dock control **today** | unfound gap |
|---|---|---|---|
| 1 | `scan` | scan bar | ok |
| 2 | **`classify`** | **NONE** — in `UNBOX_STEPS_WITHOUT_DOCK_ACTION`; editor is `TriageClassifySection` (Displays/centre) | **CORE GAP** — no PO, so identifying the item is mandatory and must be doable from the dock |
| 3 | `arrival_check` | none (reads door evidence); wedge advances | ok |
| 4–6 | `shipping_label_photo` · `box_photo` · `packing_material` | `CartonPhotoDockControl` (camera + link) | ok |
| 7 | `contents` | `ContentsDockControl` (confirm) | no line list to check against — you are **creating** the line |
| 8 | `serial` | `SerialDockControl` (fills band) | ok — **this is the "serial in the entry to continue"** |
| 9 | `condition` | `ConditionDockControl` (grade chips) | ok |
| 10 | `item_photos` | `ItemPhotoDockControl` | ok |
| 11 | `label` | `LabelDockControl` (confirm face) | ok |
| 12–13 | `print` · `receive` | Resolution Terminal (`StationTerminalDock`, on settle) | **must create + receive an unmatched line** (`add-unmatched-line` → `mark-received-po`) |

**The unfound-specific work is steps 2, 7, and 12–13** — identify with no PO, and receive an
unmatched line into inventory. Everything else is shared with the found flow and already has a
dock control.

---

## Target

1. **The dock is the only surface needed for an unfound receive.** Each capture step's action
   is in the dock's Band 1 (leading), one at a time, `activeKey`-driven. No trip to the centre
   or Displays to finish the carton.
2. **`classify` gets a dock control** (reuse `TriageClassifySection` — do not fork a second
   classify editor) so the operator identifies the item without leaving the dock. Remove it
   from `UNBOX_STEPS_WITHOUT_DOCK_ACTION` and add the `UNBOX_STEP_DOCK_CONTROLS` entry (both
   are guarded — see below).
3. **`serial`** is the full-width wedge for step 8 (`SerialDockControl` already fills the band).
4. **Commit** (Print · Receive) creates the unmatched line + inventory for a carton with no PO.
5. **Mobile:** the whole walk works on the `/m/*` mobile shell — dock reachable, thumb-sized
   targets, wedge + camera work with the phone. The dock is `absolute inset-x-0 bottom-0` today;
   confirm it is not clipped / covered on a phone viewport and the keyboard does not hide it.

---

## Files

- **Flow SoT:** `src/lib/stations/procedure.ts` (`UNFOUND_CAPTURE`, `resolveUnboxFlow`)
- **Dock:** `src/components/receiving/workspace/line-edit/UnboxDockHost.tsx` · `UnboxStepDock.tsx` ·
  `steps/dock/*` (**add a `classify` control here**) · `steps/dock/index.ts` (registries)
- **Dock wiring:** `src/components/receiving/workspace/LineEditPanel.tsx`
  — ⚠️ **a parallel session edits this file; coordinate before large edits, re-read before editing.**
- **Classify editor to reuse:** `TriageClassifySection`
- **Unfound receive routes:** `/api/receiving/add-unmatched-line` · `/api/receiving/mark-received-po` ·
  `/api/receiving/identify-label`
- **Mobile:** `src/components/mobile/*` (identify: `src/components/mobile/identify/useMobileIdentify.ts`)
- **Rules:** `.claude/rules/source-of-truth.md` → Unbox centre (main) ·
  `.claude/rules/display/station-workbench.md` → dock · `.claude/rules/display/station.md`

---

## Guards (keep green + extend)

- `unbox-dock-one-shell.guard.test.ts` · `steps/dock/procedure-step-dock.guard.test.ts` ·
  `procedure-divergence.guard.test.ts` · `label-note-grain.guard.test.ts`
- **If `classify` gains a dock control:** it must LEAVE `UNBOX_STEPS_WITHOUT_DOCK_ACTION` and
  ENTER `UNBOX_STEP_DOCK_CONTROLS` in the same change — `procedure-step-dock.guard.test.ts`
  fails if a step is in neither or both.
- Add a guard asserting the unfound flow is dock-completable (every unfound capture step has a
  dock control OR a stated reason).

---

## Verification — mandatory (this is the step that was skipped)

1. Sign in on a **phone / mobile viewport** as a bench operator (not the preview browser — a
   real authenticated session).
2. Scan an **unfound** carton (arrived, no matched PO).
3. Complete every step **from the dock only**: classify → photos → contents → serial →
   condition → item photos → label → Print → Receive.
4. Confirm inventory is created and the carton reads **Received**.
5. Screenshot each step. Report with screenshots, not guard output.

---

## P0 prompt (paste to a fresh session)

```text
Scope: UNFOUND unbox flow ONLY. Goal: receive an unfound carton COMPLETELY from the bottom dock,
step-by-step, on a mobile viewport. Read docs/todo/unfound-dock-receive-HANDOFF.md.

0. Sign in on a mobile viewport; scan an unfound carton; list which steps the dock CANNOT drive today.
1. Give `classify` a dock control (reuse TriageClassifySection — no fork). Move it out of
   UNBOX_STEPS_WITHOUT_DOCK_ACTION into UNBOX_STEP_DOCK_CONTROLS; update the guards.
2. Make `contents` + commit create and receive the unmatched line (add-unmatched-line → mark-received-po).
3. Walk the FULL unfound receive from the dock on a phone; screenshot every step; confirm inventory.
Coordinate on LineEditPanel.tsx (parallel session). Never restart the dev server. Never raise baselines.
Do not touch found/return flows or desk surfaces.
```
