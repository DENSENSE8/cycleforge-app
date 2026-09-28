# HANDOFF — ShipStation API as the one order + label path, and the Labels display (2026-09-24)

Paste this as the first message of a fresh session in the **prod lane**
(`~/Projects/cycleforge-lanes/prod`, branch `prod/worktree-2026-09-11`). Scope: **web desktop**
To ship (`/shipping/orders`), its Labels walk and the Selected-order evidence column, plus the
order-sync plumbing behind them. Dev origin `http://localhost:3050`. Commit on
`prod/worktree-2026-09-11`; stage only the files you touch (other lanes share this tree).

Supersedes the open items of `HANDOFF-paperwork-print-shipstation.md` (items 0–4 are done — see
"Already landed" below).

**Owner goal (verbatim intent):** "Check whether the v1 and v2 ShipStation keys are active. If so,
drop the Google Sheets syncing method and only progress through the ShipStation API."

Work the steps **in order**. Step 0 is a gate: do not retire Google Sheets for an org whose keys
are not proven live.

---

## 0. Prove the keys (gate — ~15 min)

ShipStation has two credentials, stored in the org's integrations vault
(`getIntegrationCredentials(orgId, 'shipstation')`, `src/lib/shipping/shipstation/config.ts`):

| Key | Used for | Client | Live check (cheapest call) |
|---|---|---|---|
| **v2** `apiKey` (`API-Key` header) | rate-shop, buy, void, label download | `createShipStationV2Client` (`client.ts`) | `GET https://api.shipstation.com/v2/carriers` → 200 |
| **v1** `apiKey` + `apiSecret` (Basic) | order pull (v2 has no order list), store list, stored weight | `createShipStationV1Client` (`orders-v1.ts`) | `GET https://ssapi.shipstation.com/stores` → 200 |

Owner can check by hand:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "API-Key: $V2_KEY" https://api.shipstation.com/v2/carriers
curl -s -o /dev/null -w "%{http_code}\n" -u "$V1_KEY:$V1_SECRET" https://ssapi.shipstation.com/stores
```

In-app equivalents: Labels walk → **Get shipping rates** (v2); To ship Sync ▾ → **Sync ShipStation** (v1).

**Build the check into the app** (nothing does this today):

1. `src/lib/shipping/shipstation/status.ts` — pure-ish, Deps-injected (see `domain-unit-test` skill):
   `checkShipStationStatus(orgId, deps) → { v1: 'active'|'missing'|'rejected'|'error', v2: …, active: v1==='active' && v2==='active', checkedAt }`.
   v2 = `listCarriers()`, v1 = `listStores()`. 401/403 → `rejected`; no creds → `missing`;
   network/5xx → `error` (NOT inactive — a flaky call must never flip the org off ShipStation).
   Cache per org in memory ~5 min.
2. `GET /api/integrations/shipstation/health` (new-route skill; `shipping.view`) returns it; add
   `healthPath` to the `shipstation` entry in `src/lib/integrations/connectors/registry.ts` (the
   other providers already declare one). Regenerate `docs/security/route-permissions.json`
   (`npx tsx scripts/audit-route-auth.ts --emit`) and pin it in
   `src/lib/auth/route-permission-manifest.test.ts`.

## 1. ShipStation-only order sync — DONE, then made unconditional (2026-09-24)

> **Superseded:** the owner removed Google Sheets order sync entirely. The desk face always
> reads **Sync ShipStation** and runs lanes `shipstation` + `ecwid`, then `exceptions` — there
> is no `sheets` lane and no `status.active` switch. The steps below are the original plan,
> kept for history.

Before this work the To-ship **Sync Google Sheet** face (`OrdersDeskAddAction.tsx`) ran
`useOrdersSync().handleTransfer` (`src/hooks/useOrdersSync.ts`): lanes `sheets` + `ecwid` in
parallel via `POST /api/integrations/{provider}/sync` (NDJSON), then `exceptions`. The
ShipStation connector already existed (`src/lib/integrations/connectors/shipstation.ts` →
`shipstationSync`, v1 pull, incremental `modifyDate` cursor, uniform `orders` upsert).

When `status.active`:

1. **Run lanes** — add a `shipstation` lane to `src/lib/orders-sync/run-steps.ts`
   (`SyncRunLane`, `LANE_STEPS`, a `read_shipstation` step "Read ShipStation orders", unit `order`,
   and a `fetching_shipstation` phase). Do not relabel the `sheets` lane. `useOrdersSync` picks
   `shipstation` instead of `google_sheets` for the first lane; widen `runConnectorSync`'s provider
   union. Mirror in `useOrdersSyncDemo.ts` only if the demo should show it.
2. **Desk CTA** — face reads **Sync ShipStation** (and `/m/orders/sync` follows the same hook).
3. **Refuse the sheet** — superseded: the sheet order import is deleted (see 4), so there is
   no 409 gate. The ShipStation CSV upload (`/api/google-sheets/sync-shipstation-orders` +
   its connections-panel row) is deleted too.
4. **Cron** — DONE (2026-09-24, owner: "remove the sync google sheet functions entirely").
   Sheet order import is deleted outright, not gated: no `google_sheets.transfer_orders` cron,
   no `/api/google-sheets/transfer-orders`, no `google_sheets` connector `sync()`. ShipStation
   runs on its own cron `shipstation.orders_sync` (`/api/cron/shipstation/orders-sync`,
   `0 15 * * *` + `0 21 * * *` UTC = 08:00 + 14:00 PDT) and is no longer in the 15-minute
   `integrations.orders_sync` provider list.
5. The desk and `/m/orders/sync` always sync ShipStation; there is no sheet fallback.

> **Superseded 2026-09-28** (owner): the daily sheet is back as a *backup* order source
> behind ShipStation (aggregator-mode backfill, fill blanks + insert true misses), and
> `shipstation.orders_sync` is replaced by the chained `orders.backfill_pipeline` cron.
> See `docs/integrations/google-sheets.md`.

## 2. Close the tracking gap before retiring the sheet (~2 h) — REQUIRED

`shipstationSync` writes `trackings: []`: the v1 order pull never attaches tracking. The sheet
pipeline did (`resolve_tracking`). Labels bought in-app attach tracking already (purchase route),
but an order shipped from inside ShipStation would land with none.

- Add `listShipments({ shipDateStart | modifyDate, page })` to the v1 client
  (`GET /shipments`, returns `orderNumber`, `trackingNumber`, `carrierCode`, `voided`).
- In `shipstationSync`, attach non-voided shipments via `applyOrderTrackingOps({ primaryTrackingNumber,
  primaryCarrier: shipStationCarrierToStored(carrierCode) })` (both exist — see
  `src/lib/shipping/carrier-resolution.ts`). Emit a `resolving_tracking` phase with the count.
- Optional: register the v2 `track` webhook on credential save
  (`src/app/api/webhooks/shipstation/[token]/route.ts` exists) — handoff P3.

Unit-test the mapping (DB-free, fakes).

## 3. Labels display — the To-ship record surfaces (~2–3 h)

Owner rulings in force (do not relitigate):

- **One language, two densities** (`BRIEF.md` §4): triage = industrial identity (warm greys, radius 0,
  mono-caps labels, sans values), differs in space only. CI guard
  `src/design-system/modes/modes.guard.test.ts`.
- **Order actions live in the Selected-order column** — the orders verb catalog at n=1
  (`OutboundOrderEvidence.tsx` → `RecordVerbs`, read from `rail-actions-store`). Never a second
  verb implementation.
- **Fixed middle column** in the Labels walk (`DESK_RECORD_MEASURE_PX` 736,
  `TriageScrollLayout measure="fixed"`).

Build:

1. **Shipping facts in the evidence column** — a `Label` block: status (none / bought / linked /
   voided), carrier + service, cost, bought by/at (from `shipping_label_purchases`), tracking chip,
   and **Print label · Print slip** (reuse `printDocument` / `printPaperworkPackets`). Read the
   ledger via a small `GET /api/orders/[id]/label-purchase` or extend `orderReleaseGatesQuery`.
2. **Labels walk card order** — Parcel & shipping label directly under Order (the buy is the job);
   Paperwork below. Keep `OrderShippingPanel` the ONE shipping form.
3. **ShipStation state line** in `OrderShippingPanel`: from the health check — "ShipStation active
   (v1 ✓ v2 ✓)" / which key is missing, linking Settings → Integrations; ship-from missing links
   Settings → Organization → Ship-from address (already built).
4. **Queue badge** — the Labels CTA count (`OrdersDeskLabelsAction`) stays print-packet-incomplete;
   add no second badge.

Screenshot before/after at 1440×900 (desk) for: To ship with a record open; Labels walk (rates
listed, success card); Settings → Organization ship-from.

## 4. ShipStation P2 / P3 (later)

- Label format/layout (PDF/ZPL, 4×6 vs letter) through the purchase body (options exist on
  `LabelPurchaseOptions`); carrier package codes; serialize `insuredValue` in
  `client.ts:toSsShipment` (currently dropped).
- International customs block (`types.ts`, `client.ts`, `order-rates`).

---

## Already landed (2026-09-24, all on `origin/prod/worktree-2026-09-11`)

| Commit | What |
|---|---|
| `e75a93b8f` | Purchase ledger `shipping_label_purchases` (claimed before the charge; replay/backfill; 409 on unresolved claim); v2 `downloadLabel` sends `API-Key` to ShipStation hosts only; Print label/slip on the success card |
| `48dc1258a` | Labels walk fixed 736px middle column |
| `18e78591d` | Rate ShipStation orders without a local weight; `SHIP_FROM_NOT_CONFIGURED` message; label's carrier stored (`shipStationCarrierToStored`) |
| `d80156c21` | `product_parcel_dims` — weight/L×W×H remembered per SKU + item number; "Remembered from SKU …" |
| `d25bfec11` | Settings → Organization → **Ship-from address** (admin, audited, complete-or-empty) |
| `4f30c07e4` | Print paperwork when the pack station is down (Print all; bulk verb `w`; pdf.js renders every page; ledgered `fallback_browser`) |
| `390ff588e` | One language, two densities (triage = industrial identity) + modes CI guard |
| `348d81430` | Order actions in the Selected-order column; **Urgent** verb (`u`); dialog verbs honour their rows |

**Migrations not yet applied in prod** — run `/db-migrate` (dry run first) BEFORE running this code:
`2026-09-24f_shipping_label_purchases.sql`, `2026-09-24g_product_parcel_dims.sql`. The Labels walk
gate query joins `product_parcel_dims` and 500s without it.

## Verify before claiming done

- `npx tsc --noEmit -p tsconfig.json` · eslint on touched files
- Unit: `node scripts/run-unit-tests.mjs` — known pre-existing reds on HEAD (not yours):
  `compound-title-strike`, `color-neutrals`, `nav-registry`, `scan-station-overlay-cohort`
  (+ `label-ingestions/database` needs `V1_TEST_DATABASE_URL`)
- `node --import tsx tools/eval-ledger/run-cohort-eval.mjs slot-table` and `… shortcuts`
  (after any verb / hotkey change) — run the script directly; `pnpm run` trips a lockfile check
  in sandboxes without `api.motion.dev`
- `git push` runs `verify:dogfood` via `.githooks/pre-push` (~6 min). Another lane pushes often:
  `git fetch && git rebase origin/prod/worktree-2026-09-11` right before pushing.

## Gotchas

- Never send the v2 `API-Key` to a non-ShipStation host (`isShipStationHost`).
- A ShipStation network error is not "inactive" — never retire the sheet on a flaky call.
- `useDashboardBulkSelection` is THE orders verb catalog (`VERB_CATALOG_MODULES`); new verbs go
  there with a `SELECTION_STATUS_BAR_META` row (free letters: e g h j m t v y z).
- Design-system CLI (`node tools/design-mcp/ds.mjs …`) needs Garisek-OS; if absent, follow the
  tokens (`cornerClass`, `RECORD_LABEL_CLASS`, mode vars) and say so.
