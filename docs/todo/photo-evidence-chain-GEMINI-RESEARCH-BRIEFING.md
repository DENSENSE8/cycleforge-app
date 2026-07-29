# Research briefing — inbound photo evidence: is our chain good enough to win a dispute?

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers, not excerpts; read the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-29
**Scope:** the **inbound photo evidence chain** — what gets photographed, when, what it links to, and whether a receive can be blocked for missing evidence. Not the photo *library* browse UX, not outbound/packing photos except where they close the loop.

**The question behind the brief is commercial, not aesthetic.** A used-goods reseller loses money three ways that photos are supposed to prevent: a supplier ships damaged/short and refuses the claim; a carrier denies a concealed-damage claim; a buyer files "not as described" and the marketplace sides with them. We have just finished building a staged evidence chain. **We do not know whether it clears the bar the actual claim processes set.** That is what we want you to tell us.

**Bias:** this brief prefers **deleting or tightening** over adding. If you propose a new column, table, or capture step, say what it buys in dispute outcomes and what it replaces. "More evidence is better" is not an answer — operator seconds per carton are the scarce resource.

**Deliverable:** four separate answers.

1. **The claim-process answer.** For each of: eBay INAD/SNAD, Amazon FBA inbound discrepancy + Amazon A-to-z, Walmart returns, UPS/FedEx/USPS concealed-damage claims, and supplier/vendor short-shipment disputes — what evidence do those processes *actually* require or reward in 2024–2026? Named, cited, primary sources. Specifically: which of them care about **capture timestamp provenance**, **unaltered originals**, **specific angles or sequences**, **packaging-before-opening**, or **retention windows**?
2. **The industry-practice answer.** What do 3PLs, returns processors, and ITAD/recommerce operators actually capture at inbound, and at what cost per unit? Where is the line between "enough to win" and "theatre"? Cite named systems and operators.
3. **The codebase answer.** Reconcile 1–2 against §3–§6 below. Where is our chain genuinely sufficient, where is it decorative, and what is the **deletion-ordered** path to sufficient? Verify against the code — §0.1.
4. **The gate answer.** §6 describes a hard 409 that blocks receiving when evidence is missing. Is a hard block correct at inbound, or is it the wrong control point? What do comparable operations do when the operator cannot comply (damaged goods still need receiving, the phone is dead, the shift is ending)?

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. This is not optional.

You have repo access. A prior brief in this series produced phases targeting files that do not exist. Do not repeat it.

- **Every file path you name must be one you opened.** Infer nothing from naming convention; mark any inference `[UNVERIFIED]`.
- **Quote the evidence** for load-bearing claims: a line number, a function signature, a schema column.
- **Do not attribute a rationale to this brief that is not written in it.** If it is your reasoning, say "my reasoning:".
- The measurements in §5 are ours and were taken on 2026-07-29 against the live dogfood tenant. **Re-derive them if you can**; if your numbers differ, say so.

### 0.2 Search the web for parts 1 and 2. Also not optional.

- Part 1 is a **claim-process** question. Answer it from marketplace/carrier policy documentation and seller-facing primary sources, not from memory. Marketplace evidence rules change; prefer 2024–2026 sources and say what changed.
- Where a policy is *unwritten but operationally real* (what actually wins an appeal vs what the published policy says), distinguish the two and label which is which.
- Distinguish **large-scale 3PL practice** from **small multi-tenant reseller SaaS**. This repo is the latter: one warehouse, a handful of operators, thousands of units — not a Ware2Go.

### 0.3 Established facts — do not re-litigate these

| Claim | Status |
|---|---|
| "You should link item photos to the SKU" | **No.** SKU strings collide across two independent numbering schemes (`items` vs `sku_catalog`). Item evidence links `RECEIVING_LINE` by id. See §4 identity law. |
| "Photos should carry `entity_type`/`entity_id` columns" | **Already migrated away.** Polymorphic links live in `photo_entity_links` (2026-06-18; old columns dropped 2026-06-21). |
| "Add a photo-type free-text field for operators" | **That was the bug.** A caption→`photo_type` conduit let arbitrary operator text become the evidence stamp. Closed 2026-07. |
| "Validate the stamp client-side" | Insufficient — validation is at the server write waist (§4). Client checks are a UX nicety only. |

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers; USAV is the dogfood tenant. Inventory is **serialized**: individual physical units with serials, condition grades, test verdicts, and photo evidence. Inbound arrives as cartons from vendor POs (mirrored from an inventory provider), marketplace returns, and local pickups.

Two house laws govern everything below and are non-negotiable:

- **Tenant-from-birth.** Every table carries `organization_id UUID NOT NULL`, org-led indexes, and `enforce_tenant_isolation()` in its birth migration (`.claude/rules/polymorphic-tables.md`).
- **Vendor integrations are capability facades**, never the product (`AGENTS.md` → Product).

---

## 2. The commercial problem, stated precisely

A dispute asks one question: **did the damage/shortage exist before we touched it, or did we cause it?**

Answering requires evidence that separates *arrival condition* from *post-opening condition* from *post-testing condition*. Until 2026-07 this system could not answer it: every inbound photo carried one undifferentiated stamp, so a photo taken at the unbox bench after the box was open was indistinguishable from a photo taken at the door. An operator could satisfy an "arrival photo" requirement with a picture taken twenty minutes and one box-cutter later.

That is now fixed in code (§3–§4). **What we cannot assess in-house is whether the resulting artifact is what a claims adjuster or marketplace appeals process actually wants.**

---

## 3. The evidence spine — read these

Five stages, inbound → outbound. SoT: **`src/lib/photos/stages.ts`**.

| Stage | Means | Entity it links |
|---|---|---|
| `arrival_package` | the box **as it arrived**, before opening | `RECEIVING` (carton) |
| `unbox_carton` | the opened box / packing state | `RECEIVING` (carton) |
| `unbox_item` | the individual item out of the box | `RECEIVING_LINE` |
| `testing` | test-bench condition | `SERIAL_UNIT` |
| `packing` | outbound pack state | `SERIAL_UNIT` / `PACKER_LOG` |

Read, in this order:

- `src/lib/photos/stages.ts` — the spine + the `(entity_type × photo_type)` write matrix.
- `src/lib/receiving/photo-intent.ts` — receiving-side stage vocabulary, list intents, and `receivingUploadStage()` (note its **default**: a stage-less capture from the unbox bench resolves to `unbox_carton`, *not* arrival — deliberately, so a late photo cannot satisfy the arrival gate).
- `src/lib/receiving/photo-scope.ts` — `effectiveReceivingPhotoStage()` / `resolveReceivingPhotoTarget()`: scope → write target, throwing on an incoherent scope.
- `src/lib/photos/service.ts` — the **write waist**: `uploadPhoto()` / `attachPhotoWithLegacyUrl()` both call `validatePhotoWrite()` before anything is stored.

---

## 4. What is enforced, and where

**The write waist is the enforcement point.** Illegal `(entity, photo_type)` pairs are rejected with HTTP 400 before any storage or DB write. Verified live 2026-07-29:

```
RECEIVING     + receiving_item     → 400  "not allowed on RECEIVING (allowed: receiving_package, receiving_unbox_carton, receiving)"
RECEIVING_LINE+ receiving_package  → 400  "not allowed on RECEIVING_LINE (allowed: receiving_item)"
RECEIVING     + receiving_unbox_carton → 200
RECEIVING_LINE+ receiving_item     → 200   (surfaces at library ?stage=unbox_item)
```

**Identity law.** Item evidence links `RECEIVING_LINE` **by id** — never by SKU string. `items` and `sku_catalog` are two independent SKU numbering schemes that collide; joining on the string produces wrong-item evidence, which in a dispute is worse than no evidence. See `.claude/rules/source-of-truth.md` → SKU identity.

**Polymorphic hub.** `photo_entity_links` (`photo_id`, `organization_id`, `entity_type`, `entity_id`, `link_role`), where `link_role ∈ primary | claim_evidence | insurance_share`. One photo can be both primary evidence and claim evidence without duplication.

**Storage.** Google Cloud Storage, org-prefixed paths, time-limited v4 signed URLs for read. Share packs mint durable tokenised pages (`src/lib/photos/share-links.ts`).

---

## 5. Measurements — ours, 2026-07-29, live dogfood tenant

These are the uncomfortable numbers. **Re-derive if you can.**

- **400 photos scanned across every scope: 100% `receiving_package`.** Zero `unbox_carton`, zero `unbox_item`, zero mis-stamped item-on-carton rows. The staged spine is real in code but the **existing corpus is single-stage** — every historical photo resolves to `arrival_package` regardless of when it was actually taken.
- Consequence: **the historical corpus cannot support a before/after argument at all.** Only captures taken after the camera rework (landed 2026-07-29) will carry a true stage.
- The per-item camera (`unbox_item`, line-scoped) **did not exist before 2026-07-29**. There was no way to photograph an individual item as a distinct evidence object.

**Question for you (part 3):** given a single-stage historical corpus, is a backfill worth attempting at all? A stamp inferred from timestamps/order-of-capture is a *guess presented as evidence*. Our instinct is that a guessed stage is worse than an honest `unknown` — confirm or correct, with reference to how inferred metadata is treated when evidence is challenged.

---

## 6. The gate — a hard 409 at receiving

Org setting `receiving.photoPolicy`, three exclusive tiers (`src/lib/settings/registry.ts`, evaluator `src/lib/receiving/photo-policy.ts`):

| Tier | Rule |
|---|---|
| `optional` | never blocks (default) |
| `require_one` | ≥1 **arrival package** photo on the carton. Unbox and item shots do **not** satisfy it. |
| `require_per_item` | every non-cancelled line has ≥1 item photo |

Enforced server-side in **both** receive routes (`src/app/api/receiving/mark-received-po/route.ts` desktop, `src/app/api/receiving/mark-received/route.ts` mobile), **before any mutation**. Verified live:

```
POST /api/receiving/mark-received → 409
{ "error": "PHOTO_POLICY", "blockers": ["1 line needs an item photo: QA-SHEET-SKU"] }
```

Design notes worth your judgement:

- The desktop route **releases its idempotency claim** on a policy block, so the same key can retry after the operator adds photos. A finalized claim would replay the 409 forever.
- `optional` runs **zero** extra photo queries — the default path is byte-identical to the ungated route.
- An already-received line **skips** the gate, so a replay or bounce-back cannot newly 409.

**Part 4 is about this.** A hard block at receiving is a strong control, and strong controls at the wrong point create workarounds (receive everything as one line; photograph the floor to clear the gate). We want to know what comparable operations do — and specifically whether the correct control point is receiving at all, versus *listing* or *shipping*, where the commercial exposure actually crystallises.

---

## 7. Known gaps — rule on these explicitly

Each is verified present (or absent) in code. For each: does it matter for dispute outcomes, and if so what is the minimum fix?

1. **No capture-time provenance.** The `photos` table (`src/lib/drizzle/schema.ts`, `pgTable('photos', …)`) carries `id, organization_id, taken_by_staff_id, photo_type, created_at, updated_at, deleted_from_blob_at, po_ref`. There is **no EXIF capture, no device identity, no client capture timestamp**. `created_at` is server-insert time, which for a queued mobile upload can be minutes-to-hours after the shutter. **Does any claim process actually check this, or is server-receipt time sufficient in practice?**
2. **Hard delete.** `src/lib/photos/service.ts` issues `DELETE FROM photos WHERE id = $1 AND organization_id = $2`. Evidence can be removed with no tombstone and no audit of the removal. **Is immutability/WORM expected at this scale, or is it disproportionate?**
3. **No tamper evidence.** No content hash, no signing, no write-once bucket policy. **Does a content hash meaningfully strengthen a marketplace appeal, or is it only relevant in litigation?**
4. **No retention policy.** Nothing expires; nothing is guaranteed to survive either. **What retention windows do the claim processes in part 1 actually require?**
5. **Stage is derived, not stored.** A row's evidence stage is computed in TypeScript from `(entity_type, photo_type)` via `stageFromPhotoType()` — there is no `stage` column. Cheap to change, and correct today. **Does anything about evidence integrity argue for materialising it?**
6. **Capture is not enforced as a sequence.** Nothing requires arrival-before-unbox ordering; an operator can shoot `unbox_item` on a carton that never got an arrival photo. **Do the claim processes reward a demonstrable sequence, or only the individual artifacts?**

---

## 8. Hard constraints — a proposal violating these is out of scope

- **Tenant-from-birth** on any new table; org-led indexes; `enforce_tenant_isolation()` in the birth migration.
- **One write waist.** New capture surfaces compose `resolveReceivingPhotoTarget()`; they do not hand-roll `(entity, photo_type)`.
- **No SKU-string joins for evidence identity** (§4).
- **No vendor product names in operator copy** — capability nouns or runtime provider labels only.
- **Operator seconds are the budget.** A proposal adding capture steps must say how many seconds per carton and what it removes.
- The stack is Next.js on Vercel, Postgres (Neon) with RLS, GCS for blobs. Proposals requiring new infrastructure must justify the operational cost for a single-warehouse tenant.

---

## 9. Deliverable format

Four sections matching the four questions, then:

**A. Sufficiency verdict.** For each of the five dispute types in part 1: does our current chain (as it will stand once the corpus has stage-stamped photos) win, lose, or depend — and on what.

**B. Deletion-ordered change list.** Highest dispute-value-per-operator-second first. Each item: the gap it closes, the claim process that rewards it, the files it touches (verified paths), and what it deletes or replaces.

**C. Explicitly not worth doing.** The things that look like evidence rigour but do not change outcomes at this scale. We expect this section to be substantial and we will act on it.

**D. Open questions you could not resolve** from public sources, with what evidence would settle each.
