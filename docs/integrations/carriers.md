# Shipping carriers — UPS · FedEx · USPS

Carrier **tracking** for inbound (receiving) and outbound (shipped) shipments. Carriers
are **hand-built forever** — Nango doesn't cover them. The live mechanism is **adaptive
cron polling** (carrier webhooks are paid/unreliable, so the webhook receivers exist but
are **dormant** — no subscribe cron exists). See the tracking-live-sync and
receiving-history memories.

Providers: `src/lib/shipping/providers/{ups,fedex,usps}.ts`. UPS and FedEx read their
OAuth client from `process.env` (`UPS_CLIENT_ID`/`_SECRET`, `FEDEX_CLIENT_ID`/`_SECRET`);
`src/lib/shipping/carrier-credentials.ts` owns that list and the missing-credentials
fault. Only `ENABLED_SYNC_CARRIERS` (UPS, FedEx) are polled — USPS is off pending its
IP Agreement (`enabled-carriers.ts`).

## Per-carrier auth & tracking

| | Token model | Token endpoint | Tracking call |
|---|---|---|---|
| **UPS** | Client-credentials (Basic) | `/security/v1/oauth/token` | `GET /api/track/v1/details` |
| **FedEx** | Client-credentials (form body) | `/oauth/token` | `POST /track/v1/trackingnumbers` |
| **USPS** | OAuth2 client-credentials (JSON) | `/oauth2/v3/token` | `GET /tracking/v3/tracking/{num}?expand=DETAIL` |

Access tokens are cached in-process with a ~60s refresh buffer (USPS tokens last ~1h —
shorter than UPS/FedEx). **USPS enforces a 60 req/hr quota** — the binding constraint on
sweep size — and USPS 403s have historically blocked some lookups (see the
receiving-history memory).

## Polling — the live path (`vercel.json`)

| Schedule | Path | What |
|---|---|---|
| `*/5 * * * *` | `/api/cron/shipping/sync-due?limit=200&concurrency=8&carriers=UPS,FEDEX` | Rolling sweep of due shipments (`next_check_at` ≤ now) |
| `30 3 * * 2-6` | `/api/cron/shipping/sync-due?limit=200&concurrency=8&carriers=UPS,FEDEX` | Nightly deep refresh (Tue–Sat, 03:30 UTC) |
| `20 * * * *` | `/api/cron/shipping/reconcile-delivered` | Reconcile delivered-but-unscanned |
| `*/30 * * * *` | `/api/cron/shipping/metrics` | Sync-health metrics + alerts |
| `10,25,40,55 * * * *` | `/api/cron/receiving/incoming-tracking-sync` | Re-poll the Incoming UI shipment set (keeps "Delivered · not scanned" fresh) |

`sync-due` runs `runShippingSyncDueJob` → `runDueShipments` (`getDueShipments`, grouped
per carrier, `concurrency`-sized chunks) → `syncShipment` per row → provider
`trackByNumber` → `upsertTrackingEvents` + `updateShipmentSummary` (success: resets
`consecutive_error_count`, stamps `last_checked_at`, `next_check_at` from
`computeNextCheckAt`) or `updateShipmentError` (failure: 1h·2h·4h·8h then 12h backoff;
401/403 walls 24h). Registry key `shipping.sync_due` in `src/lib/cron/registry.ts` (with
`expectedEveryMs` for staleness detection). All crons authenticate with
`Bearer ${CRON_SECRET}`. Every on-demand poll — `POST /api/shipping/track/sync-one`
(`{ shipmentId }`, returns the fresh facts), the Incoming refresh, the resync script —
goes through the same `syncShipment` writer.

### Missing credentials fail loud, never per row

Missing UPS/FedEx credentials are a **deployment** fault: `runShippingSyncDueJob` checks
them once per run, leaves that carrier out of the sweep (no row polled, errored or backed
off), and returns `ok: false` with `configFaults: [{ carrier, reason:
'carrier_credentials_missing', missing }]` — the cron answers **503** and its
`cron_runs` row is `failed` (the "Carrier tracking" sync status shows it). `syncShipment`
applies the same check, so on-demand polls answer 503 `CARRIER_CREDENTIALS_MISSING`
without writing. The metrics cron adds `carrierSync` (per carrier: `lastOkAt` = newest
successful poll, `failingOpen`, `open`, `configFault`, `lastError`) and raises
error-level `CARRIER_CREDENTIALS_MISSING` / `CARRIER_SYNC_STALE` (no successful poll in
`SHIPPING_SYNC_STALE_HOURS`, default 6, while open rows exist) alerts through
`captureError` (Sentry when `SENTRY_DSN` is set). `GET /api/nav/fulfilled` carries the
same per-org read as `syncHealth`.

### Operator resync

```
node --env-file=.env --import tsx --import ./scripts/register-server-only-shim.cjs \
  scripts/shipping-resync.ts [--carriers=UPS,FEDEX] [--only-failing] [--tracking=<n>] [--limit=500] [--concurrency=5]
```

Re-polls open shipments now, ignoring `next_check_at`/backoff, through `syncShipment`
under each row's org; prints ok / errors by message / events inserted / status moves.

## Webhooks — receivers only, no subscriber

`POST /api/webhooks/{ups,fedex,usps}` receivers exist with multi-scheme auth (HMAC-SHA256
preferred, plus shared-secret header echo and bearer fallbacks) and write through the same
repository writers. The subscription side was **deleted on 2026-06-22** (commit
`0eaf4a990`: `subscribe-{ups,fedex,usps}` crons, `*-subscribe-pending` jobs,
`{ups,fedex}-subscription.ts` clients), so nothing registers tracking numbers and no row
can reach `webhook_subscription_status = 'COMPLETED'`. The `FAILED` rows are leftovers of
those jobs (`UPS_WEBHOOK_CALLBACK_URL is not set`; FedEx `401 NOT.AUTHORIZED` on its
token). Caveats from the deleted clients:

- **UPS** — may not push *third-party* tracking numbers at all; confirm with UPS before
  relying on it. Needs `UPS_WEBHOOK_CALLBACK_URL` + `UPS_WEBHOOK_SECRET`.
- **FedEx** — async two-pass subscription (`POST …/subscriptions` → jobId → reconcile
  `…/jobs/{jobId}`), 1000 numbers/batch. Needs `FEDEX_WEBHOOK_PROJECT_ID`, a FedEx
  project whose credentials are authorized for the tracking-webhook API, and
  `FEDEX_WEBHOOK_SECRET`.
- **USPS** — exact callback auth scheme unconfirmed; tracking itself is disabled.

To activate webhooks: restore the subscription clients/jobs/crons from `0eaf4a990^`, set
the webhook env vars, and point the carrier portal at `…/api/webhooks/{carrier}`.

## Environment variables

| Carrier | Vars |
|---|---|
| **UPS** | `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `UPS_BASE_URL` (default `https://onlinetools.ups.com`); webhook: `UPS_WEBHOOK_CALLBACK_URL`, `UPS_WEBHOOK_SECRET`, `UPS_WEBHOOK_BEARER`, `UPS_WEBHOOK_CREDENTIAL_HEADER` |
| **FedEx** | `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`, `FEDEX_ENV` (`production`/`sandbox`); webhook: `FEDEX_WEBHOOK_PROJECT_ID`, `FEDEX_WEBHOOK_SECRET`, `FEDEX_WEBHOOK_BEARER`, `FEDEX_WEBHOOK_SIGNATURE_HEADER` |
| **USPS** | `CONSUMER_KEY`/`CONSUMER_SECRET` (or `USPS_CONSUMER_KEY`/`_SECRET`), `USPS_BASE_URL` (default `https://apis.usps.com`); webhook: `USPS_WEBHOOK_SECRET`, `USPS_WEBHOOK_BEARER`, `USPS_WEBHOOK_SIGNATURE_HEADER`, `USPS_WEBHOOK_SECRET_HEADER` |
| All | `CRON_SECRET` for the polling crons |

## Status

Polling is **live** for UPS and FedEx; USPS is disabled pending its IP Agreement.
Webhooks are receivers only (no subscriber) pending real-world confirmation that carrier
push is worth the paid tier.
