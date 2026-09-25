# Handoff — Global return/replacement label intake + support call desk (Phase 2 deferred)

Paste this whole file into a fresh session. Repo: `/home/michaelgarisek/Projects/cycleforge-lanes/prod`
(read `AGENTS.md`). All probes on `http://localhost:3050` (Playwright with
`tests/.auth/admin.json`, `baseURL http://localhost:3050`; delete throwaway scripts after).
Done = `pnpm verify:fast` green + proven on the live surface.

The plan of record is **`docs/todo/support-call-desk-PLAN.md`** (phases 1–6). Read it first.

## Operator goal (words, condensed)

"I must be able to add an order or add a shipment globally … link a support ticket, link an
order number, link a label or buy a label through the ShipStation API … displayed in the triage
design system … the customer called at this date and time, reported this issue, a shipping label
was bought for this return and replacement." Long-term: live Nextiva call on screen, updating in
real time, AI adjusting what to do; native in the Electron desktop app, mirrored on web through a
Staff-ID websocket link. Later an automation rule suggests the best label from ticket + customer.
Phase 1 DoD: **"I'm on the phone and I searched the order."**

## State at hand-off (2026-09-25) — all UNCOMMITTED, live in the lane

Another agent is working in this same worktree (committing `/m` mobile work). Commit only the
files listed below; do not sweep theirs.

### A. Platform linking (finished)
- DB (applied via `node scripts/run-pending-migrations.mjs --only …`, operator-approved):
  `2026-09-25_ecwid_single_platform.sql` (spellings only), `2026-09-25_integration_store_links.sql`
  (table + backfill of 8 stores + 8 `shipstation-*` accounts deactivated). Sync since linked 21
  retired stores platform-only. `npm run tenancy:coverage` regenerated `docs/tenancy/*`.
- Code: `src/lib/catalog/integration-store-links.ts` (list/upsert, `SHIPSTATION_STORE_PROVIDER`),
  `shipstation-store-sync.ts` (`storesToPlace`; never creates accounts; linked store untouched),
  connector `shipstation.ts` `loadContext` bindings from links, `shipstation-orders.ts`
  (`bindings: { platform, accountSource | null }`), routes `src/app/api/catalog/store-links/route.ts`
  (GET/PUT) + `src/app/api/integrations/shipstation/stores/route.ts`, schema `StoreLinkUpsertBody`,
  queries `storeLinksQuery`/`shipstationStoresQuery`, hook `useStoreLinks`,
  `platform-display.ts` `orderPlatformChoices` + `isPlatformDefaultAccount` (tested),
  picker `LedgerPlatformPicker` (flat list, one per platform + linked storefront accounts),
  `src/components/settings/ShipStationStoreLinks.tsx` (in `CatalogSection` + ShipStation
  `IntegrationDetailClient`), de-bloat in `CatalogManagerList` / `PlatformAccountsManager`.
- Design system pin: tokens `RECORD_TRAILING_CELL_CLASS` / `RECORD_TRAILING_GLYPH_INSET_CLASS`
  (`src/design-system/tokens/industrial-record.ts`), primitives moved to
  `src/design-system/components/record-ledger/EvidenceDisclosure.tsx`
  (`EvidenceFactRow`, `EvidenceFactDisclosure`, `EvidenceDisclosure`; old
  `outbound/orders/EvidenceFact.tsx` deleted), `pinned.json` entries (`EvidenceDisclosure`,
  `SearchableSelectField`), `tools/design-mcp/design-mcp.profile.json` indexes `record-ledger/`,
  `docs/design-system/BRIEF.md` "Trailing edge" row.
- Behaviour change to remember: new eBay orders from stores 216566/230134/230141 now attribute to
  `DRAGON` / `MEKONG` / `USAV` instead of `eBay`.

### B. Settings layout (finished)
Integrations, `[provider]`, diagnostics, staff, billing now mount `SettingsSectionFrame
maxWidth="5xl"`; commands root is `w-full` + scroll. No settings page leaves a blank right area.

### C. Phase 1 — on-the-phone lookup (finished)
- `src/components/search/dossier/SearchOrderLedger.tsx`: `/search?sel=order:<id|order#>` on desk
  density mounts `OutboundOrdersLedger` in `ModeRegion mode="triage"` over the order's lines,
  searched line opened via the new ledger prop `openRecordId`. `SearchDossier.tsx` routes desk →
  ledger, phone (`compact`) → old `SearchOrderDossier`.
- `fetchOrderLookupData` (`src/lib/dashboard-table-data.ts`): `/api/orders?q=&includeShipped=true`.
- `/api/orders` `q` now also matches customer display/name/first+last/email, ShipStation ship-to
  name, and a phone read-out (last 10 digits of `cust.phone|mobile`, `ss_ref.ship_to->>'phone'`).
- Proven live: ⌘K → order # → triage ledger + evidence rail; "James Goers" → 3 orders; shipped
  order by pk opens.
- Known regression (by design, restore in Phase 2): the legacy desktop dossier's timeline /
  findings / handoffs no longer show on `/search?sel=order:`.

### D. Global return + replacement label intake (finished and live-proven)
- The global desktop-header `+` is **not customer support**. It opens
  `/search?entry=label`, a focused order-number lookup.
- A match opens the order through `SearchOrderLedger` →
  `OutboundOrdersLedger`, the same To-ship DataTable and evidence column used by
  the outbound desk. No parallel order card/display was introduced.
- An absolute miss offers **Add order exception**. It mounts the existing
  `OrderIntakeOverlay` and seeds the searched order number; the canonical caged
  intake still owns G1–G3 and release into To-ship.
- Every selected order now has a **Problem order · Return + replacement**
  evidence disclosure. It composes two existing `BuyLabelSection` instances,
  locked to `return` then `replacement`. Each purchase keeps its own
  idempotency key and uses the existing ShipStation purchase route.
- A shared package-weight field feeds both rate requests when an older order has
  no stored parcel; otherwise the existing order/ShipStation parcel remains the
  default. Existing purchased return/replacement purposes are recognized and
  not offered for duplicate purchase.
- The existing Labels disclosure remains the durable order record:
  `OrderLabelEntries` lists both purchases by purpose, cost, tracking, actor and
  time after the existing query invalidation.
- Main files: `src/components/layout/GlobalHeaderAdd.tsx`,
  `src/components/search/SearchFindSurface.tsx`,
  `src/components/search/SearchBrowseShell.tsx`,
  `src/components/outbound/orders/ReturnReplacementLabelSection.tsx`,
  `src/components/outbound/labels/BuyLabelSection.tsx`, and
  `src/components/outbound/orders/OutboundOrderEvidence.tsx`.
- Live on `:3050`: global `+` → `/search?entry=label`; `4290` resolved to
  `/search?q=4290&entry=label&sel=order%3A2624` and painted the To-ship ledger.
  `NOTFOUND-OMP-99999` exposed manual exception intake with the order number
  prefilled. A real 16 oz return rate-shop returned live carrier rates ($4.39
  best on this probe). Browser interception then proved the complete return →
  replacement purchase sequence and the Labels list showed OUTBOUND + RETURN +
  REPLACEMENT. No real carrier purchase was charged.
- Phase 2 support schema only: operator approved and the rolled-back dry run
  passed, then `2026-09-25d_support_interactions.sql` was applied with `--only`.
  The tables exist under FORCE RLS but have no route or UI yet. Do not edit this
  applied migration; later fixes are new migration files.

## Open items to clear FIRST
1. `pnpm verify:fast` was run after this slice. All 18 non-typecheck gates pass;
   Typecheck is red in shared, unrelated work:
   `src/components/quick-access/ThrowTaskPanel.tsx` is missing `useThrowTask` /
   `throwTargetKey` and has implicit-any callback parameters, and
   `src/lib/reports/report-tasks-feed.ts` omits `projectName` / `assignees` from
   `TaskDeskWireRow`.
2. Commit A+B+C+D via GitHub Desktop. Do not sweep the other agent’s mobile files.
3. Ecwid duplicates resolved with operator approval: each distinct delivered
   tracking was preserved as a `linked_manually` outbound
   `shipping_label_purchases` row + order note on twin orders
   2624/2625/2390/2629/2392; duplicate rows 3123/3124/3125/3128/3132 were then
   deleted.

## NEXT: Phase 2 — "the record remembers the call" (DEFERRED)

Do not resume until the operator asks. The migration is already applied; start at
domain + routes. Read skills `new-route` and `org-scope` before that step.

When resumed, continue at step 2:

1. **Migration — COMPLETE / APPLIED:** `2026-09-25d_support_interactions.sql`
   (tenant-from-birth, enforce block, rollback header). Tables:
   - `support_interactions(id, organization_id, occurred_at, channel CHECK in
     ('call','voicemail','email','chat','walk_in'), call_event_id → call_events ON DELETE SET NULL,
     staff_id → staff, customer_id → customers, issue_code TEXT, issue_text TEXT, outcome TEXT,
     created_at, updated_at)`.
   - `support_interaction_links(id, organization_id, interaction_id → support_interactions ON DELETE
     CASCADE, entity_type CHECK in ('ORDER','SHIPMENT','LABEL','TICKET'), entity_id BIGINT, role
     TEXT, UNIQUE(organization_id, interaction_id, entity_type, entity_id))`.
   Labels stay in `shipping_label_purchases`; tickets stay in `support_tickets`/`ticket_links`.
   Rolled-back dry run passed; operator approved; applied with `--only`; tenancy coverage regenerated.
2. **Domain + routes**: `src/lib/support/interactions.ts` (create, list by order); routes
   `POST /api/support/interactions`, `GET /api/orders/[id]/history` (use `requireRoutePerm` for
   `[id]`; permission `orders.view` read / `orders.create` write — check
   `src/lib/auth/permission-registry.ts`). Audit via `recordAudit` (add `AUDIT_ACTION` /
   `AUDIT_ENTITY` constants, append-only).
3. **History section** in `src/components/outbound/orders/OutboundOrderEvidence.tsx` as an
   `EvidenceDisclosure` ("History"): interactions + ticket links + label purchases + notes, newest
   first. Reuse `orderTimelineQuery` (`src/lib/queries/order-timeline-query.ts`) and
   `presentOrderFindEvents` from the retired dossier path instead of a new timeline. It shows on
   To-ship and on the Phase-1 lookup (restores the removed timeline).
4. **Caller → orders**: extend `src/lib/voice/match-customer.ts` to return `customerId` and
   `orderIds` (orders by `customer_id` and by ship-to phone, same last-10-digit rule as the
   `/api/orders` phone match); store in `call_events.matched_customer`.
5. Acceptance: on `/search?sel=order:<id>` log a call (temporary: API call or a minimal
   "Log call" row inside History) → it appears in History with time + issue + linked label;
   a Nextiva test webhook for a known phone stores `orderIds`. `verify:fast` green.

Then Phase 3 (global Add in a triage `DeskStageOverlay`, fed by `src/lib/global-add/catalog.ts`;
Log-a-call form; return + replacement in one confirm via `/api/shipping/order-labels/purchase`
with `purpose`), per the plan.

## Where things live (verified this session)
- Ledger reuse: `OutboundOrdersLedger` props incl. `chrome` (`ToShipChrome` — build your own; see
  `SearchOrderLedger` / `OrderExceptionsWorkbench`), `selectionScope`, `openRecordId`.
  Evidence: `OutboundOrderEvidence` (needs `OrdersQueueCommits` — the feed builds them).
- Search: `CommandBar.tsx` → `/api/global-search` → `hrefForPreviewHit` → `/search?sel=order:`.
- Labels: `src/lib/shipping/shipstation/client.ts`, `order-shipment-spec.ts` (return swaps
  endpoints), `/api/shipping/order-rates`, `/api/shipping/order-labels/purchase|void`,
  `LABEL_PURPOSE_FACE` (`src/lib/shipping/label-purpose.ts`), `BuyLabelSection.tsx`,
  `linkLabelToTicket` (`src/lib/shipping/order-label-links.ts`).
- Voice: `call_events` / `voicemails` migrations 2026-06-25d/e/f, webhook
  `src/app/api/integrations/nextiva/webhook/[token]/route.ts`, `publishVoiceEvent` (no client
  subscriber yet), staff channels in `src/lib/realtime/channels.ts`.
- Automations: `src/lib/schemas/automations.ts` (triggers, `assign_work` only),
  `src/lib/automations/listing-match.ts`.
- Intake: `OrderIntakeForm` / `OrderIntakeOverlay` (caged G1–G3), plan
  `docs/todo/order-intake-acknowledgment-PLAN.md`.

## Gotchas
- Running `tsc` beside the lane can OOM-kill `cycleforge-lane@prod` (it restarts itself). Prefer
  `pnpm verify:fast` alone.
- `/api/orders?q=` takes ~5 s in dev; Playwright waits must be generous; ⌘K search can take >20 s
  on a cold compile.
- `normalizeUnshippedOrdersPayload` collapses same-product lines of one order (To-ship does too).
- Do not open a ledger record with the global `open-shipped-details` event (several app-wide
  listeners react); use `openRecordId`.
- Never apply migrations without the operator's yes; always `--only <file>`.
