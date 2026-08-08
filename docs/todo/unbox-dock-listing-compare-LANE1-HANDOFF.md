# Handoff — Lane 1 Unbox dock honesty + listing photo compare

**For:** next coding agent (paste § Prompt)  
**Date:** 2026-08-08 · **Lane:** current checkout (`main` / dogfood) — stay on branch; attach to `:3050` (never start/restart). User owns commits.  
**Status:** Core honesty + Displays Compare **landed in working tree**. Finish = dogfood the full carton walk on `:3050`, clear full-verify noise that this lane owns, leave Lane 2 (Testing QC) alone.  
**Sibling lane (do not mix):** [`testing-qc-dock-works-as-listed-LANE2-HANDOFF.md`](./testing-qc-dock-works-as-listed-LANE2-HANDOFF.md)  
**Supersedes / continues:** [`unbox-bottom-dock-procedure-FINISH-HANDOFF.md`](./unbox-bottom-dock-procedure-FINISH-HANDOFF.md) · two-lane plan (Unbox first).  
**Out of scope:** Testing / QC dock · Archive | Reticle | Queue · Generate Asset Tag / Electron · remount centre `ProcedureDeck`.

**Binding rules:**  
[`AGENTS.md`](../../AGENTS.md) · [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → *Unbox centre (main)* · [`display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) · [`pattern-evolution.md`](../../.claude/rules/pattern-evolution.md).

---

## Prompt (paste into a new agent session)

```text
Lane 1 — Unbox dock honesty + listing photo compare.
Do not touch Testing QC (Lane 2). Do not redesign UnboxDockHost into Archive|Reticle|Queue.

## Mission

Unbox already has UnboxDockHost (step CTA · notes · Print · Receive + under-dock pager/ring). Working-tree additions you must prove and finish:

1. Focus-release after evidence — › onto a pending step then shoot/ack must advance the pointer (shouldReleaseFocusAfterEvidence + useUnboxProcedureSteps). Reopen of an already-done step must keep focus.
2. Dock serial owns wedge when serial step is mounted (UnboxSerialStepSurface autofocus + receiving-focus-scan; sidebar skips when [data-unbox-serial-dock] exists).
3. Carton photo Link popover closes after a successful forward pair (onPaired).
4. Actionless arrival_check / classify: empty leading + under-dock summary “Use › when ready”.
5. Multi-qty Phase 2 cues: fill all serials then one line condition + photos (“N of M” / “Once for line”) — not per-unit trio×N.
6. Displays Photos → Compare leaf (ListingPhotoCompareHost) — listing gallery vs bench evidence; auto-opens on item_photos (never yanks Ticket / Move / Send). Capture stays in the dock.

Prove the full walk on :3050. Leave Unbox guards green. Prefer npm run verify -- --fast while iterating; full npm run verify before done. Fix only regressions this lane owns (or document dirty-tree noise).

Attach to :3050 — never start/restart/kill the dev server. Stay on current branch. User owns commits.

## Locked intent

- Bottom dock = command; middle = PO ledger + label; Displays = reference (Compare / Checklist / …).
- FOUND_CAPTURE item trio = Serial → Condition → Photos.
- Centre ProcedureDeck / UnboxItemsPanel stay PARKED.
- No UnboxDockHost import into Testing.

## Already landed (start here)

| Piece | Path |
|---|---|
| Focus release | `src/lib/receiving/procedure-pointer.ts` `shouldReleaseFocusAfterEvidence` + tests; wired in `useUnboxProcedureSteps.ts` |
| Serial wedge | `steps/UnboxSerialStepSurface.tsx`; sidebar skip in `ReceivingSidebarPanel.tsx` |
| Pair close | `CartonPhotoDockControl` / `CartonPhotoPairPanel` `onPaired` |
| Compare leaf | `ListingPhotoCompareHost.tsx` · Photos tab in `PhotosDisplayHost.tsx` · `photoAction=compare` in `unbox-side-tabs.ts` |
| Auto-open | `LineEditPanel.tsx` item_photos → `openDisplays('photos', { photoAction: 'compare' })` |
| Guards | `listing-photo-compare.guard.test.ts` · `unbox-dock-one-shell.guard.test.ts` |

## Finish checklist

- [ ] Manual :3050: open carton → carton shots advance from dock → contents → Serial → Condition → Photos (Compare opens) → Label → Print · Receive; › then shoot advances; meta click re-enters dock
- [ ] Targeted: procedure-pointer, listing-photo-compare, unbox-dock-one-shell, procedure-step-dock, derive-capture-step-states, unbox-procedure-flows
- [ ] `npm run verify -- --fast` then full `npm run verify` — fix only Lane-1-touched failures
- [ ] Record walk in reply (what you opened / what you saw)

## Do not

- Implement TestingDockHost / works-as-listed / seller-claimed (Lane 2).
- Remount ProcedureDeck; put ring on Displays rightSlot; raise DS/knip baselines.
- Commit unless asked.
```

---

## Known gaps / verify note

- Full `npm run verify` may still fail on **unit tests + knip** from dirty-tree debt unrelated to this lane — fix only files this handoff owns.
- Seller-claimed condition for Compare listing side is SKU gallery (`sku_catalog_id`) + Open listing URL — not marketplace scrape. Honest empty when no gallery.
- Phase 2 multi-qty is intentional (not per-unit trio loop).
