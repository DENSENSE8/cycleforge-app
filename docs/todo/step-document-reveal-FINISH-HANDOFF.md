# Step-document reveal (Candidate B) — FINISH HANDOFF

**Status:** Phase 1 **CLOSED except the commit** — code + migration applied, smoked
on a live browser against `:3050`, e2e landed and green
(`tests/e2e/pack-kit-part-document.spec.ts`, qa-desktop). Still **uncommitted** —
the user owns that. Phase 2 remains **blocked** until bench observation.
**Ruling:** [`step-document-reveal-RULING.md`](./step-document-reveal-RULING.md)
**Brief:** [`step-document-reveal-GEMINI-RESEARCH-BRIEFING.md`](./step-document-reveal-GEMINI-RESEARCH-BRIEFING.md)

---

## 0. Paste prompt (give this to the next agent)

```
Finish Phase 1 of Candidate B (pack kit-part reference documents) — do NOT start Phase 2.

Context (read first, in order):
1. docs/todo/step-document-reveal-RULING.md — verdict B, host = Pack kit part (a), Unbox/Testing out
2. docs/todo/step-document-reveal-FINISH-HANDOFF.md — this file (shipped vs open)
3. AGENTS.md + .claude/rules/workflow-safety.md — attach :3050, never start/kill the dev server; user owns commits

Already done (do not re-implement):
- Migration 2026-08-01d_kit_part_reference_document.sql APPLIED (document_url/title/mime on sku_kit_parts)
- kitPartDocument() resolver + unit tests
- PackChecklistLineRow KitPartDocumentStrip (collapseHeight + View/Print → DocumentSlideOver)
- packing-checks origin: print | acknowledgement (value_text) + audit method
- KitPartsSection authoring fields (Blob URL)
- npm run verify green when this lane last closed

Your job — close Phase 1 only:
1. Dogfood smoke on :3050 (attach, never restart):
   - Products → Kit parts: attach a real Blob https URL (pdf) to one critical MANUAL/INSERT part
   - Pack station: expand that order line → strip shows title + View + Print
   - View opens DocumentSlideOver (~640px); Print spools + ticks with origin=print
   - Checkbox tap ticks with origin=acknowledgement and shows Confirm chip
   - A part WITHOUT a document is byte-identical to before (no strip)
2. Add a focused e2e under tests/e2e/ that pins: document-bearing kit part shows the strip; View opens the slide-over; a no-document part has no strip. Prefer the QA org. Compose existing Pack fixtures if any; do not invent a second PDF viewer.
3. Fix any fail found in (1)/(2). Do not raise knip/DS baselines.
4. npm run verify must stay green.
5. Append pnpm worklog when done. Do NOT commit unless the user asks.
6. Update this handoff Status + §3 checklist when each item closes.

Hard bans:
- No Candidate A split-reveal / layout animation of sibling rows
- No ProcedureChecklist / Unbox / Testing manuals port
- No auto-advance / scan-follow / Phase 2
- No /api/documents/:id/content for packer bytes (Blob URL only)
- Never git stash; never start/kill the :3050 dev server
```

---

## 1. Verdict (do not re-litigate)

| Decision | Answer |
|---|---|
| Design | **Candidate B** — small in-row disclosure → `DocumentSlideOver` |
| Host | **Pack kit part** inside `OrderPackChecklist` (ruling §4 option a) |
| Attribute | On the kit part (`document_*` columns), **not** a new procedure step kind |
| Unbox | **Out** — evidence-derived, no paper into a box |
| Testing | **Deferred** until §6 bench measurement |
| Motion | Layout-animation ban **holds**; only `framerPresence.collapseHeight` for the strip |
| Auto-advance | **Phase 2** — after Phase 1 is observed stable on a live bench |

---

## 2. Shipped (working tree + DB)

| # | Item | Where |
|---|---|---|
| 1 | Columns + CHECK + partial index | `src/lib/migrations/2026-08-01d_kit_part_reference_document.sql` (**applied**) |
| 1b | Drizzle model | `src/lib/drizzle/schema.ts` (`skuKitParts`) |
| 2 | DTO `document: KitPartDocument \| null` | `src/lib/packing/order-pack-checklist.ts` |
| 3 | SELECT * carries columns; resolver | `getKitParts` + `kit-part-document.ts` |
| 4 | Strip: name + View + Print via `collapseHeight` | `PackChecklistLineRow.tsx` (`KitPartDocumentStrip`) |
| 5 | Slide-over handoff | `OrderPackChecklist.tsx` → `DocumentSlideOver` |
| 6 | `origin: 'print' \| 'acknowledgement'` on tick | `packing-checks.ts`, route, `usePackingCheckPersist` |
| 7 | Authoring URL/title/mime | `KitPartsSection.tsx` + kit-parts schema/API/create/update |
| — | Unit tests | `kit-part-document.test.ts`, packing-checks origin tests |
| — | Docs | briefing Status → ANSWERED; ruling Status → Phase 1 SHIPPED |

**Permission invariant (live):** packer bytes = Blob `document_url` only. Never
`/api/documents/:id/content` (`packing.*` ⇏ `orders.view`).

---

## 3. Still open — finish checklist

- [x] **Live-browser smoke on `:3050`** (2026-08-02) — authored an insert through the real
      Products → Kit parts UI (Blob url persisted), then at Pack: strip renders with title ·
      View · Print, `Confirm` chip on the document-bearing part only, the no-document sibling
      byte-identical (no strip, no chip). **Print** opened the popup + the slide-over and wrote
      `origin: 'print'`; the **checkbox tap** wrote `origin: 'acknowledgement'`. Verified in
      `tech_verifications.value_text` (`print` / `acknowledgement`), then the smoke's residue
      was removed. **Run on the QA org, not the dogfood tenant** — `verify.md` prefers it, and
      the USAV session could not be minted anyway (`PW_OWNER_PASSWORD` in `.env` is stale →
      `401 INVALID_CREDENTIALS`; a fresh password is the user's to supply). Same code path
      either way — the checklist is org-agnostic.
- [x] **E2E** — `tests/e2e/pack-kit-part-document.spec.ts` (qa-desktop, 2 tests, green):
      the DTO carries `document` only for the part that has one (`null`, not a missing key,
      for the sibling); the strip renders on that part and **not** on the sibling; View opens
      the one `DocumentSlideOver` showing that part's Blob url. Parts are created and deleted
      by the spec. Test seams added: `data-testid="kit-part-document-strip"` and a per-row
      `pack-kit-part-<id>` — the second is what makes "no strip" provable.
- [ ] **Thumbnail gap (optional polish)** — ruling asked for a thumbnail; strip ships `FileText` icon because kit parts have no thumb URL. Only add a thumb if a real image URL exists (e.g. mime=image first page) — do **not** invent a second render path
- [ ] **Commit** — user-owned; stage **only** the file list in §5 when asked
- [ ] **Phase 2 gate** — leave closed until a live-bench note that the Phase 1 list stays spatially stable under pack cadence

### Found in passing — NOT this lane's bug

`PackChecklistLineRow`'s line row nests the SKU `CopyChip`'s `<button>` inside the
expand `<button>` (React logs *"cannot contain a nested button"* / a hydration
warning on every pack line that has a SKU). It predates the insert work and fixing
it means moving the chip out of the expand target — a row-anatomy change, not a
document change. Left alone deliberately.

### `npm run verify`

Red on the shared tree, and **every failure belongs to other sessions' uncommitted
files** — `src/components/identity/**` (typecheck `avatarPhotoId`, the `text-[9px]`
typography ratchet, knip types), `design-system/components/procedure/**` +
`UnboxProcedureChecklist` + `procedure-pointer.ts` (knip orphans), and a modified
`docs/security/route-permissions.json` (route-permission drift). Re-run in a clean
worktree of `HEAD` carrying **only** this lane's files: **Lint · Unit tests + DS
guards · Route-permission · Route-auth · Schema drift all green**; the reds that
survive there (`DashboardOrdersView` → `DashSelectableRow`, 8 knip orphans) are at
`HEAD` and touch no file this lane owns.

---

## 4. Do not build

- Candidate A / C / D / E
- Porting `ProcedureChecklist` to Pack
- Wiring this into Unbox or Testing
- Auto-advance, scan-follow, back/forward, `n of N`, anchored input (Phase 2)
- A second PDF viewer or ambient right-edge document region
- Raising knip / DS ratchet baselines

---

## 5. Commit scope (when the user asks)

Stage only these (plus this handoff once written):

```
src/lib/migrations/2026-08-01d_kit_part_reference_document.sql
src/lib/drizzle/schema.ts
src/lib/packing/kit-part-document.ts
src/lib/packing/kit-part-document.test.ts
src/lib/packing/order-pack-checklist.ts
src/lib/packing/packing-checks.ts
src/lib/packing/packing-checks.test.ts
src/lib/neon/sku-catalog-queries.ts
src/lib/schemas/kit-parts.ts
src/hooks/usePackingCheckPersist.ts
src/components/packing/OrderPackChecklist.tsx
src/components/packing/PackChecklistLineRow.tsx
src/components/products/KitPartsSection.tsx
src/app/api/orders/[id]/packing-checks/route.ts
src/app/api/sku-catalog/[id]/kit-parts/route.ts
tests/e2e/pack-kit-part-document.spec.ts
docs/todo/step-document-reveal-GEMINI-RESEARCH-BRIEFING.md
docs/todo/step-document-reveal-RULING.md
docs/todo/step-document-reveal-FINISH-HANDOFF.md
```

Suggested message focus: *Pack kit-part inserts: in-row disclosure + DocumentSlideOver, print vs acknowledgement evidence.*

Do **not** `git add -A` — other sessions own the rest of the tree.

---

## 6. How to smoke without waiting for e2e

1. Attach to `http://localhost:3050` (already running — never restart).
2. Products → pick a SKU → Kit parts → edit a part → set Insert URL to a public/org Blob PDF → save.
3. Pack an order that includes that SKU → expand the line → confirm strip under the part.
4. View → slide-over; Print → browser print + part ticks; untick/retick via checkbox → Confirm chip path.

If the strip never appears: confirm migration columns (`document_url` on `sku_kit_parts`) and that the part’s URL is non-blank after trim (`kitPartDocument()` treats whitespace as absence).

---

## 7. Phase 2 (explicitly later)

Only after Phase 1 is observed stable on a live pack bench:

- Auto-advance on confirm
- Current-step-follows-scan
- Back/forward between steps
- Multi-qty `n of N`
- Anchored input / scroll anchoring

Do not accelerate cadence while the list can still jump.