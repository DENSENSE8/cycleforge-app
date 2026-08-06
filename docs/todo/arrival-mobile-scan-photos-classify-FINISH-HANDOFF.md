# Handoff — Finish Arrival mobile (scan → photos → classify) exactly

**For:** next coding agent (paste § Prompt)  
**Lane:** current checkout — stay on branch; attach to `:3050` (never start/restart). User owns commits.  
**Status:** Core flow + list/dock shell are landed. Finish = visual/QA polish + verify the locked sequence end-to-end on a signed-in phone/UA. Do **not** reopen Unbox mobile or rewrite `/m`.

---

## Prompt (paste into a new agent session)

```text
Finish Arrival mobile exactly — do not redesign; close the last polish + QA gaps.

## Mission

Close out mobile Arrival (`/m/triage`) so the locked operator sequence and shell match the product intent below. Most of the wiring is already on this branch. Your job is to (1) confirm the landed shape against the locked UI, (2) fix only what’s still wrong, (3) prove the full path on `:3050`, (4) leave guards green.

Attach to the user’s already-running app on `:3050`. Do not start/restart/kill the dev server. Stay on the current branch. User owns commits — do not commit unless asked. Prefer `npm run verify -- --fast` while iterating; full `npm run verify` before claiming done. If full verify fails on unrelated files (e.g. TestingPanel / arrival-displays-push), fix only Arrival-touched regressions; do not expand into those unrelated debts unless they block your files.

## Locked product intent (do not renegotiate)

Sequence after a successful tracking scan / list resume:

  Scan → shipping-label photo → box photo → Platform → Type → Priority

Shell on Arrival list (no `?rid=`):

- Body = shared recent list: `MobileReceivingList surface="triage"` (same waist as desktop recent rail — do not fork a second list).
- Scan dock pinned at the bottom only — no “Scan tracking” page header / hero above the list.
- Camera control is the primary, centered, thumb-focused CTA of the bottom dock (not a tiny trailing glyph). Typing tracking remains available.
- Escape: back / list from classify returns to `/m/triage` list; photo studio `back` after guided box resumes classify at Platform (`?rid=&step=platform`).

Out of scope:

- `/m/unbox` shared Receive rewrite
- Desktop Arrival / displays / inspector vocabulary
- Packer / other stations’ scan bars (unless you extract a shared prop that stays default-off)
- Full `/m` IA rewrite
- Unrelated verify failures outside Arrival files

## Already landed (start here — do not reimplement)

| Piece | Path | Notes |
|---|---|---|
| Arrival host | `src/components/mobile/receiving/MobileArrivalStation.tsx` | List + bottom `ScanInput` (`prominentCamera`); `?rid=` → classify |
| Classify sheets | `src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx` | Platform → Type → Priority via BottomSheet + PATCH |
| Flow SoT | `src/lib/receiving/arrival-mobile-flow.ts` | Photos→classify href, step parse, classify URLs |
| Guided photos | `src/components/mobile/photos/MobileReceivingPhotoStudio.tsx` | `?guided=1` label → box for `arrival_package` |
| Photo aspect | `PhotoUploadQueue` + `photo-scope` | `photoAspect` stamped on upload |
| Page mount | `src/app/m/(shell)/triage/page.tsx` | Mounts `MobileArrivalStation` |
| Proxy | `src/proxy.ts` | UA `/triage` → `/m/triage` |
| Scan camera prop | `src/components/mobile/redesign/ScanInput.tsx` | `prominentCamera` enlarges right-slot camera |
| Guards | `mobile-arrival-station.guard.test.ts`, photo studio guided guard, queue/rehydrate tests | Keep green; extend if you change contracts |

## Exact finish checklist (do these)

1. **Visual shell on `/m/triage` (signed in, phone or narrow UA)**
   - Opens list of recent triage arrivals (not a blank scan-only hero).
   - No “Scan tracking” (or equivalent) header above the list.
   - Bottom dock: scan field + camera CTA. Camera must read as the focal control — if `prominentCamera` is still a slightly-larger right trailing icon and does not feel “middle / primary,” rework the Arrival dock only (compose above `ScanInput` / `ThemedStationScanBar` as needed) so the camera is centered and thumb-primary while keyboard/type-in still works. Prefer growing `ScanInput` with a default-off prop over forking a second bar.

2. **Scan → photos**
   - Successful `POST /api/receiving/lookup-po` (`intakeSurface: 'triage'`, `localOnly: true`) navigates to guided arrival photos (`guided=1`, stage `arrival_package`).
   - Label photo first, then box; aspects stamp correctly.

3. **Photos → classify**
   - After box (or skip path that completes guided), land on `/m/triage?rid=<id>&step=platform` (or equivalent SoT href).
   - Platform → Type → Priority sheets advance; PATCH succeeds; finishing Priority returns to list (`/m/triage` without rid) or agreed done state.

4. **List row resume**
   - Tapping a recent triage row resumes the Arrival guided path (photos then classify), not a dead end / desktop-only href.

5. **Drawer / naming**
   - Mobile drawer label **Arrival**; `/m/unbox` unchanged.

6. **Guards + verify**
   - Update Arrival guards if dock/camera contract changes.
   - `npm run verify -- --fast` green on your touch set; full `npm run verify` before done. Do not raise DS/knip baselines.

## Done when

- `/m/triage` = recent triage list + bottom scan dock; camera is clearly the primary bottom CTA (centered / thumb-focused).
- Full path Scan → label → box → Platform → Type → Priority works on `:3050` while signed in.
- List row + photo `back` resume classify correctly.
- Arrival-related unit/guards green; no new ratchet debt.
- Short note in the agent reply: what was still wrong, what you changed, what you verified in browser.

## Do not

- Reintroduce a sticky “Scan tracking” header or door-intake hero that pushes the list away.
- Replace `MobileReceivingList` with a page-local list twin.
- Start/restart the dev server.
- Commit or push unless the user asks.
```

---

## Context for the finisher (do not paste unless useful)

**Prior session:** Arrival was split off shared mobile Receive; guided photos + classify sheets shipped; cleanup removed the header and made the body `MobileReceivingList` + bottom `ScanInput(prominentCamera)`. Browser QA was blocked on sign-in; camera “middle” may still be under-delivered (prop only enlarges the right-slot icon).

**Unrelated verify noise (ignore unless your files fail):** TestingPanel / arrival-displays-push style failures outside this ticket.
