# Handoff — Carton inspector layout polish (photos button · columns · no Unbox spam)

**Status:** EXECUTED (UI + guard + house SoT / `display/carton-read.md`) — human visual gate still required on **49929** / **50263**  
**Lane:** `main`. Stay on it — no branch, no worktree, never `git stash`.  
**Commits:** user manages. Stage only files you touch.  
**Parent:** [`carton-inspector-D4-ROOT-FIX-HANDOFF.md`](carton-inspector-D4-ROOT-FIX-HANDOFF.md) (2a + disposition model **done**). This handoff is **visual IA only** — do not reopen 2a / D6 / ReceivingDetailsStack retirement.  
**Verify:** `npm run verify` before done. Attach to `:3050` — never start/restart/kill the dev server.  
**House law:** `.claude/rules/display/carton-read.md` + SoT rows (Photo gallery viewer · Carton read surface).

---

## 0. Why this handoff exists

Owner rejected the post-2a assembly on sight (screenshots of **49929** / **50263**):

| Rejected | Why |
|---|---|
| Full **EvidenceStage** (large selected photo + filmstrip + DIY lightbox) | Invents a second photo UI. House SoT is already `usePhotoGallery` + `PhotoViewerPortal` → `PhotoViewerModal`. |
| **“Open in Unbox”** repeated on every finding card (+ header) | Spam. Findings already say what to do; the label repeated 4× is noise. |
| Findings stacked above a bottom **AuditDrawer**; evidence stole the lead column | Wrong job order. Audit/handling belongs **top-left column 1**; findings **column 2**. |

Prior agent already swapped findings/evidence columns and wired `PhotoViewerPortal` for the lightbox — **incomplete**. Still has the big stage + Unbox links. Finish the polish below; do not redesign from scratch.

---

## 1. Locked product decisions (do not re-litigate)

| # | Decision |
|---|---|
| **P1** | **No EvidenceStage.** Delete the large preview + filmstrip component. Photos are a **button** that opens the shared viewer. |
| **P2** | Viewer SoT only: `usePhotoGallery` + `PhotoViewerPortal` (`PhotoViewerModal`). Prefer `PhotoGallery` with `launcherLayout: 'toolbar'` (or a single `Button` calling `openViewer(0)`) — **never** a local `role="dialog"` lightbox. |
| **P3** | **Remove every visible “Open in Unbox”** string: header CTA, finding-card links, any other copy. Findings keep title + short hint only (no per-card CTA). |
| **P4** | Work escape still required for read→work (guard / S5). After removing the spam, keep **one** quiet affordance: e.g. header `IconButton` / secondary control using `openInUnboxHref` **without** the words “Open in Unbox”, **or** update `carton-inspector.guard.test.ts` to assert `openInUnboxHref` exists but not the marketing string. Prefer one quiet header control over deleting the escape entirely. |
| **P5** | Body layout (above the fold on ≥xl): **two columns** — **col 1 (left):** Handling · activity · record; **col 2 (right):** Findings. Photos button lives in the **header** (or a slim actions strip under disposition), not a third photo column. |
| **P6** | Read-only viewer: pass gallery photos as `{ url }` only (no numeric `id`) so delete/upload stay off the read surface. |
| **P7** | Human visual gate still **49929** + **50263** on `:3050` before “done.” |

---

## 2. Target layout (wireframe)

```
┌─ DispositionBar ──────────────────────────────────────────────┐
│ ● Unmatched · Carton {id} · chips · flags    [Photos N] [⚒] │
└───────────────────────────────────────────────────────────────┘
┌─ Col 1 (left) ──────────────┬─ Col 2 (right) ────────────────┐
│ HANDLING · ACTIVITY · RECORD│ FINDINGS                        │
│ (audit open by default or   │ · exception cards (no Unbox     │
│  always expanded here — NOT │   links)                        │
│  a collapsed band at page   │ · Contents when lines exist     │
│  bottom)                    │ · sparse facts left-aligned     │
│ Kai · span · steps          │                                 │
│ History / events / record   │                                 │
└─────────────────────────────┴─────────────────────────────────┘
```

- Mobile: stack col1 then col2 (handling first).  
- Do **not** put a dashed empty “nothing here” band when a section has no rows — omit or one quiet line.

---

## 3. Concrete file work

Primary file:

- [`src/components/receiving/inspector/inspection/CartonInspectionPage.tsx`](../../src/components/receiving/inspector/inspection/CartonInspectionPage.tsx)

| Change | Detail |
|---|---|
| **Delete `EvidenceStage`** | Remove function + grid mount. |
| **Photos button** | In `DispositionBar` (or adjacent): `Button` / `IconButton` “Photos” / “N photos” → `gallery.openViewer(0)`. Mount `<PhotoViewerPortal g={gallery} />` once at page root. Empty → disabled or omit; errored → distinct copy (empty ≠ fetch error — keep that law). |
| **Strip Unbox copy** | Remove all `Open in Unbox` text + finding `<Link href={openInUnboxHref}>`. Keep one quiet header escape per **P4**. |
| **Promote AuditDrawer → col 1** | Move handling/activity/history/record into the **left column**, top. Stop burying it as a collapsed footer drawer competing with findings. Title eyebrow: `HANDLING · ACTIVITY · RECORD`. |
| **Findings → col 2** | Exception cards + contents + left-aligned facts (`flex flex-wrap justify-start`, not `grid-cols-3` stretch). |
| **Thin re-export** | [`CartonInspector.tsx`](../../src/components/receiving/inspector/CartonInspector.tsx) stays a re-export — no new soup. |

Guard ([`carton-inspector.guard.test.ts`](../../src/components/receiving/inspector/carton-inspector.guard.test.ts)):

- Keep: no writes, no editor imports, `formatDateTimePST`, disposition truth, no station max-width caps, photo query must not swallow `[]` on failure.  
- Update: assert shared viewer (`PhotoViewerPortal` / `usePhotoGallery` / `PhotoViewerModal`) **or** a Photos button that opens it — **not** `EvidenceStage` / local lightbox.  
- Update: no string `Open in Unbox` in the inspector tree (escape via `openInUnboxHref` without that label is OK).

Model ([`carton-inspector-model.ts`](../../src/components/receiving/inspector/carton-inspector-model.ts)): **do not change** unless copy hints need shorter ctaHint text (hints stay; links go).

---

## 4. Acceptance (pass/fail)

- [ ] No large photo stage / filmstrip on `/carton/[id]`.  
- [ ] One **Photos** control opens `PhotoViewerModal` (shared portal). Empty ≠ error branched.  
- [ ] Zero visible “Open in Unbox” strings.  
- [ ] Left column leads with **Handling · activity · record**.  
- [ ] Right column is **Findings** (exceptions without Unbox links; contents; left-aligned facts).  
- [ ] Disposition header still truthful (no “Settled” / complete while exceptions hold).  
- [ ] Guard + `npm run verify` green.  
- [ ] Owner re-checks **49929** and **50263**.

**Must not:**

- Restyle document Section soup or resurrect industry `inspection/` from chat memory beyond this file’s layout.  
- Import Unbox editors / `ReceivingDetailsStack`.  
- Raise DS ratchet baselines.  
- Start/restart/kill `:3050`.

---

## 5. Verify commands

```bash
node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
  src/components/receiving/inspector/carton-inspector-model.test.ts \
  src/components/receiving/inspector/carton-inspector.guard.test.ts

npm run verify
```

Browser (auth `tests/.auth/admin.json`, domain `localhost`, port **:3050**):

| Carton | Expect |
|---|---|
| **49929** | Disposition unmatched; Photos button → shared viewer; findings col without Unbox spam; handling col left |
| **50263** | Needs-action / unmatched; findings (incl. no contents) in col 2; handling left; **no** Work complete |

**Stop and ask the human to look before declaring done.**

---

## 6. Context for the next agent (current tree)

- Greenfield assembly lives at `inspection/CartonInspectionPage.tsx` (disposition + findings + evidence stage + audit drawer).  
- Phase B (2a navigation away from editable stack) already shipped.  
- Other lanes may leave unrelated dirty files — touch only inspector / guard / this handoff.  
- Owner quote (paraphrase): remove old photo component → photos **button**; remove all Open in Unbox; Handling · activity · record = **left top first column**; Findings = **second column**.
