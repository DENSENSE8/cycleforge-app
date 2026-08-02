# Claude Code prompt — Carton look-up photo triage (Exact · Investigative)

**For:** Claude Code / Cursor Agent  
**From:** Cycle Forge improve-ui audit 2026-08-01 (carton inspector Photos)  
**Status:** RESEARCH first → then BUILD in slices. Do not code until Phase 0 research gate passes.  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Parents / companions (read, do not reopen):**

| Doc | Role |
|---|---|
| [`photo-evidence-chain-INDEX.md`](./photo-evidence-chain-INDEX.md) | Stage matrix · insurance north star |
| [`photo-evidence-policy-claims-insurance-plan.md`](./photo-evidence-policy-claims-insurance-plan.md) | Claim attach / link_role (Plan 5 — deferred unless needed) |
| [`carton-inspector-LAYOUT-POLISH-HANDOFF.md`](./carton-inspector-LAYOUT-POLISH-HANDOFF.md) | Prior lock: Photos button in header · no EvidenceStage · shared viewer SoT |
| `.claude/rules/display/carton-read.md` | Carton read surface contract (if present) |
| `.claude/rules/kinetic-ledger.md` · `pattern-evolution.md` · `source-of-truth.md` | Hard laws |

**Supersedes (layout-polish only where conflicted):**

| Prior lock | New ruling |
|---|---|
| Photos button → opens `PhotoViewerPortal` as **primary** | Photos CTA → opens **in-flow triage panel**; lightbox is **tile drill-in only** |
| `readOnly` passes `{ url }` only | Still omit numeric `id` (no delete/upload). **Must pass `meta`** (stage/aspect/timestamps/PO) so triage + viewer context work |
| Mid-rail `PhotoLauncher` card OK | Demote/remove ProgressRail launcher; entry is DispositionBar **primary CTA** |

**Does not supersede:** No second lightbox · no `EvidenceStage` fork · compose `PhotoGallery` / `PhotoViewerPortal` · no “Open in Unbox” spam · user owns commits · `npm run verify` before done.

---

## Paste this into a new Claude Code session

**Run as TWO sessions.** Session A is research-only (writes a short ruling doc, no app code).  
Session B builds only after the research gate is accepted.

### Session A — research (do this first)

```
Read docs/todo/carton-photo-triage-CLAUDE-CODE-PROMPT.md end-to-end, then execute
§4 Phase 0 ONLY. Write the research ruling to
docs/todo/carton-photo-triage-RESEARCH-RULING.md. Do not edit src/ yet.

GOAL
1. Confirm industry claim-photo SOP (carrier 3-shot) vs house stage×aspect SoT.
2. Map Exact | Investigative and Box | Item | Damaged → existing SoTs — no parallel taxonomy.
3. Inventory data gaps on GET /api/receiving-photos + ReceivingPhotosSection readOnly path.
4. Recommend placement: DispositionBar CTA + in-flow panel (main-column swap vs right-rail push).
5. List blast radius (guards, ClaimPhotoPicker, PhotoGallery, WS-PHOTO plans).

HARD LAWS
- AGENTS.md + .claude/rules/source-of-truth.md
- Compose stage/aspect/link_role SoTs — never invent photo_type=receiving_damaged
- Attach to :3050; never start/restart/kill the server; user owns commits
- Stop at the research gate; wait for human "build" before Session B
```

### Session B — build (only after research ruling accepted)

```
Read docs/todo/carton-photo-triage-CLAUDE-CODE-PROMPT.md §4 Phase 1–4 and
docs/todo/carton-photo-triage-RESEARCH-RULING.md.

Execute Phase 1 (data) → Phase 2 (CTA) → Phase 3 (triage UI) → Phase 4 (guards + verify).
Ship in reviewable slices. Prefer growing SoTs over page-local forks.

HARD LAWS
- No EvidenceStage / no local role="dialog" lightbox — PhotoViewerPortal only for drill-in
- DispositionBar Photos primary CTA; remove mid-rail launcher as primary entry
- Exact/Investigative + Box/Item/Damaged are OPERATOR labels over house SoT buckets
- Extract useReceivingPhotos; update carton-inspector.guard.test.ts intentionally
- npm run verify before done; never raise ratchet baselines
- User owns commits; attach to :3050
```

---

## 0. One-sentence goal

**On carton look-up/search, Photos is a DispositionBar primary CTA that opens an in-flow triage surface (Exact vs Investigative; Exact drills Box · Item · Damaged) wired to the house photo stage×aspect×link_role SoT — lightbox only for single-tile drill-in.**

---

## 1. Industry contract (why this shape)

### Carrier / warehouse SOP (web research 2026-08-01)

| Source | Required shots / practice |
|---|---|
| UPS damage claims | (1) exterior package showing damage · (2) damaged item + original internal packaging · (3) shipping-label close-up |
| Receiving SOPs (DockSnap, Blimp, NTIA) | Context + detail layers; timestamped; linked to PO/shipment; photograph before handling; separate arrival/package vs contents vs damage close-ups |
| WMS evidence UIs | Task-linked attachments; carousel/grid browse; optional required-shot validation for damage workflows |

### Operator IA (product ask)

```
[Photos · N] CTA (DispositionBar top-right)
        ↓
┌─ Photo triage (in-flow) ─────────────────────────────────────┐
│ Tabs:  Exact photo  |  Investigative evidence                │
│                                                              │
│ Exact → drill:  All  →  Box  |  Item  |  Damaged             │
│         + claim-readiness checklist (label · box · item)     │
│                                                              │
│ Tile click → PhotoViewerPortal (shared SoT)                  │
└──────────────────────────────────────────────────────────────┘
```

### House SoT mapping (do not invent a parallel enum)

| Operator label | SoT mapping |
|---|---|
| **Box** | Stages `arrival_package` + `unbox_carton` · aspects `shipping_label`, `box_exterior`, `box_interior`, `packing_material` |
| **Item** | Stage `unbox_item` (`RECEIVING_LINE`) · aspects `front`/`back`/`side`/`bottom`/`serial`/`included` |
| **Damaged** | UI grouping — prefer `damageDetected` (photo_analysis) and/or `link_role=claim_evidence` on item/box shots. **Not** a new `photo_type` or aspect unless research proves capture must write one |
| **Exact (claim-ready)** | Aspect-complete carrier minimum **or** rows with `link_role=claim_evidence` (research picks the default; document it) |
| **Investigative** | Full carton evidence trail (`photoIntent=all` + unclassified `photo_aspect=null` + optional testing/packing via journey if already linked) |

Canonical modules:

- `src/lib/receiving/photo-intent.ts`
- `src/lib/photos/stages.ts`
- `src/lib/photos/photo-aspects.ts`
- `src/lib/photos/types.ts` → `PHOTO_LINK_ROLES`
- `docs/todo/photo-evidence-chain-INDEX.md`

---

## 2. Current state (verified 2026-08-01 audit)

| Fact | Where |
|---|---|
| Photos live mid-rail in `ProgressRail` via `ReceivingPhotosSection readOnly` | `CartonInspectionPage.tsx` |
| Entry is full-width `PhotoLauncher` card → `openViewer(0)` lightbox | `PhotoLauncher.tsx` / `PhotoGallery.tsx` |
| DispositionBar top-right = Share · Copy · Audit · Unbox wrench — **no Photos** | `DispositionBar` |
| `readOnly` maps to `{ url }` only — strips meta needed for triage | `ReceivingPhotosSection.tsx` |
| List SQL aliases `p.photo_type AS caption` — type mislabeled | `src/lib/photos/queries/receiving-list.ts` |
| GET `/api/receiving-photos` returns `photoAspect`, `receivingLineId`, timestamps; **missing** `photoType`, `entityType`, `linkRole`, `damageDetected` | route + list query |
| Guard pins `ReceivingPhotosSection` readOnly + shared viewer | `carton-inspector.guard.test.ts` |
| Sibling claim grid exists | `ClaimPhotoPicker.tsx` |

**Audit scores (context only):** critique ~58/100 · technical 12/20 — blocked on data contract for honest tabs.

---

## 3. Hard Always / Never

### Always

- DispositionBar **primary** Photos CTA with count (and optional claim-readiness chip after Phase 3).
- In-flow triage as primary browse; `PhotoViewerPortal` for drill-in only.
- Bucket photos via `photo-intent` / `stages` / `photo-aspects` / `PHOTO_LINK_ROLES` helpers — views stay dumb.
- Omit numeric photo `id` on read look-up (no delete/upload); **keep meta**.
- Compose `SectionTabsSlider` (same family as Unbox/Triage tabs).
- Update guards when mount site / fetch SoT changes — never delete the intent of the guard.
- `npm run verify` green before claiming done.

### Never

- Second lightbox / `EvidenceStage` / page-local `role="dialog"` photo UI.
- New `photo_type` values for “damaged” without an explicit research ruling + capture writer.
- Fork `PhotoGallery` keyboard/nav/delete machine for carton-only.
- Raise DS ratchet baselines or `--no-verify`.
- Start/restart/kill `:3050`; commit/push unless user asks.
- Reopen full WS-PHOTO Plan 5 policy enforcement unless research proves Exact checklist needs it this slice.

---

## 4. Execution phases

### Phase 0 — Research (Session A) — GATE

**Deliverable:** `docs/todo/carton-photo-triage-RESEARCH-RULING.md` with:

1. **Exact default rule** — aspect-completeness vs `claim_evidence` link_role (pick one primary; note fallback).
2. **Damaged rule** — analysis flag vs link_role vs item-stage-only UI label (pick one; list API join cost).
3. **Placement** — main-column swap under DispositionBar vs `RightRailHost` push occupant (carton-read is already full-width look-up — argue one).
4. **API delta table** — fields to add to receiving-photos GET + filters (`linkRole`?).
5. **Caption/type bug** — confirm `photo_type AS caption` and the fix shape.
6. **Compose plan** — grow `ClaimPhotoPicker` vs new `CartonPhotoTriage` that both share a hook/grid atom.
7. **Out of scope** — what stays in WS-PHOTO Plan 5 / library / journey.
8. **Acceptance checklist** for Session B.

**Stop.** Do not edit `src/` until the human says **build** (or accepts the ruling).

---

### Phase 1 — Data contract (Session B slice 1)

1. Fix receiving-list SELECT: expose real `photoType`; do not overload `caption`.
2. Extend GET `/api/receiving-photos` row: `entityType`, `photoType`, `linkRole`; optional `damageDetected` if ruling requires it.
3. Optional query filter `linkRole` validated against `PHOTO_LINK_ROLES`.
4. Extract `useReceivingPhotos(receivingId, opts)` from `ReceivingPhotosSection` (poll/realtime/error semantics preserved).
5. Read-only gallery inputs: `{ url, meta }` via existing meta helpers; still no `id` if that is how delete stays off.
6. Unit tests for mapper / intent helpers; route smoke if present.

**Gate:** typecheck + unit tests for photo list shape; inspector can derive Box/Item buckets client-side.

---

### Phase 2 — DispositionBar CTA (Session B slice 2)

1. Add primary Photos control to `DispositionBar` top-right (before or after utility icon cluster — research ruling picks; prefer **primary before quiet utilities**).
2. Count from `useReceivingPhotos`; loading/error states quiet and honest.
3. Wire CTA → open triage surface (Phase 3 shell can be a stub panel first).
4. Remove or demote ProgressRail `ReceivingPhotosSection` launcher card so Photos is not dual-entered.
5. Keep Unbox wrench as quiet work escape.

**Gate:** visual — Photos is the obvious look affordance in the header; mid-rail card gone or non-primary.

---

### Phase 3 — Triage UI (Session B slice 3)

1. New component (name per ruling), e.g. `CartonPhotoTriage`, composed under carton read:
   - Top: `SectionTabsSlider` — **Exact** | **Investigative**
   - Exact: sub-filter **All | Box | Item | Damaged** (chips or nested tabs — prefer chips to avoid tabception)
   - Exact: claim-readiness checklist (label · box exterior · item) from `ASPECTS_BY_STAGE` + present aspects
   - Grid/strip of tiles; click → `PhotoViewerPortal` / `usePhotoGallery` drill-in
2. Bucket logic lives in `src/lib/photos/` (or `receiving/`) pure helpers — **not** JSX conditionals.
3. Empty / error / loading: Exact empty ≠ Investigative empty; never collapse fetch error to “no photos”.
4. a11y: tablist naming, tile alt from `photoAspectLabel` + stage when known.

**Gate:** dogfood carton with ≥1 package + ≥1 item photo shows correct Box/Item split; lightbox still shared SoT.

---

### Phase 4 — Guards, polish, verify (Session B slice 4)

1. Update `carton-inspector.guard.test.ts`:
   - Pin shared fetch SoT / triage compose / readOnly (no writes)
   - Allow DispositionBar Photos CTA
   - Still ban local dialog lightbox / EvidenceStage / upload/delete on look-up
2. Token/polish only if in-scope (no drive-by).
3. `npm run verify` full green.
4. Manual check on `:3050` search → carton sel (use known dogfood ids from prior handoffs if still valid).

---

## 5. File touch map (expected)

| Area | Likely paths |
|---|---|
| Research out | `docs/todo/carton-photo-triage-RESEARCH-RULING.md` |
| API / queries | `src/app/api/receiving-photos/route.ts`, `src/lib/photos/queries/receiving-list.ts` |
| SoT helpers | `src/lib/photos/*` or `src/lib/receiving/photo-intent.ts` (triage bucket pure fns) |
| Hook | new `useReceivingPhotos` near `ReceivingPhotosSection` |
| UI | `CartonInspectionPage.tsx`, new triage component under `receiving/inspector/` |
| Gallery | `ReceivingPhotosSection.tsx`, maybe thin `PhotoGallery` props — **no fork** |
| Guards | `carton-inspector.guard.test.ts` |
| Optional compound | `ClaimPhotoPicker.tsx` only if research says share grid atom this PR |

---

## 6. Acceptance (done means all true)

- [ ] Research ruling committed/accepted before build
- [ ] DispositionBar shows primary Photos CTA with count
- [ ] Mid-rail launcher is not the primary entry
- [ ] Triage opens in-flow with Exact | Investigative
- [ ] Exact drills All → Box | Item | Damaged using SoT buckets (documented in ruling)
- [ ] Tile → shared `PhotoViewerPortal` only
- [ ] Read look-up still cannot upload/delete/reassign
- [ ] receiving-photos response exposes fields needed for buckets
- [ ] `photo_type AS caption` bug fixed
- [ ] Guards updated and green
- [ ] `npm run verify` green

---

## 7. Out of scope (ticket / later)

- Enforcing `receiving.photoPolicy` on mark-received (WS-PHOTO Plan 5)
- New capture surfaces that stamp a `damage` aspect
- Library folder IA / serial journey media (WS-PHOTO Plans 3–4)
- Mobile swipe gallery redesign
- Changing Unbox station photo capture chrome

---

## 8. Suggested commit slices (user owns commits)

1. `fix(photos): expose photoType/entityType/linkRole on receiving-photos list`
2. `refactor(receiving): extract useReceivingPhotos for look-up + section`
3. `feat(carton-read): DispositionBar Photos CTA opens triage shell`
4. `feat(carton-read): Exact/Investigative photo triage with Box·Item·Damaged`
5. `test(carton-inspector): guard triage SoT; drop ProgressRail launcher pin`

---

## End of prompt
