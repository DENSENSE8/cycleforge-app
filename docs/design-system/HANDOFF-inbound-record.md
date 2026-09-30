# HANDOFF — the inbound record: bring Unboxed + Deliveries up to the order record (written 2026-09-28)

> **Superseded 2026-09-29 (owner):** the two inbound records described below (`IncomingDeliveryEvidence` with
> `incoming-record-sections`, `CartonRecordView` with `carton-record-sections` / `carton-record-facts`,
> `ReceivingStatusStrip`, the strip verbs `incoming-record-verbs` / `carton-record-verbs`) are deleted.
> Every inbound desk record (On the way, pasted numbers, Docked, Unboxed) is now ONE view on the
> order record's foundation: `src/design-system/components/record-ledger/RecordView.tsx` (shape
> `record-model.ts`, slot `useRecordSlot.tsx`; inbound adapters `inbound-record-model.tsx`, header
> verbs `inbound-record-verbs.tsx`, reads `useInboundRecord.tsx`). Receiving group = orange current-status pill + `RecordFulfillmentSources
> flow="inbound"` (External `CarrierEventsRail` · Internal Docked → Unboxed → Graded → Tested →
> Received → Put away); serials inline on each item and in `RecordSerials`; verbs in the record
> header, secondary evidence as panel verbs — no inline disclosures. Read the sections below as history.

**Short way:** `remake /incoming?lane=docked&openLine=32624 like the order record` — the
`remake-in-style` skill (`.claude/skills/remake-in-style/SKILL.md`) runs the loop. This file is the
ground truth that run uses for the inbound records (verified on the working tree 2026-09-28; other
sessions edit concurrently — re-read before every edit).

Read first: `AGENTS.md` (dev origin `http://localhost:3050` only), `docs/design-system/HANDOFF-view-spec-layers.md`
(the six-layer order + Layer-laws gate), `docs/design-system/MODE-SPLIT-INVENTORY.md` (Layer census →
"Inbound history", Owner decisions 7–13).

## 1. What already landed (do not redo)

| Change | Where |
|---|---|
| Both inbound records are `RecordGroup` cards (no `border-mode-ink` hairlines); `CartonColumnHead` / `CARTON_COLUMN_CLASS` deleted | `receiving/history/CartonRecordView.tsx`, `carton-record-facts.tsx`, `carton-record-sections.tsx`, `receiving/incoming/IncomingDeliveryEvidence.tsx`, `incoming-record-sections.tsx` |
| Fulfilment group below the items on the shared `StepRail` (Delivered → Door scan → Staged → Unboxed → Contents → Graded → Tested → Labels printed → Received → Put away; deliveries: Ordered → … → Received) | `ReceivingFulfilment` + `receivingRailSteps` in `receiving/record/ReceivingStatusStrip.tsx`; steps from `deriveCartonSteps` / `deriveIncomingSteps` |
| Photos top of the right column, above Purchase | both records |
| Sentence case everywhere (owner decision 13) | tokens, `uppercase` utilities, painted caps copy |

Verified on :3050: `/incoming?lane=docked&openLine=32624` (Unboxed) and `/incoming?openLine=32675`
(deliveries) — deep links, never synthesized clicks. **Not yet proven:** the Floor face of either record
(`industrial:` variants of `RecordGroup` should hold — screenshot it).

## 2. The owner's asks, each with its verified root cause

| # | Ask | Today (evidence) | Root cause |
|---|---|---|---|
| A | PO note is its own section, **expanded**, no one-line preview | `carton-record-facts.tsx:126-134`: `EvidenceDisclosure` collapsed, `summary` = first line of `poNote`. Deliveries: `incoming-record-sections.tsx` Notes group prints `PO: {data.po_notes}` as a muted line under the line note | presentation picked disclosure for a fact the job needs at rest |
| B | Claim is per **purchase order / carton**, not per item | Carton: every `CartonItem` paints a `Claim` row (`carton-record-sections.tsx:174`) **and** the aside paints a `Claims` group (`carton-record-facts.tsx:113`) **and** an alert `Claim ticket #…` (`carton-record-status.ts:204`). Deliveries: `IncomingItem` `Claim` row (`incoming-record-sections.tsx:187`) + `Ticket` row in Shipment | the fact is carton-level — `receiving.zendesk_ticket`, mirrored onto each line row (`2026-06-24_receiving_exceptions.sql:34` "mirrors receiving.zendesk_ticket"). The owner map is `ticket_links` (migration `2026-06-01_ticket_links.sql`: one ticket → one primary entity, read via `src/lib/zendesk-links.ts#getTicketEntity`) — read the per-PO claim from there, not by deduping line rows. One fact painted three times at the wrong grain |
| C | Tracking number and carrier on **one row** | `TRK#` row + separate `Carrier` row (`carton-record-facts.tsx:86-93`; `incoming-record-sections.tsx:284-292`, where "Carrier" is actually the carrier *status*) | two rows for one identity; `TrackingIdentity` already accepts `carrierHint` |
| D | PO line note displayed **correctly** | `CartonItem` paints `zoho_notes` raw under "PO line note" (`carton-record-sections.tsx:179`) — on carton 53336 it is the serial dump `SNs: 0191…AC, 0341…BC · Used — A`, duplicating the Serials row and the condition | the Zoho line note is a machine-written trail, not prose; needs parsing (serials / condition split out, remainder as the note) or a quiet disclosure — decide against real rows (sample several cartons) |
| E | **One** badge per purchase order; no solid state badges | Solid `stateBadgeClass` badge in the status head (`ReceivingStatusStrip.tsx:64`) **and** on every item (`carton-record-sections.tsx:121`, `carton-item-state`) — "UNB · Unboxed" twice on a one-item carton | the order record already fixed this (`OrderRecordStatus`, `OrderRecordView.tsx` ~l.150: ONE status top-right of the record header, "item groups carry no state badge of their own") |
| F | A **triage** badge face (solid badges are the industrial language) | `.state-badge-<tone>` = solid `code` fill + `codeInk` in every mode (`packages/design-tokens/src/state.ts:53-76`); `LifecycleCode` (`record-ledger/LifecycleCode.tsx`) wears it, so outbound triage wears solid badges too. The triage card face already has the other language: dot + tone ink, no fill (`RecordCard.tsx` ~l.711, `id('state')`) | no mode-aware badge token — the badge is one CSS class for both looks |

**F is an owner decision before code** (it changes outbound too). Proposal to put to the owner: make
the badge mode-aware at the TOKEN (`stateCodeCssText`): industrial keeps the solid code chip; triage
paints the RecordCard face (tone dot + tone ink, sentence-case label, no fill), or a soft tint
(`STATE_TONE_CLASSES[tone].pill`). One token, both looks — never a second component. Record it as
MODE-SPLIT-INVENTORY → Owner decisions 14.

## 3. More patterns carried over from the outbound record (proposed — confirm each with the owner)

1. **Status in the record header, top-right** (as `OrderRecordStatus`): the state + where it goes next
   (`record.readiness?.nextStep` / `incomingDeliveryNextAction`). Delete the status head card; alerts
   become one notice at the top of the main column (as `DuplicateOrderBanner`), deduped against the
   sections that already say it (claim, unfound).
2. **One record title**: the carton record is titled `Carton 53336`, the delivery `PO …` — same entity
   family, two identities. Title = the purchase identity (PO / order #), subtitle = carton
   (`DockedReceiptsLedger.tsx:195,322`, `cartonRecordTitle`).
3. **F-pattern groups**: left = Items → Fulfilment → Notes (line note, PO note, carton note) → Timeline;
   right = Photos → Purchase → Shipment (tracking · carrier one row, delivered, last event) → Location →
   Claim → More actions. One `RecordGroup` each, ≤1 action top-right (Edit / Pair / File claim).
4. **Item card = identity only** (as `OrderItem`): photo 112px, title (listing link on hover), SKU, Qty
   received/expected, Condition, unit price; serials under a `+N` disclosure when > 3.
5. **Timeline** (`ReceivingAuditPanel`, carton record): verify after the sentence-case sweep — it painted
   `NOTE`, mono `09/25/2026 11:41:44 AM`, `line 32624`; make it the order Timeline grammar
   (`EventTimeline`: icon per event on the rail hairline, relative time, details behind "more").
6. **Empty faces** read as work, not shouting: `Not paired` + the Pair action in the Purchase group
   header; `Not attached` + Add tracking.
7. **View spec** (`src/lib/views/view-specs.ts`, pending owner decision 12 on the home): declare
   `receiving.unboxed` and `incoming.pipeline` record sections + verbs there instead of hard-wiring them;
   the `resolve`-style job section for unfound cartons is the pairing form.
8. **Inbound history "two systems"** (census): `DockedReceiptsLedger.tsx:141` swaps `HistoryCards` ⇄
   `RecordLedger` by layout; the triage face borrows `RecordLedgerSummaryPane` (industrial paint). Same
   job as To ship's card/ledger swap — list it, do not fix in this handoff.

## 4. Verification contract

- `pnpm verify:fast` — attribute every red per file (`git status` / `git diff --stat`), never fix another
  session's in-flight file.
- Unit: `node --import tsx --test src/lib/receiving/carton-record-status.test.ts` and any test for new pure
  logic (line-note parser, claim grain) — behaviour, not wording.
- :3050 screenshots, deep-linked, In place + Split + **Floor**, both records, a multi-item carton, a carton
  with a claim, one with a PO note, one unpaired.
- `pnpm test:e2e:order-record-qol` must stay 13/13 if the badge token (F) changes.

## 5. Known foreign reds at hand-off (not this work)

- `/shipping/orders` crashes: another session is renaming lifecycle stage `TESTED` → `PICKED`
  (`src/lib/order-lifecycle.ts`), `orders-next-step.ts` `NEXT_BY_STAGE` still keys `TESTED`
  (`nextStepForLifecycleStage` → `undefined.label`). Blocks the order-record e2e until its owner lands it.
- Lane log: `Module not found … order-composer/InboundOrderComposer` (deleted by the inbound order-composer
  session); Layer laws Law 5 hit in `order-composer/composer-choices.ts:54` (same session).
- Unit failures in SKU-identity title precedence (`history-export-csv`, `carton-hub`, `photo-move-targets`,
  `create-order`), AI failover, route permissions, nav, `KeyboardKey` rework — not casing.

## 6. Open follow-ups from the sentence-case sweep

- No gate yet: add a source-law rule banning the `uppercase` utility / `textTransform: 'uppercase'` in
  `src` (exceptions: `src/lib/print/**`, `bin-label-printer/**`) to `src/lib/views/layer-law.ts` so it
  cannot regrow.
- Stored data stays as stored (titles, buyer names, cities typed in caps) — owner confirmed scope is
  presentation; do not re-case data.

## Prompt

```
remake /incoming?lane=docked&openLine=32624 like the order record
```

Then the same for `/incoming?openLine=<id>` (the Deliveries record). The skill's checklist covers §2 A–E
and §3; §2 F (triage badge face) and §3 items 2–7 are owner questions — the skill asks before building.
