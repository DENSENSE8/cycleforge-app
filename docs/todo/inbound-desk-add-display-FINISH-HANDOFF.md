# Handoff — Finish Add Inbound display + connector-backed intake

**For:** next coding agent (paste § Prompt)  
**Date:** 2026-08-08 · **Lane:** current checkout — stay on branch; attach to `:3050` (never start/restart/kill). User owns commits.  
**Status:** Core desk + box-station Add rail **landed in working tree** (flush UI, classify comboboxes, CSV, filters, right-edge exclusion). Finish = dogfood polish, connector-aware Import/Add, Zoho / eBay / Amazon / Goodwill intake paths that fix **unfound** cartons without inventing a second Incoming engine.  
**Product frame:** Cycle Forge multi-tenant ops SaaS — capability nouns in operator copy; vendor product names only on Integrations hub / deep links ([`AGENTS.md`](../../AGENTS.md)). USAV is dogfood only.  
**Companion docs (read, do not re-litigate):**  
[`docs/integrations/zoho.md`](../integrations/zoho.md) · [`docs/integrations/ebay-connect.md`](../integrations/ebay-connect.md) · [`docs/incoming-universal-purchase-orders-plan.md`](../incoming-universal-purchase-orders-plan.md) (if present) · [`.claude/rules/polymorphic-tables.md`](../../.claude/rules/polymorphic-tables.md) · Incoming chrome history [`incoming-chrome-display-HANDOFF.md`](./incoming-chrome-display-HANDOFF.md).

**Out of scope (locked unless product reopens):**  
`/triage` redesign · Arrival/Unbox match algorithms · Amazon SP-API net-new sync product · RMA disposition machine · Band-1 entity tabs (Returns | POs) · Testing / Pack Add chrome · raising DS/knip baselines.

**Binding rules:**  
[`AGENTS.md`](../../AGENTS.md) · [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → *Right-rail modality · Optimistic URL-param paint · Unboxed ≠ Received · Scan-station centre* · [`display/right-rail-inspector.md`](../../.claude/rules/display/right-rail-inspector.md) · [`pattern-evolution.md`](../../.claude/rules/pattern-evolution.md) · [`backend-patterns.md`](../../.claude/rules/backend-patterns.md).

---

## Prompt (paste into a new agent session)

```text
Finish Add Inbound display + connector-backed intake.
Read docs/todo/inbound-desk-add-display-FINISH-HANDOFF.md end-to-end, then execute § Finish checklist.
Do not invent a second Incoming spine or a page-local twin of ingestPurchase / SearchableSelectField / ReceivingBoxChromeActions.

## Mission

Operators must land purchase orders and returns onto the Incoming spine when marketplace APIs are absent or incomplete — especially Amazon returns and Goodwill CSV — so Arrival / Unbox can find cartons instead of parking them Unfound.

Working tree already has:
1. Flush Add inbound right-rail (Platform · Type · Priority SearchableSelectField + fields + Macro floor Add + →|).
2. CSV Import rail under Import → Upload CSV (amazon|goodwill|ebay → ingest + source_platform stamp).
3. Incoming desk chrome Check · Import · Add; Band-3 Source + Kind filters.
4. Box stations (Arrival + Unbox only): Check · Add · resume via ReceivingBoxChromeActions.
5. Right-edge mutual exclusion: Add ↔ Station Displays ↔ details ↔ AI (one push column).

Finish means:
A. Dogfood + polish the Add/CSV rails (keyboard, flush card plane, no stacked right panels).
B. Wire Import/Add to real org CONNECTIONS (Zoho Inventory vault, eBay buyer Universal Incoming, Amazon when connected) — capability-aware CTAs, not hardcoded vendor sentences outside Integrations.
C. Close the unfound gap: manual/CSV rows must appear on Pipeline with correct source paint, kind, tracking/listing, and be matchable at Arrival/Unbox.
D. npm run verify green for files this lane owns; do not raise ratchets.

Attach to :3050. Stay on current branch. User owns commits.

## Locked UX / SoT

- Ops chrome = flush-square, edge-to-edge. No SidebarIntakeFormShell on Add/CSV. No Claim-compose px-3 gutters inventing gray canvas bands between Platform/Type/Priority.
- Combobox SoT = SearchableSelectField appearance="flush" (Claim type golden). Keyboard: Tab · ArrowDown/Enter/typeahead · Esc returns focus.
- Macro floor = InspectorActionFloor / FlushTerminalFooter: primary CTA + PaneHeaderCloseButton →| in ONE wrapper (bottom).
- Right edge: Station Displays (StationDisplaysPushColumn) XOR RightRailHost Add — never both. yieldStationRightEdgeForAddInbound + dispatchIncomingAddInboundClose.
- Box Add chrome ONLY on Arrival + Unbox (ReceivingBoxChromeActions). Testing/Pack stay clean. Unbox pinned Inbound embed must NOT mount IncomingChromeActions (Import).
- ingestPurchase is the ONE UPSERT onto the Incoming spine. Desk Add/CSV call importDeskInboundRow. Zoho-primary rows are NOT invented by Add (Import → Zoho sync).
- source_type registry = zoho|ebay|amazon|manual (source-registry.ts + DB CHECKs). Goodwill → source_type manual + source_platform=goodwill paint.
- Operator copy: capability nouns / runtime provider labels — never “Zoho Inventory says…” in station chrome (Integrations hub exception).

## Already landed (start here)

| Piece | Path |
|---|---|
| Add rail UI | `src/components/sidebar/receiving/incoming/IncomingAddInboundOverlay.tsx` |
| CSV rail UI | `src/components/sidebar/receiving/incoming/IncomingImportCsvOverlay.tsx` |
| Desk chrome CTAs | `IncomingChromeActions.tsx` · wired in `IncomingWorkspaceHeader.tsx` |
| Box chrome CTAs | `src/components/receiving/ReceivingBoxChromeActions.tsx` · Unbox + Arrival headers |
| Combobox SoT (+ keyboard) | `src/design-system/components/SearchableSelectField.tsx` |
| Desk import orchestration | `src/lib/inbound/desk-import.ts` · `desk-csv.ts` (+ tests) |
| APIs | `POST /api/receiving/inbound/import-purchase` · `import-csv` · identity PATCH |
| Schemas | `src/lib/schemas/inbound-desk.ts` |
| Spine ingest | `src/lib/inbound/ingest-purchase.ts` · `source-registry.ts` |
| Return tag | `src/lib/inbound/tag-inbound-return.ts` |
| Right-edge yield | `unbox-right-edge.ts` `yieldStationRightEdgeForAddInbound` · events in `src/utils/events.ts` |
| Displays close Add | `useUnboxDisplayView.ts` · `TriagePanel.tsx` |
| Filters | `IncomingSourceFilters.tsx` · `IncomingKindFilters.tsx` · Pipeline SQL `?inbound=` / `?inkind=` |
| Guards | `incoming-add-right-edge.guard.test.ts` · `receiving-box-chrome-actions.guard.test.ts` · `unbox-pinned-inbound.guard.test.ts` |

## Finish checklist — Display polish

- [ ] :3050 `/incoming` → Add: Platform/Type/Priority are one white flush plane (no gray label bands); Tab walks all three; ArrowDown opens; pick; Tab continues into order fields; floor Add + →| only.
- [ ] :3050 Unbox + Arrival Band 1: Check · Add · Unbox/Arrival. Open Displays then Add — Displays yields (one column). Open Add then Displays — Add closes.
- [ ] CSV: Amazon return + Goodwill purchase sample rows land on Pipeline; preview shows platform stamp; Source filter Manual/Amazon finds them.
- [ ] Priority Auto vs Priority(0): when tracking creates a carton, priority_tier stamps; without carton, honest help copy (already started) — no silent drop without docs.
- [ ] Identity edit on Incoming details for non-Zoho-locked rows still works after Add (tracking / listing / order #).

## Finish checklist — Connector integration (the product gap)

Do NOT hardcode vendor product sentences in station chrome. Gate CTAs on org capability / connection health from Settings → Integrations + existing sync hooks.

### 1) Zoho Inventory (operations backbone — already mature)

Goal: Import → Zoho and Check stay the Zoho paths; Add never invents `source_type=zoho`.

- [ ] Import Zoho CTA disabled + honest tip when vault `organization_integrations` provider zoho is missing/error (reuse Integrations health patterns — see `docs/integrations/zoho.md`).
- [ ] After Zoho PO sync (`useIncomingSyncActions.refreshZoho` / incoming zoho-refresh), newly mirrored POs appear without requiring manual Add.
- [ ] Document in UI help: “Pull purchase orders via Import → Zoho; Add is for marketplaces / CSV without a live PO feed.”
- [ ] Optional stretch: from Add, if operator pastes a Zoho PO # that already exists in `zoho_po_mirror`, deep-link / focus that Incoming row instead of creating a manual duplicate (Ask first before auto-merge).

### 2) eBay buyer (Universal Incoming)

Goal: connected buyer accounts feed Incoming via `ingestPurchase`; Add remains the manual bridge when sync lags.

- [ ] Import → eBay only when Universal Incoming + buyer account connected (`canImportEbay` already partially wired).
- [ ] Add with Platform=eBay posts `source_type=ebay` + buyer account field; row shows eBay badge + account chip (ingestPurchase platform_account path).
- [ ] `station:import-ebay-order` prefills Add (already) — prove Arrival/Unbox still get exclusion right-edge behavior.
- [ ] Capability copy: use runtime provider label, not “eBay Purchases API” prose in chrome.

### 3) Amazon (returns / unfound — primary dogfood pain)

Goal: operators can land Amazon orders/returns without SP-API.

- [ ] Add Platform=Amazon → `source_type=amazon` + `source_platform=amazon`; returns via Type=RETURN + tagInboundAsReturn.
- [ ] CSV `source=amazon` batch for returns with tracking + listing URL.
- [ ] Pipeline Source filter Amazon membership SQL stays honest (already extended — prove with fixture/dogfood).
- [ ] When Amazon SP-API / buyer sync eventually lands: register `amazon_purchase` fact_kind (today `INBOUND_SOURCE_FACT_KIND.amazon = null`); upgrade path must UPSERT same spine identity as manual Add (idempotent ingestPurchase). Ask before new CHECK enum values.

### 4) Goodwill (+ thrift CSV)

Goal: no API — CSV + Add only.

- [ ] Platform=Goodwill → manual ingest + `source_platform=goodwill` + default seller Goodwill (landed) — prove Pipeline paint + Arrival classify platform face.
- [ ] CSV template / help text under Import → Upload CSV lists required columns + Goodwill example (landed copy — keep accurate).
- [ ] Source filter: Goodwill rows appear under Manual (ingest) while platform badge paints Goodwill — document; do not fork a fifth `inbound` filter slug without SQL + registry work.

### 5) Connection hub consistency

- [ ] Settings → Integrations cards remain the only place with vendor product deep-links; Incoming Import menu rows use short capability labels (Zoho / eBay / Upload CSV) matching existing `IncomingChromeActions`.
- [ ] If a connector is disconnected, Import row shows disabled + one-line reason (connect in Settings) — do not toast-spam.
- [ ] Knip / route-auth: new routes follow `withAuth` + `orgId` from ctx; regenerate manifest if auth changes.

## Architecture (do not fork)

```text
Chrome Add / CSV
    → POST import-purchase | import-csv
    → importDeskInboundRow
    → ingestPurchase (spine UPSERT) + optional tagInboundAsReturn
    → stamp source_platform / receiving_type / priority_tier on carton when linked
    → invalidateReceivingFeeds

Import Zoho / eBay
    → existing sync (po-mirror / ebay purchase sync) → same spine

Station Displays  XOR  RightRailHost(Add)  XOR  AI
```

## Do not

- Mount Add inside StationDisplaysPushStack as a fake “display leaf” without a product decision — current law is mutual exclusion, not a third Displays body.
- Mount IncomingChromeActions (Import) on Unbox/Arrival — box stations get ReceivingBoxChromeActions only.
- Call Zoho create-PO from Add without an explicit product ask (Zoho stays sync/pull).
- Raise raw-button / knip / title baselines.
- Commit unless asked. Start/restart/kill `:3050`.

## Verify

- Inner loop: `npm run verify -- --fast`
- Before done: full `npm run verify` — fix failures this lane owns; document dirty-tree noise from other workstreams.
- Targeted: `desk-csv.test.ts` · `incoming-add-right-edge.guard.test.ts` · `receiving-box-chrome-actions.guard.test.ts` · `unbox-pinned-inbound.guard.test.ts` · SearchableSelectField consumers still typecheck.

## Reply format when finished

- What you dogfooded on :3050 (Incoming / Arrival / Unbox).
- Which connectors you wired or left gated.
- Verify status + any remaining gaps as a short checklist.
```

---

## 0. Why this exists

Unfound cartons at Arrival/Unbox often lack a live Amazon (or thrift) purchase API. Universal Incoming already has Zoho PO sync + eBay buyer ingest. Operators still need a **first-class manual/CSV intake** that:

1. Looks like the rest of the industrial inspector (flush, keyboard, one right edge).
2. Lands on the **same** `receiving_line` spine as sync (`ingestPurchase`).
3. Respects **org connections** — Import pulls when connected; Add/CSV fills gaps; never invent Zoho-primary rows by hand.

---

## 1. What shipped (keep)

### Display / chrome

| Concern | Behavior |
|---|---|
| Add rail | Flush card plane; floating-label Platform · Type · Priority comboboxes; order/SKU/tracking/listing fields; return extras when Type=RETURN; floor Add + →\| |
| CSV rail | Same flush floor pattern; amazon/goodwill/ebay mapping |
| Incoming desk | Check · Import▾ · Add |
| Arrival / Unbox | Check · Add · resume (Arrival/Unbox) — **not** Import |
| Right edge | Add yields Displays (URL + Arrival state); Displays open closes Add; AI yield also closes Add |

### Domain

| Concern | Behavior |
|---|---|
| `importDeskInboundRow` | assert source · ingestPurchase · return tag · stamp platform/type/priority |
| Goodwill | `source_type=manual`, `source_platform=goodwill` |
| Amazon/eBay Add | registered `source_type` + platform stamp |
| Zoho | blocked on desk Add (`cannot manually add zoho source`) — Import sync only |
| Filters | `?inbound=` all\|zoho\|ebay\|amazon\|manual · `?inkind=` purchase\|return |

---

## 2. Known gaps (finish these)

1. **Visual polish residual** — any remaining gray between classify cells was Claim-gutter cargo-cult; current overlay uses `bg-surface-card` + floating labels. Re-verify on `:3050` after pull.
2. **Priority without carton** — `priority_tier` lives on `receiving_carton`; stamp is a no-op until tracking/soft-join creates a carton. Either ensure carton on Add when tracking present (ingest already does for ebay/amazon/manual) or persist intent for later attach.
3. **Connector gating UX** — Import Zoho/eBay may still show enabled when vault disconnected; Add does not yet deep-link Integrations.
4. **Amazon fact payload** — `INBOUND_SOURCE_FACT_KIND.amazon` is still `null`; fine for manual bridge, must grow when API sync ships.
5. **Goodwill in Source filter** — rows filter as Manual; badge paints Goodwill. Product may later want `?inbound=goodwill` via `source_platform` — that is SQL + filter UI work, not a new `source_type`.
6. **Dirty-tree verify** — other workstreams may fail unit/knip/lint; own only inbound Add/CSV/exclusion files unless asked.

---

## 3. Connector map (capability → intake path)

| Capability | Connection SoT | Pull / sync path | Manual bridge |
|---|---|---|---|
| Inventory POs (Zoho) | `organization_integrations` provider `zoho` | Import → Zoho · po-mirror cron · Check by tracking | **Not** Add (`source_type=zoho` forbidden) |
| Marketplace buyer purchases (eBay) | eBay buyer account + Universal Incoming flag | Import → eBay · `sync-ebay-purchases` → ingestPurchase | Add Platform=eBay · CSV `ebay` |
| Amazon purchases/returns | Future SP-API / buyer; today none required | — | Add Platform=Amazon · CSV `amazon` · Type=RETURN |
| Thrift / Goodwill | None | — | Add Platform=Goodwill · CSV `goodwill` |
| Identity patch | — | — | Incoming details PATCH for non-Zoho-locked rows |

Integrations implementation detail stays behind facades (`docs/integrations/*`). Incoming chrome only asks “is this org connected / capable?”.

---

## 4. Key files (edit / read)

```text
UI
  IncomingAddInboundOverlay.tsx
  IncomingImportCsvOverlay.tsx
  IncomingChromeActions.tsx
  IncomingWorkspaceHeader.tsx
  ReceivingBoxChromeActions.tsx
  UnboxWorkspaceHeader.tsx
  TriageWorkspaceHeader.tsx
  TriagePanel.tsx                    # Arrival Displays ↔ Add exclusion
  SearchableSelectField.tsx          # house combobox + keyboard

Domain / API
  lib/inbound/desk-import.ts
  lib/inbound/desk-csv.ts
  lib/inbound/ingest-purchase.ts
  lib/inbound/source-registry.ts
  lib/inbound/tag-inbound-return.ts
  app/api/receiving/inbound/import-purchase/route.ts
  app/api/receiving/inbound/import-csv/route.ts
  lib/schemas/inbound-desk.ts

Right edge
  workspace/line-edit/unbox-right-edge.ts
  workspace/line-edit/hooks/useUnboxDisplayView.ts
  utils/events.ts                    # INCOMING_ADD_INBOUND_CLOSE · STATION_DISPLAYS_CLOSE

Filters / SQL
  IncomingSourceFilters.tsx
  IncomingKindFilters.tsx
  lib/receiving/lines/build-sql.ts   # inbound + inkind membership

Guards / tests
  incoming-add-right-edge.guard.test.ts
  receiving-box-chrome-actions.guard.test.ts
  unbox-pinned-inbound.guard.test.ts
  lib/inbound/desk-csv.test.ts
```

---

## 5. Acceptance criteria (definition of done)

1. On dogfood `:3050`, an operator can Add an Amazon **return** and a Goodwill **purchase** and see both on `/incoming` Pipeline with correct platform paint and kind.
2. CSV batch of mixed amazon/goodwill rows imports with per-row success/fail toast honesty.
3. Arrival and Unbox show Check · Add · resume; Import remains Incoming-desk-only.
4. Displays and Add never paint two right columns.
5. Zoho Import remains the only Zoho PO pull; Add refuses zoho source_type.
6. eBay Import respects connection + Universal Incoming gating.
7. `npm run verify` green for this lane’s ownership (or documented exempt noise).

---

## 6. Suggested implementation order

1. Dogfood polish + exclusion (fast, unblocks trust).  
2. Connector gating on Import menu (Zoho / eBay health).  
3. Amazon return CSV playbook + Pipeline proof.  
4. Goodwill paint/filter honesty doc + optional `source_platform` filter (Ask first).  
5. Amazon fact_kind registration only when a real sync lands (Ask first + migration).

---

## 7. Open questions (Ask first)

- Should Add ever **create** a Zoho PO via Inventory API, or stay pull-only forever?
- Should Goodwill get its own Pipeline Source chip (`source_platform`) or stay under Manual?
- Should box-station Add open as a Displays leaf (same column shell) instead of RightRailHost + exclusion? Current ruling: exclusion. Revisit only with product sign-off.
- Priority persistence before carton exists — store on line fact vs require tracking?

---

*End of handoff. Prefer growing SoT modules (`SearchableSelectField`, `ingestPurchase`, `unbox-right-edge`) over page-local twins.*
