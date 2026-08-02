# Research ruling — Carton look-up photo triage (Phase 0 gate)

**Session A output.** No `src/` was edited. Written 2026-08-01 against `main` at `9dd945010`.
**Parent prompt:** [`carton-photo-triage-CLAUDE-CODE-PROMPT.md`](./carton-photo-triage-CLAUDE-CODE-PROMPT.md) §4 Phase 0.
**Gate:** Session B does not start until a human accepts or amends the rulings below.

---

## 0. The one thing that changed the plan

The prompt's §1 IA assumes three classification signals exist. **Two of them have zero rows in
the dogfood tenant**, and the third is degenerate on 97% of cartons. Measured directly against
the database (read-only aggregates, 2026-08-01):

| Signal the prompt leans on | Rows | Verdict |
|---|---|---|
| `photos.photo_aspect` (drives "aspect-complete carrier minimum") | **0 of 3405** | Column + CHECK + validation shipped; **nothing writes one yet** |
| `photo_analysis.damage_detected` (drives "Damaged") | **0 rows in the whole table** | `PHOTOS_ANALYZE_ENABLED` unset → defaults `false` → `isAnalyzeOnUploadEnabled()` never enqueues |
| `photo_entity_links.link_role='claim_evidence'` | 1035 links / 152 cartons | Real data, but see §1 — degenerate as a tab axis |
| entity × `photo_type` (stage SoT) | **3405 of 3405 resolve** | The only fully-populated axis |

Receiving photo distribution (all 3405 are receiving-scoped):

| entity_type | photo_type | photos |
|---|---|---|
| `RECEIVING` | `receiving_package` | 2467 |
| `RECEIVING` | `receiving` (legacy alias) | 687 |
| `RECEIVING` | `receiving_unbox_carton` | 183 |
| `RECEIVING_LINE` | `receiving_item` | **68** |

Per-carton (538 cartons carry photos; median 7, max 23):

| Fact | Cartons |
|---|---|
| have arrival/package shots | 491 (91%) |
| have `unbox_carton` shots | 118 (22%) |
| have item shots | 68 (13%) — exactly one each |
| have **both** box and item shots | 67 (12%) |
| have ≥3 photos (a carrier 3-shot is physically possible) | 486 (90%) |

**Consequence:** the prompt's Phase 3 as literally specified ships two tabs and a sub-filter where
**four of the five buckets are structurally empty on almost every carton**. The rulings below keep
the operator vocabulary and the IA shape, and re-point each bucket at a signal that has data.

---

## 1. Ruling — the "Exact" rule

### Neither candidate in the prompt survives the data

**Candidate A — aspect-completeness.** 0 of 3405 photos carry an aspect. Exact would be empty on
**100%** of cartons. Dead on arrival, and it would stay dead until capture surfaces start writing
aspects (a Plan 2 job, not this ticket).

**Candidate B — `link_role = 'claim_evidence'`.** Real data, but measured as a *partition* it is
degenerate:

| Carton class | Count | What the operator would see |
|---|---|---|
| No claim evidence | 386 (72%) | **Exact tab empty**, Investigative holds everything |
| Claim evidence on **every** photo | 136 (25%) | **Exact ≡ Investigative** — two tabs, identical lists |
| A genuine split | **16 (3%)** | The feature works |

`linkReceivingPhotoToClaim` dual-links *every* photo uploaded after a claim is filed, which is why
89% of claimed cartons have a 100% claim-evidence set. A tab pair that is degenerate on 522 of 538
cartons is not a feature; it is chrome that lies about having sorted something.

### RULED — keep the vocabulary, re-point it at SCOPE

> **Exact = this carton's own staged evidence.** Every photo primary-linked to this `RECEIVING`
> or one of its `RECEIVING_LINE`s whose (entity × photo_type) resolves to a stage via
> `stageFromPhotoType`. This is exactly what `GET /api/receiving-photos?receivingId=N` returns
> today. **100% populated on every carton with photos → it is the default tab.**
>
> **Investigative = the wider trail beyond this carton's own capture.** In slice 3 that means
> (a) photos carrying a secondary `claim_evidence` / `insurance_share` link, and (b) rows whose
> stage does **not** resolve (mis-stamped `receiving_item`-on-`RECEIVING`, custom types).
> Cross-station journey media (testing / packing on serials born from this carton) is the
> **named next increment**, deliberately deferred — see §7.

Why this is the right call and not a dodge:

- It is **the prompt's own definition of Investigative**, read literally: *"Full carton evidence
  trail … optional testing/packing via journey"*. That is a scope statement, not a quality statement.
  Exact is the mirror of it.
- The default tab is **never empty**, on any carton, ever. The secondary tab is empty on cartons
  that genuinely have no wider trail — which is honest absence, not a broken bucket.
- It needs **no new signal**. Both sides derive from data that is 100% present today.
- It leaves the claim-readiness idea intact as a *checklist inside Exact* (§1.1), which is where
  the prompt actually wanted it.

### 1.1 Claim readiness — a chip and a checklist, not a tab

`claim_evidence` still earns a place, sized to its data:

- **Chip, conditional.** A `Claim evidence · N` filter chip on the Exact sub-filter row, rendered
  **only when the carton has ≥1 claim-linked photo** (152 cartons). Absent, never disabled —
  same law as hollow nav rows.
- **Checklist, honest about the gap.** The claim-readiness checklist (`shipping_label` ·
  `box_exterior` · item) reads `ASPECTS_BY_STAGE` + present aspects. With 0 aspects written it must
  render **"not classified"**, never "missing" — `photo-aspects.ts` rule 2 is explicit that NULL
  means *unclassified evidence*, never *missing evidence*. A checklist that shows three red
  crosses on a carton with 12 good photos is the single worst outcome available here.

**Forward rule, documented now so slice 3 builds toward it:** when aspect coverage becomes real,
Exact grows a *sub-state* — `claim-ready` = has `shipping_label` + `box_exterior` at
`arrival_package`/`unbox_carton`, plus ≥1 `unbox_item`. That is the carrier 3-shot (§2). It becomes
a badge on the Exact tab, **not** a fourth bucket.

---

## 2. Industry contract — confirmed, with one correction

The prompt's carrier table is accurate. The three-shot minimum (exterior damage · item + internal
packaging · shipping-label close-up) maps cleanly onto the house SoT with **no new vocabulary**:

| Carrier shot | House SoT |
|---|---|
| Exterior package showing damage | stage `arrival_package` ∨ `unbox_carton`, aspect `box_exterior` |
| Damaged item + internal packaging | stage `unbox_item` (any aspect) + aspect `packing_material` |
| Shipping-label close-up | aspect `shipping_label` |

**Correction to the prompt:** it lists "Damaged" as a peer of Box and Item. In carrier SOP damage is
not a *shot category* — it is a **property of the box shot and the item shot**. UPS asks for the
exterior *showing damage*, not for a separate damage photo. That is why `PHOTO_ASPECTS` has no
`damage` member and why the right home for it is a flag over the existing buckets, not a third
bucket beside them. This is the same conclusion §3 reaches from the data side.

---

## 3. Ruling — the "Damaged" rule

> **Do not ship a Damaged bucket in this slice.** Ship `All | Box | Item` (+ the conditional
> claim chip). Damage returns when it has a writer.

Evidence:

| Candidate | Finding |
|---|---|
| `photo_analysis.damage_detected` | **`photo_analysis` has 0 rows.** `service.ts:275` only enqueues an analyze job when `isAnalyzeOnUploadEnabled()`, which reads `PHOTOS_ANALYZE_ENABLED` (`analyze.ts:23`, default `'false'`) — and it is unset. The legacy `POST /api/receiving-photos` attach path (`attachPhotoWithLegacyUrl`) does not enqueue at all. **API join cost for a permanently-null column: one correlated scalar subquery on `photo_analysis` per row (the shape `library.ts:773` uses). Not worth paying.** |
| `link_role` | `PHOTO_LINK_ROLES` is a closed set — `primary` · `claim_evidence` · `insurance_share`. There is no damage member, and `claim-link.ts` bans free-text roles. |
| Item-stage-only UI label | A label that means nothing (every item photo would be "damaged") is worse than no label. |

**Hard never, restated with its cost:** do **not** add `photo_type = 'receiving_damaged'`. It is the
key of the `WRITE_MATRIX` (`stages.ts:67`), of the `require_one` policy gate, and of
`photo_image_types.key`. Adding one value silently changes what every existing filter, gallery and
receive gate counts — this is the exact reasoning already written into `photo-aspects.ts`'s "Why this
is not a photo_type" docblock, and it applies unchanged.

**The three futures, each with an owner** (pick one when the product wants damage; none is this ticket):

1. **A `damage` aspect** on `unbox_carton` + `unbox_item` in `ASPECTS_BY_STAGE` + a capture step that
   writes it. Cheapest, orthogonal, matches §2. Owner: WS-PHOTO Plan 2.
2. **Turn analysis on** (`PHOTOS_ANALYZE_ENABLED` + per-org switch) and backfill. Owner: ops/infra.
3. **Nothing** — accept that damage is read off the photo by the human looking at it, which is what
   happens today.

---

## 4. Ruling — placement

> **Main-column, in-flow, URL-durable. Not a `RightRailHost` occupant.**
>
> A full-width band mounted **directly under `DispositionBar`, above the two-column body**,
> toggled by the DispositionBar CTA and addressed by a URL param (`?photos=1`).

Four reasons, strongest first:

1. **There is no picked row here — the record IS the page.** The right rail's grammar is
   *"pick a row from a collection, inspect it beside the collection"* (`display/right-rail-inspector.md`).
   `/carton/[id]` has no collection and no prev/next walk. Putting this carton's photos in a rail
   beside this carton's page makes the page describe itself in two places, and the rail's mandatory
   dense-identity header would restate the DispositionBar title verbatim.
2. **The push ladder has only one live rung on this route.** `resolveRightRailFrame`'s sole real
   donor is the context rail (`frame.ts` — the spine measures 0 on every route). `/carton/[id]`
   mounts `CartonInspector` full-width with **no `ContextPanelLayout`**, so `railCostOpenPx = 0`,
   rung 0 and rung 1 are identical, and the decision collapses to *fits or overlays* against
   `RIGHT_RAIL_PUSH_MIN_FRAME_PX = 1160` (784 + 16 + 360). It would push at 1440 — but it buys a
   push mechanism that has nothing to push against, for a surface whose own rule already says
   full width.
3. **Column 2 is already the photo column.** `carton-read.md`'s anatomy puts photos at the top of
   col 2, above the pipeline. Swapping in place keeps the operator's spatial model.
4. **Correlation is the job.** An investigative read means looking at a photo *and* the line it
   belongs to. A band under the header keeps Contents visible; a full-body swap hides it, and a
   rail covers the right column the photos came from.

Mechanics:

- **URL-durable.** `/carton/[id]` exists to be a shareable read record (`searchHitHref` points every
  search hit here). A photo view you cannot link to is a miss. `?photos=1` — and, once §1's tabs
  land, `?photoView=exact|investigative`.
- **Motion:** `framerPresence.collapseHeight` + `framerTransition` — the sanctioned low-frequency
  expand/collapse layout animation, fired by an explicit operator toggle. Not a per-selection swap.
- **CTA position:** primary **before** the quiet utility cluster, per the prompt's own preference.
  `Photos · N` with count from the shared hook; a loading CTA shows the label without a count
  rather than a `0` that later jumps.

---

## 5. Ruling — API delta

### 5.1 `photo_type AS caption` is **not a bug**. Do not rename it.

The prompt lists this as item 5 ("confirm the bug and the fix shape"). It is a **deliberate,
documented, load-bearing alias**, and renaming it breaks the receive gate.

`useReceivingPhotoCount.ts:11–19` says so in as many words:

> *The STAGE, not display text. `listReceivingPhotos` selects `p.photo_type AS caption` … which is
> why the server's receive gate reads exactly the same field (`photo-policy.ts:138`). The POST
> handler's "caption is display text, never photo_type" note is about the WRITE direction.*
> **Do not "fix" this to a display caption.**

Confirmed by schema: **`photos` has no `caption` column at all** — `id · taken_by_staff_id ·
photo_type · created_at · updated_at · deleted_from_blob_at · organization_id · po_ref ·
client_captured_at · photo_aspect`. So on the read path `caption` is *always* the photo_type, and the
POST body's `caption` is accepted and **silently dropped** (`route.ts:232` reads it, echoes it in the
response, and never persists it).

**Consumers that read `caption` as the stage** — all break on a rename:

| File | Line |
|---|---|
| `src/lib/receiving/photo-policy.ts` | 138 — `deriveReceivingPhotoStageCounts`, the receive-gate twin |
| `src/hooks/useReceivingPhotoCount.ts` | 176 — `useReceivingPhotoStageCounts` |
| `src/components/receiving/workspace/claim/hooks/useClaimPhotos.ts` | 32 — `photoType: p.caption` |
| `src/components/receiving/workspace/line-edit/hooks/useUnboxLineController.ts` | 624 |
| `src/app/api/packing-photos/route.ts` | 43 — same alias, packer list |

**Fix shape (additive, two steps, second step optional this slice):**

1. Add a real `photoType` field to `ReceivingPhotoListRow` + the route row. Keep `caption` emitting
   the same value.
2. Migrate the five consumers above to `photoType`, then make `caption` emit `null` (there is no
   caption to emit) or drop it. **Do not do step 2 in the same commit as step 1** — it is a
   five-file behaviour change touching the receive gate.

**Two genuine display bugs found alongside it** (small, worth their own commit):

- `photo-gallery-utils.ts:84` puts `row.caption` into `PhotoMeta.caption`, and
  `PhotoContextPanel.tsx:300` renders it as caption prose — so the viewer's info panel currently
  shows the literal string `receiving_package` where a human caption belongs.
- `ReceivingPhotoPeek.tsx:113` uses it as `alt` text — a screen reader reads "receiving_package".

Both should render `photoStageLabel(stage)` ("Arrival · package") instead, or nothing.

### 5.2 `linkRole` cannot be selected from the join. It must be an `EXISTS`.

**This is the trap in the prompt's Phase 1.3.** `receiving-list.ts`'s `LINK_JOINS` pins `l` to
`entity_type IN ('RECEIVING','RECEIVING_LINE')` — and `claim_evidence` never lives on that row. It
lives on a **second** `photo_entity_links` row with `entity_type = 'ZENDESK_TICKET'`
(`claim-link.ts:93–99`). Selecting `l.link_role` would return the constant `'primary'` for every row:
a field that looks answered and is not.

Correct shape (the one `library.ts:698–705` already uses):

```sql
EXISTS (SELECT 1 FROM photo_entity_links z
         WHERE z.photo_id = p.id AND z.link_role = 'claim_evidence') AS has_claim_evidence
```

### 5.3 The delta table

| Field | Ship? | Source | Cost |
|---|---|---|---|
| `photoType` | **Yes** | `p.photo_type` (real name beside `caption`) | 0 — already selected |
| `entityType` | **Already returned** | `l.entity_type` → mapper collapses it to `receivingLineId` | 0 |
| `hasClaimEvidence` | **Yes** | `EXISTS` on `photo_entity_links(photo_id, link_role)` | 1 correlated EXISTS/row; ≤23 rows/carton |
| `hasInsuranceShare` | **Yes, same shape** | same | 1 EXISTS/row |
| `linkRole` (scalar) | **No** | — | Would be a constant `'primary'`. Actively misleading |
| `damageDetected` | **No** | `photo_analysis` scalar subquery | Permanently `null` (§3) |
| `takenByStaffName` | Optional | subquery on `staff`, as `library.ts:768` | Lights the viewer meta panel; nice-to-have |
| `?linkRole=` query filter | **No** | — | 7 photos median, 23 max. Client-side bucketing is correct at this size; a server round-trip per tab switch is worse UX and a second filter vocabulary to keep in sync |

`entityType` deserves one note: the route mapper (`route.ts:88`) already derives
`receivingLineId = isLine ? entityId : null`, which is a **complete** Box/Item discriminator by the
identity law. Slice 3 can bucket Box vs Item from `receivingLineId` + `photoType` alone with **zero
API change**. The additive fields above are for the claim chip and for honest stage labels.

### 5.4 Route notes

- `GET` is `permission: 'receiving.view'` — correct for a read look-up; no change.
- `?photoIntent=` already accepts `package | unbox_carton | item | carton | all` server-side. It
  exists if server-side bucketing is ever wanted; **not needed** at these row counts.
- `?photoAspects=` already parses through the SoT and correctly narrows-to-nothing on an unknown
  token. No change.

---

## 6. Ruling — compose plan

> **New `CartonPhotoTriage` under `src/components/receiving/inspector/inspection/`.
> Do NOT grow `ClaimPhotoPicker`.**

`ClaimPhotoPicker` is a **different job**: multi-select attach-to-Zendesk with a send-to-phone
capture trigger, a selection store (`useClaimPhotos`), and write side effects. Sharing its shell
would drag selection semantics onto a read surface the guard exists to keep read-only. Per
`pattern-evolution.md`, different job ⇒ **new sibling composing the shared primitives**, which is
growth, not a fork.

Shared underneath (all already exist — nothing new to promote):

| Concern | Compose |
|---|---|
| Tile | `PhotoThumb` + `photoGridLeafClass` (`photo-grid-density.ts`) |
| Drill-in | `usePhotoGallery` + `PhotoViewerPortal` — same as `ClaimPhotoPicker:271` |
| Tabs | `SectionTabsSlider` (**note: `icon` is a required field on every `SectionTab`**) |
| Bucketing | `stageFromPhotoType` / `receivingStageFromPhotoType` / `photoStageLabel` / `photoAspectLabel` — pure helpers in `src/lib/photos/` or `src/lib/receiving/`, **never JSX conditionals** |

### 6.1 The hook extraction is bigger than it looks — three implementations already exist

Phase 1.4 says "extract `useReceivingPhotos`". There are already **three** independent queries
against `/api/receiving-photos`, on **three different cache keys**:

| Implementation | Key | Consumers |
|---|---|---|
| `ReceivingPhotosSection` inline `useQuery` | `['receiving-photos', receivingId]` — **`receivingId` is a `string`** | carton read, ReceivingProgressTab, shipping panel |
| `useScopedReceivingPhotos` | `receivingPhotosQueryKey(scope)` = `['receiving-photos', id, lineKey]` | mobile photo studio, carton strip, prior-photo bubble |
| `useReceivingPhotosQuery` (private, in `useReceivingPhotoCount.ts`) | `receivingPhotosQueryKey(id)` = `['receiving-photos', id]` — **`id` is a `number`** | camera badge, progress stepper, capture stack |

**There are two different exported functions named `receivingPhotosQueryKey`** with incompatible
shapes — `@/lib/queries/receiving-queries:1000` (number, 2 elements) and
`@/hooks/useScopedReceivingPhotos:29` (3 elements). And `CartonInspectionPage:503` passes
`String(receiving.id)`, so the section's cache entry is `['receiving-photos', "1234"]` while the
count hook's is `['receiving-photos', 1234]` — **different cache entries for the same data**, and
`invalidateReceivingPhotoCaches`'s `setQueryData` (number key) does not reach the section's copy.

**Ruling — scope the unification, don't chase it:**

- Extract `useReceivingPhotos(receivingId: number, opts)` beside `ReceivingPhotosSection`, keyed via
  the existing `receivingPhotosQueryKey` from `@/lib/queries/receiving-queries` (**number**).
- Refactor `ReceivingPhotosSection` to consume it — otherwise the extraction *is* a fourth fork.
  This also fixes the string/number key split for free.
- **Leave `useScopedReceivingPhotos` alone.** Its 3-element key encodes a genuinely different
  question (PO vs line vs all scope) and it owns a delete path. Merging it is a separate ticket.
- Preserve exactly: the `readOnly ? throw : return []` error semantics, the `refetchInterval:
  readOnly ? false : 30_000` poll, and `useReceivingPhotosRealtimeRefresh` gated on `!readOnly`.
  Those three are load-bearing (`empty ≠ fetch error` is a pinned guard).

### 6.2 `{ url }` → `{ url, meta }` is safe. Do not add `id`.

Verified in `usePhotoGallery`: delete is gated on `photo.id` (`canDeleteCurrent`, line 442) and
**upload is gated on the `receivingId` prop, not on the photos** (`effectiveUploadTarget`, line 498)
— which the readOnly branch already omits. So:

- Adding `meta` arms **nothing**. It only lights `PhotoContextPanel`.
- Adding `id` would arm delete. **Keep omitting it**, exactly as today.
- `allowReassign` stays off (guard-pinned).

Compose `receivingPhotoMeta(row, { poRef })` — already the single place receiving meta is built, with
`poRef` a *required* argument by design. Do not hand-build a `PhotoMeta` literal.

---

## 7. Out of scope — stays where it is

| Cut | Owner |
|---|---|
| Enforcing `receiving.photoPolicy` on mark-received | WS-PHOTO Plan 5 (`photo-policy.ts` is built and evaluated client+server; the *gate wiring* is not this ticket) |
| Any capture surface that writes a `damage` aspect | WS-PHOTO Plan 2 |
| Turning on `PHOTOS_ANALYZE_ENABLED` / backfilling `photo_analysis` | ops/infra |
| Backfilling `photo_aspect` on 3405 existing rows | Not proposed by anyone — aspects are a forward claim, and back-stamping one would be inventing evidence |
| Cross-station journey media in Investigative (testing/packing on serials born from this carton) | **Named next increment.** `CartonUnitJourneyHistory` + `listUnitTimelinePhotos` already exist; wiring them is a slice of its own |
| Library folder IA / serial journey media | WS-PHOTO Plans 3–4 |
| Mobile swipe gallery redesign | — |
| Unbox station capture chrome | — |
| Merging `useScopedReceivingPhotos` into the new hook | §6.1 — separate ticket |
| Renaming `caption` → `photoType` at the five stage consumers | §5.1 step 2 — separate commit |

---

## 8. Blast radius

### Guards that will fire

| Guard | What it pins | Action |
|---|---|---|
| `carton-inspector.guard.test.ts` | **Requires** `ReceivingPhotosSection` **and** `readOnly` in the tree (3 assertions across 2 tests); bans `EvidenceStage`, `role="dialog"`, `allowReassign`, `"View Receiving Photos"`, `useMutation` / `method: 'POST'\|'PATCH'\|'PUT'\|'DELETE'`, `max-w-*` caps, `new Date(` | **Intentional rewrite required** if the triage panel replaces the section on this surface. The guard's own docblock says *"Intent pins (not frozen UI names)"* — so re-point the assertion at the shared **hook + `PhotoViewerPortal`**, and keep every ban verbatim. Never delete a ban. |
| — same file | Collects **every** `.tsx` under `src/components/receiving/inspector/` recursively | A new `CartonPhotoTriage.tsx` placed there inherits all bans automatically. Good — put it there. |
| `photo-aspect-vocabulary.guard.test.ts` | `PHOTO_ASPECTS` union ≡ the DB CHECK list | Fires only if someone adds a `damage` aspect. §3 says don't. |
| `stages.test.ts` / `photo-stage-default.guard.test.ts` | write matrix + stage defaults | Fires if `photo_type` gains a value. §3 says don't. |
| `receiving-list.test.ts` | The `sql*PhotoCount` fragments (not the SELECT list) | Adding SELECT columns does **not** trip it. Add a test for the new fields. |
| `spacing` / `focus-ring` / `control-size` / `surface-box` / `typography` ratchets | DS baselines | New UI must compose `Panel`, `IconButton size`, `focusRing`, `text-role-*`, spacing intents. **Never raise a baseline.** |
| `knip` (in `npm run verify`) | dead code | Extracting a hook is fine *if consumed*. If step 2 of §5.1 drops `caption`, its now-unused types get flagged. |

### Files in the touch path

| Area | Path |
|---|---|
| Query | `src/lib/photos/queries/receiving-list.ts` (+ `.test.ts`) |
| Route | `src/app/api/receiving-photos/route.ts` |
| Hook (new) | beside `src/components/station/receiving/ReceivingPhotosSection.tsx` |
| Section (refactor to consume hook) | `src/components/station/receiving/ReceivingPhotosSection.tsx` |
| Triage (new) | `src/components/receiving/inspector/inspection/CartonPhotoTriage.tsx` |
| Bucket helpers (new, pure) | `src/lib/photos/` or `src/lib/receiving/` |
| Page + CTA | `src/components/receiving/inspector/inspection/CartonInspectionPage.tsx` |
| Guard | `src/components/receiving/inspector/carton-inspector.guard.test.ts` |

### Explicitly NOT touched

`ClaimPhotoPicker.tsx` · `PhotoGallery.tsx` · `usePhotoGallery.ts` · `PhotoViewerPortal.tsx` ·
`useScopedReceivingPhotos.ts` · `photo-policy.ts` · the WRITE_MATRIX · `PHOTO_ASPECTS` ·
`PHOTO_LINK_ROLES`.

---

## 9. Acceptance checklist for Session B

Amended from the prompt's §6 to match the rulings above. Changed lines are marked **(amended)**.

- [ ] This ruling accepted or amended by a human before any `src/` edit
- [ ] `photoType` exposed as a real field on the receiving-photos row; **`caption` left emitting the same value** *(amended — §5.1)*
- [ ] `hasClaimEvidence` / `hasInsuranceShare` exposed via `EXISTS` subqueries, **not `l.link_role`** *(amended — §5.2)*
- [ ] `damageDetected` **not** added; no new `photo_type`, no new aspect *(amended — §3)*
- [ ] `useReceivingPhotos` extracted **and `ReceivingPhotosSection` refactored onto it**, on the number-keyed `receivingPhotosQueryKey` *(amended — §6.1)*
- [ ] `readOnly` semantics preserved verbatim: throw-on-error, no poll, no realtime
- [ ] DispositionBar shows a primary `Photos · N` CTA before the quiet utility cluster
- [ ] Triage opens **in-flow under the DispositionBar, full-width, URL-durable**; not a right-rail occupant *(amended — §4)*
- [ ] Tabs are **Exact (default, carton's own staged evidence) | Investigative (wider trail)** *(amended — §1)*
- [ ] Exact drills **`All | Box | Item`**, from `receivingLineId` + stage SoT; **no Damaged bucket** *(amended — §1, §3)*
- [ ] `Claim evidence · N` chip renders **only when the carton has claim-linked photos** *(amended — §1.1)*
- [ ] Claim-readiness checklist reads aspects and renders **"not classified"**, never "missing" *(amended — §1.1)*
- [ ] Mid-rail `ReceivingPhotosSection` is no longer the primary entry on carton read
- [ ] Tile → shared `PhotoViewerPortal` only; gallery input is `{ url, meta }` — **still no `id`**
- [ ] Read look-up still cannot upload / delete / reassign (verify `canUpload === false`, `canDeleteCurrent === false`)
- [ ] Bucket logic is pure helpers with unit tests, not JSX conditionals
- [ ] Exact-empty ≠ Investigative-empty ≠ fetch-error — three distinct states
- [ ] Viewer info panel no longer renders `receiving_package` as caption prose *(added — §5.1)*
- [ ] `carton-inspector.guard.test.ts` re-pointed at the hook + viewer SoT with **every existing ban kept**
- [ ] `npm run verify` green; no ratchet baseline raised
- [ ] Manual check on `:3050` — use a carton with both box and item photos (67 exist) and one with a claim (152 exist)

---

## 9b. What shipped (2026-08-01, same day)

The gate was released to "implement the highest-ROI parts that populate". Every
ruling above was implemented as written; three things were **learned during the
build** and are recorded here because they change the map:

| Built | Where |
|---|---|
| `photoType` + `hasClaimEvidence` / `hasInsuranceShare` (EXISTS) on the list row | `photos/queries/receiving-list.ts`, `api/receiving-photos/route.ts` |
| `useReceivingPhotos` — the shared carton query, number-keyed | `hooks/useReceivingPhotos.ts` |
| `buildCartonPhotoTriage` — lanes, buckets, readiness (19 unit tests) | `lib/receiving/carton-photo-triage.ts` |
| `CartonPhotoTriage` — Exact \| Investigative, `All/Box/Item` + conditional claim chip | `receiving/inspector/inspection/CartonPhotoTriage.tsx` |
| DispositionBar `Photos · N` primary CTA + in-flow band, `?photos=1` | `CartonInspectionPage.tsx` |
| `PhotoMeta.stage` + a **Stage** field in the viewer panel | `photo-gallery-utils.ts`, `PhotoContextPanel.tsx` |
| Guard re-pointed at hook + viewer; 4 new tests incl. a no-delete/no-upload pin | `carton-inspector.guard.test.ts` |

**Learned 1 — there was a FOURTH fork, on the same page.** §6.1 listed three
implementations against `/api/receiving-photos`. The rewritten guard immediately
caught a fourth: `CartonUnitJourneyHistory.tsx` held its own `useQuery` on
`['receiving-photos', String(id)]`, so `/carton/[id]` fetched the endpoint
**twice** per open and the two copies could disagree after a delete. Migrated.

**Learned 2 — `?photos=1` would not have survived without a route spec.**
`param-ownership.guard.test.ts` blocked it: `components/receiving` is a governed
tree, and an undeclared param is **dropped at the boundary parse** — the URL
durability this ruling argued for would have silently not worked. `/carton` now
declares its own spec (`carries: []`, since a read record is somewhere you
arrive, not somewhere you carry selection into).

**Learned 3 — the `caption` display bug was worse than §5.1 said.** It was not
only prose in the viewer's Caption field; `ReceivingPhotoPeek` used it as `alt`
text, so a screen reader read "receiving_package". Both now resolve through
`photoStageLabel`, and `PhotoMeta` grew a real `stage` slot rather than
overloading `caption`.

**Verified in the real runner** (Playwright against `:3050`, not the preview
pane): 6 assertions on the QA org (`qa-desktop`, carton 50377 — CTA, URL
durability across reload, Box+Item partitioning All, "not classified" readiness,
no upload/delete/reassign affordance, viewer Stage field) and 1 dogfood-only
probe (carton 50354 — claim chip + populated Investigative), which is the
documented exception because **the QA org has zero `claim_evidence` links**.
Screenshots confirmed the settled state; the mid-slide tab indicator and
un-decoded thumbs in the first capture were transients, not defects.

**Deliberately still not built** (unchanged from §3 / §7): no Damaged bucket, no
`damageDetected` field, no new `photo_type`, no aspect backfill, no Plan 5 gate
wiring, no journey media in Investigative.

---

## 10. Compound opportunities

- **Do now (in scope, low blast radius):** the two `caption` display bugs (§5.1); the
  string-vs-number cache-key split in `ReceivingPhotosSection` (fixed for free by §6.1).
- **Promote to DS next (2+ call sites):** a shared read-only photo tile grid — `CartonPhotoTriage`
  and `ClaimPhotoPicker` would be the two consumers, but only *after* triage ships and the real
  shared shape is visible. Do not pre-abstract it.
- **Deferred (ask first):** unifying the three `/api/receiving-photos` query implementations and the
  two `receivingPhotosQueryKey` functions; migrating the five stage consumers off `caption`;
  Investigative's journey-media increment.

---

## End of ruling — Session A stops here
