# Tier 0 Go-Live Runbook — Stripe billing + E1 tenant enforcement

The two owner-gated keystones that unlock the sellable foundation. Part A (Stripe) is fully ready now. Part B (E1) is now wired in code for an **incremental, non-breaking** rollout — you provision the role + set one env var, then tables get enforced one at a time.

Legend: **[you]** = a step you run (Neon / Vercel / Stripe). **[done]** = already in the codebase.

---

## Part A — Stripe go-live (charge real customers)

Everything is built + verified; what remains is live config.

1. **[you] Create the live webhook endpoint + billing portal.** In your terminal (the `!` prefix keeps it in this session), with your real live secret key:
   ```
   STRIPE_SECRET_KEY=sk_live_xxx node scripts/stripe/setup-webhook-and-portal.mjs --live
   ```
   It is idempotent and prints `STRIPE_WEBHOOK_SECRET=whsec_…` (shown once — copy it) + the live `STRIPE_PRICE_*` block.

2. **[you] Set in Vercel → Production**, then **redeploy** (env is build-baked):
   - `STRIPE_WEBHOOK_SECRET` = the `whsec_…` from step 1 *(currently unset everywhere — the single highest go-live risk: without it a customer is charged but nothing mirrors and no plan flips)*
   - confirm `STRIPE_SECRET_KEY` = `sk_live_…` and `STRIPE_PUBLISHABLE_KEY` = `pk_live_…` (not test)
   - `STRIPE_PRICE_STARTER=price_1Tht1iLvhV85DRvtUFc2ovPV`
   - `STRIPE_PRICE_GROWTH=price_1Tht1lLvhV85DRvtCAtAI1Xj`
   - `STRIPE_PRICE_PRO=price_1Tht1nLvhV85DRvtrny4be3Z`
   - (leave `STRIPE_PRICE_ENTERPRISE` unset; set `NEXT_PUBLIC_APP_URL` + `BILLING_NOTIFICATION_DOMAIN` to the real domain)

3. **[you] Smoke-test** on `/settings/billing`: Upgrade → Stripe Checkout (card `4242 4242 4242 4242` in test first, then a real card live) → confirm `billing_subscriptions` mirrors + `organizations.plan` flips → open the portal → cancel → confirm it flips back.

[done] catalog created, webhook route deployed, `Stripe-Version` pinned, idempotency gate, portal config auto-creation (becomes the account default).

---

## Part B — E1: the `app_tenant` role + incremental enforcement

**Why:** the app connects as `neondb_owner`, which has `BYPASSRLS` — so every RLS policy is inert today. Enforcement requires the runtime's tenant-scoped paths to connect under a non-bypass role.

**The architecture (now wired in `src/lib/db.ts`):**
- The default `pool` (raw `@/lib/db`) stays on `DATABASE_URL` = **owner**. Un-migrated raw-pool routes keep working (the owner bypasses `ENABLE`-but-not-`FORCE` RLS).
- `withTenantConnection` / `tenantQuery` / `withTenantTransaction` / `withTenantDrizzle` run on `tenantPool` = **`TENANT_APP_DATABASE_URL`** (the `app_tenant` role) when that env is set — so those paths become RLS-subject.
- A table is `FORCE`-enforced only once **all** routes touching it are GUC-wrapped (on `tenantPool`). That's the per-table gate; raw-pool (owner) access to a `FORCE`d table is then blocked, which is why every toucher must be migrated first.
- No separate `ADMIN_DATABASE_URL` is needed in this design — migrations, `forEachActiveOrg` enumeration, MV refresh, and the AI read path all use the default (owner) `pool`.

### Steps
1. **[you] Create the role.** In the Neon SQL console, run `src/lib/migrations/2026-06-21_app_tenant_role.sql.template` (replace `:'app_tenant_pw'` with a strong secret — do not commit it). Verify:
   ```sql
   SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname='app_tenant';  -- expect: app_tenant | f | f
   ```
2. **[you] Run the canary** (proves RLS isolates a scratch table under the role — **no prod-table impact**):
   ```
   TENANT_APP_DATABASE_URL=<app_tenant DSN> node --test --import tsx src/lib/tenancy/cross-org-isolation.test.ts
   ```
3. **[you] Set `TENANT_APP_DATABASE_URL`** = the `app_tenant` DSN in Vercel Production (+ `.env.local`); keep `DATABASE_URL` = owner. Redeploy. Now the already-migrated GUC paths (`reason_codes`, `fba`, `warranty` reads, the 7 original) run as `app_tenant`. **No table is `FORCE`d yet, so nothing breaks** — `app_tenant` simply respects RLS where the GUC is set.
4. **[you] confirm the guard:** `npm run tenancy:guard:check` — invariant (B) should confirm `bypassrls=false` on the runtime role.
5. **Enforce per table** (FORCE), easiest first. For each, add a dated migration `SELECT enforce_tenant_isolation('<table>');`, apply via `npm run db:migrate`, then run the per-table cross-org test:
   - **First (zero raw-pool routes — safe immediately):** `rag_documents`, `rag_document_chunks`, `shipment_orders`.
   - **Then:** `reason_codes` (all routes GUC-wrapped).
   - **fba tables** — but **first** add a composite `(organization_id, fnsku)` PK to `fba_fnskus` (today it's bare-global `fnsku`; under FORCE two orgs can't share an FNSKU string) and flip its `ON CONFLICT`. Then the fba tables whose every toucher is migrated. (The cross-domain readers `work-orders`/`global-search`/`packing-logs` + the `tech/*` scan routes must be GUC-wrapped before their shared fba tables can FORCE.)
   - **warranty** — after the warranty write-path + the `clock-sweep` cron are migrated (the cron must loop orgs via `forEachActiveOrg` or run on the owner pool).
6. **Do NOT onboard a second tenant** until the hot tables (`orders`/`receiving`/`serial_units` + the above) are `FORCE`d. Until then a 2nd tenant's un-migrated raw-pool routes would see cross-tenant rows.

### Rollback
- Per table: `SELECT relax_tenant_isolation('<table>');` (drops FORCE).
- Whole role: unset `TENANT_APP_DATABASE_URL` (wrappers fall back to the owner pool) + redeploy.

---

## Sequencing
`Stripe (Part A)` and `E1 steps 1–4` are independent and can both be done now. `E1 step 5` (per-table FORCE) proceeds as the route burn-down completes for each table.

---

## Part C — activate Waves 2–6 (Zoho multi-tenancy, webhooks, crons, credentials, Phase B)

Waves 2–6 (2026-06-20) made the Zoho/integration surface tenant-safe **in code**. The code is deployed-safe today (single-tenant USAV behaves identically); these steps light it up for real multi-tenant.

### C1 — apply the new migrations (with the matching deploy)
All additive + idempotent. Apply via `npm run db:migrate`. **Ordering matters for the two that pair with code** — deploy the Waves 2–6 code first (or together), because their writers reference the new columns:

| Migration | Pairs with | Notes |
|---|---|---|
| `2026-06-20_org_id_phase_b_final_six.sql` | — | hermes_*/google_photos_* org_id (armed, inert). Safe any time. |
| `2026-06-20_api_idempotency_org_scope.sql` | `src/lib/api-idempotency.ts` + ~33 routes | **Apply WITH the deploy** — the writers now stamp `organization_id`. |
| `2026-06-20_zoho_webhook_org_resolution.sql` | webhook pipeline + dedupe | **Apply BEFORE deploy** — the dedupe writers reference `zoho_webhook_events.organization_id`; adds `organization_integrations.webhook_token`. |
| `2026-06-20_integration_credential_audit.sql` | credential-scope | Audit writer is best-effort (swallows a missing table), so order-independent. |

After applying: `npm run tenancy:guard:check` should still succeed.

### C2 — provision per-tenant Zoho webhooks (per org that connects Zoho)
The tokenless endpoint `/api/zoho/webhooks` is retired and returns `410`. For **each tenant**:
1. The tenant connects Zoho via OAuth (`/api/zoho/oauth/authorize` → callback). The callback now mints + returns a one-time `{ webhook.url, webhook.signing_secret }`.
2. **[tenant/you]** In Zoho → Settings → Automation → Webhooks, register that `url` with the `signing_secret` (header `x-zoho-webhook-signature`, hex HMAC-SHA256 of the raw body).
3. Verify a test delivery: 200 with `{ ok: true }`; a wrong-secret body → 401; an event whose Zoho org id ≠ the connected account → 403.
4. Confirm the tokenless URL returns `410` and remove any obsolete global webhook secret from deployment configuration.

### C3 — migrate USAV's Zoho credentials into the vault (complete)
Runtime credential lookup and cron fan-out are vault-only. The manual and cron
fulfillment paths require an explicit organization id, and no Zoho env fallback
remains in `getIntegrationCredentials`.

### C4 — FORCE candidates unlocked by Waves 2–6 (extends E1 step 5)
Once `app_tenant` is live (Part B), these become enforceable after their remaining writers are GUC-safe:
- **`receiving` / `receiving_lines`** — already FORCEd (2026-06-19). Wave 2 made the Zoho-sync writers GUC-wrapped + org-stamped, so they're correct under `app_tenant`. ✅ ready.
- **`zoho_webhook_events`, `integration_credential_audit`, `api_idempotency_responses`, hermes_*/google_photos_*** — armed policies in place; FORCE after confirming their writers run under the GUC (webhook pipeline + credential-scope use `tenantQuery`/`withTenantTransaction`; the idempotency routes still use the owner `pool` → move them to `tenantQuery(orgId, …)` first, or accept that their org-filtered reads already isolate them).

### C5 — documented follow-ups (not blocking go-live; do at/around 2nd-tenant onboarding)
- ~~**Per-org Zoho threading** for `po-mirror-sync.ts` / `fulfillment-sync.ts`~~ **DONE (2026-06-20)** — both are org-threaded + fanned out via `forEachOrgWithProvider('zoho', …)`. Zoho is now multi-tenant end-to-end (inbound + outbound). Note: the mirror + fulfillment sync-cursors are still a single shared key (advanced only when all orgs succeed) — split to per-org cursors when tenant Zoho timelines diverge enough to matter.
- **Cron locking — DONE (2026-06-20):** all 31 cron routes now run under `withCronLock` (skip-on-overlap). Wave 4's concurrency/distributed-locking requirement is complete.
- **Dead crons removed (2026-06-20):** `shipping/subscribe-{ups,fedex,usps}` (de-scheduled carrier-webhook path; polling via `sync-due` replaced them; USPS 403-blocked) and `cron/reconcile-unmatched` (never scheduled; the manual retry and explicitly org-scoped repair script remain). Now-orphaned libs `lib/jobs/{ups,fedex,usps}-subscribe-pending` + the `/api/webhooks/{ups,fedex,usps}` receivers can be removed once the webhook path is confirmed permanently shelved.
- **Cron fan-out — partial.** Fanned out: the 4 Zoho crons + the 5 that already loop orgs (stock-alerts, inventory/drift-check, integrations/sync, integrations/reconcile, amazon/orders-sync). **Remaining (locked but still single global pass):** 11 tenant-data crons → `forEachActiveOrg` (photos/{analyze,nas-mirror}, replenishment/{detect,sync}, shipping/{metrics,reconcile-delivered}, sku-catalog/refresh-suggestions, sourcing/scan, staff-goals/history, workflow-node-stats, zoho/orders-ingest-drain); 4 provider crons → `forEachOrgWithProvider` + lib org-threading (ebay/refresh-tokens, google-sheets/transfer-orders, receiving/incoming-tracking-sync, shipping/sync-due, sourcing/scour). Each needs its queries rewritten to the per-org client / its provider lib threaded — do per-cron, NOT a blind sweep (a naïve wrap would run global queries N times). 2 global crons (cleanup, refresh-reports) are complete with lock-only.
- **Composite-key flips** (each couples a migration to an `ON CONFLICT` target — do atomically with the matching code, NOT before): `api_idempotency_responses` → `(organization_id, idempotency_key, route)`; `receiving`/`local_pickup_orders` Zoho-id partial-uniques → per-org; `fba_fnskus` → `(organization_id, fnsku)`.
- **hermes_* NOT NULL**: thread org through the external Hermes writer (sibling repo), then `SET NOT NULL` before FORCE.
- **Credential allowlist coverage**: bring `po-mirror-sync`/`fulfillment-sync` under `withZohoCredential`; declare operation sets for ebay/amazon/etc. as their service code adopts `withCredentialScope`.
