# HANDOFF — finish the security backlog (continuation prompt)

Written 2026-09-06. You are picking up after a full pen-test and two remediation passes.
**Read `docs/warehouse-os/HANDOFF-security-auth-pentest.md` §12 first** — it lists what
already landed, with verification output. Do not redo it. This file is the remaining work,
in order.

## Ground rules

- **NEVER remove pinless staff signin** (`AUTH_PINLESS_SIGNIN`, `src/app/api/auth/signin/route.ts`).
  Operator decision, recorded in §10. It is bound to the request host; keep it that way.
- **NEVER edit `**/*.tsx`, `**/*.jsx`, `**/*.css`** — a project hook denies those writes
  without a design-mcp stamp. Keep API response shapes backward-compatible instead.
- The tree carries heavy uncommitted operator WIP. Never stash, revert, `git checkout`, or
  run a formatter. Do not commit unless asked.
- Fail closed on missing config in production. A dev escape hatch must be an explicit env
  flag, never a side effect of an unset secret.
- Existing patterns to reuse: `withAuth`/`requireRoutePerm`, `checkRateLimitAsync`,
  `safeStrEqual` (`@/lib/security/safe-compare`), `assertSafeExternalUrl`
  (`@/lib/security/safe-external-url`), `audit()` (`@/lib/auth/audit`), `tenantQuery`
  (`@/lib/tenancy/db`), `sessionHandle` (`@/lib/auth/session`).
- Verify with: `tsx scripts/tenancy-guard.ts --check`, `tsx scripts/audit-permissions.ts`,
  `node --import tsx -r ./scripts/register-server-only-shim.cjs --test src/lib/auth/*.test.ts src/lib/tenancy/*.test.ts`,
  `./node_modules/.bin/tsc --noEmit`. All are green today except one pre-existing operator
  WIP error in `src/components/settings/settings-sections.ts`.

---

## Operator-only (do not attempt in code — just remind, then move on)

1. **Rotate the 29 leaked credentials.** Listed in §3.1. Git history is purged (§11) but
   GitHub still serves the old blobs by exact SHA until it GCs, and every pre-existing
   clone keeps them. Rotation is the only real fix.
2. **Rotate the `@motionplus` registry token.** It was committed; de-inlining is done
   (`.npmrc` carries only the registry mapping; the token lives in `~/.npmrc`).
3. **Ask GitHub Support to garbage-collect the repository** so the unreachable pre-purge
   objects stop being fetchable by SHA.

---

## The list

### 1. Per-org `roles` (CRIT, the last standing cross-tenant hole)
- Where: `src/app/api/admin/roles/**`, `src/lib/auth/role-store.ts:51-53`,
  `docs/tenancy/coverage.generated.json` (`roles`: `has_org:false, rls_enabled:false`).
- Today: an interim guard 404s roles unrelated to the caller's org, but the table is still
  global and the permission cache is org-unaware.
- Do: migration adding `organization_id NOT NULL` + backfill, replace the global
  `UNIQUE (key)` with `UNIQUE (organization_id, key)`, key the `role-store` cache by org,
  add the conjunct to all five handlers, then delete the interim guard.
- Accept: two orgs can hold same-key roles with different permissions; a role id from
  another org 404s; `tsx scripts/tenancy-guard.ts --check` still exit 0.

### 2. Burn down the tenancy ratchet (31 pairs)
- Where: `scripts/tenancy-guard-baseline.json`, guard at `scripts/tenancy-guard.ts`.
- Each entry is a route touching a FORCEd table on the owner pool with no GUC wrap and no
  org predicate. Worst first: `/api/threads/[id]/*` (6), `/api/kiosk/{enroll,pair,revoke}`
  (staff PII), `/api/home/feed` (orders+items), `/api/orders-exceptions/[id]`,
  `/api/photos/[id]/context`, `/api/my-day`.
- Do: for each, either wrap in `withTenantConnection`/`tenantQuery` or add the
  `organization_id` conjunct, then **delete that line from the baseline**. The guard
  hard-fails on a stale baseline line, so it proves the fix.
- Accept: baseline shrinks; guard stays exit 0. Do not add exemptions.

### 3. Enforce a real CSP (`script-src` + nonce) — proxy side DONE 2026-09-06; operator patch below
- Where: `src/proxy.ts` (`CSP_ENFORCED` / `cspReportOnlyPolicy`), inline boot scripts in
  `src/app/layout.tsx:144-160`.
- Done in the proxy: per-request nonce (Web Crypto, Edge-safe) minted in
  `applySecurityHeaders`; report-only `script-src` is now
  `'self' 'nonce-…' 'strict-dynamic'` (former host allowlist dropped — strict-dynamic
  ignores hosts in CSP3 browsers; the pdf.js worker is self-hosted same-origin since the
  pdfjs v6 upgrade, so cdnjs left worker-src entirely). The nonce reaches the app on
  sanitized request headers: `x-csp-nonce` (boot scripts) and
  `content-security-policy(-report-only)` (Next auto-nonces its OWN bootstrap scripts
  from the request CSP header — without this the enforcement flip would kill hydration).
  Inbound client-supplied `x-csp-nonce` / CSP request headers are stripped first.
  Enforced `script-src` joins ONLY behind explicit `CSP_ENFORCE_SCRIPT_SRC=1` (default
  off; also dropped if nonce generation fails — fail closed, never a nonceless policy).
- Reports: NOTHING collects CSP violations server-side — no report-uri/report-to
  endpoint, no csp-report route. The browser console is the only observation channel;
  "read the collected reports" means DevTools console during a report-only shift
  (ignore extension-injected inline scripts, they're not ours).
- Operator (`.tsx`, hook-blocked) — apply to `src/app/layout.tsx`:

  ```diff
  --- a/src/app/layout.tsx
  +++ b/src/app/layout.tsx
  @@ RootLayout body, after `const h = await headers();`
       const h = await headers();
       const pathname = h.get('x-pathname') || '/';
  +    // Per-request CSP nonce minted by the proxy (applySecurityHeaders →
  +    // propagateCspRequestHeaders). Present on every forwarded response; when
  +    // absent (RNG failure) scripts stay nonce-less and the report-only
  +    // console flags them — never fabricate a fallback nonce.
  +    const cspNonce = h.get('x-csp-nonce') ?? undefined;
       const search = h.get('x-search') || '';

  @@ <head>, the six inline boot scripts
  -    <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
  -    <script dangerouslySetInnerHTML={{ __html: STATION_SKIN_BOOT_SCRIPT }} />
  -    <script dangerouslySetInnerHTML={{ __html: STATION_DEPTH_BOOT_SCRIPT }} />
  +    <script nonce={cspNonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
  +    <script nonce={cspNonce} dangerouslySetInnerHTML={{ __html: STATION_SKIN_BOOT_SCRIPT }} />
  +    <script nonce={cspNonce} dangerouslySetInnerHTML={{ __html: STATION_DEPTH_BOOT_SCRIPT }} />
       {designLab && (
  -      <script dangerouslySetInnerHTML={{ __html: RESKIN_BOOT_SCRIPT }} />
  +      <script nonce={cspNonce} dangerouslySetInnerHTML={{ __html: RESKIN_BOOT_SCRIPT }} />
       )}
       <script
  +      nonce={cspNonce}
         dangerouslySetInnerHTML={{
           __html:
             "(function(){try{if(!('serviceWorker' in navigator))return;…
  -    <script dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_SCRIPT }} />
  +    <script nonce={cspNonce} dangerouslySetInnerHTML={{ __html: BOOT_SPLASH_SCRIPT }} />
  ```

  (`nonce={undefined}` renders no attribute — safe when the header is absent.)
- Flip to enforce — ONE env change, only after a report-only shift with zero real
  (non-extension) violations: `CSP_ENFORCE_SCRIPT_SRC=1`.
- Accept: no console CSP violations on `/`, `/dashboard`, a kiosk route, and the manual
  viewer.

### 4. Gmail refresh token stored in plaintext
- Where: `src/app/api/admin/po-gmail/oauth-callback/route.ts:100-118`,
  `src/lib/po-gmail/client.ts:11-12`, `google_oauth_tokens.refresh_token`.
- Do: stop dual-writing the raw token, make the client vault-only
  (`encryptIntegrationPayload`), then `ALTER TABLE google_oauth_tokens DROP COLUMN
  refresh_token, DROP COLUMN access_token`. Re-consent the PO mailbox afterwards.
- Accept: `SELECT refresh_token FROM google_oauth_tokens` no longer exists; PO sync still
  runs.

### 5. Kill the ~20 `?? DOGFOOD_ORG_ID` / `transitionalDogfoodOrgId()` fallbacks
- Where: `src/lib/neon/orders-tracking-queries.ts:72,299,417,712,730`,
  `src/lib/orders/ingest-canonical-orders.ts:327,446`, `src/lib/zoho/fulfillment-sync.ts:580`,
  `src/lib/warranty/zendesk-link.ts:61,116`, `src/app/api/locations/[barcode]/route.ts:150`,
  `src/lib/tracking-exceptions.ts:63`, `src/lib/shipping/publish-on-status-change.ts:34`,
  + the rest via `grep -rn "?? *transitionalDogfoodOrgId()\|?? *DOGFOOD_ORG_ID" src`.
- This is the 2026-07-08 audit's P0 F01, renamed rather than closed.
- Do: make `orgId` a required parameter and thread it from the caller's session/state.
  Silent wrong-tenant writes are the failure mode.
- Accept: zero fallback-shaped hits from that grep; typecheck green.

### 6. Repository-layer global-key lookups (cross-tenant record theft)
- Where: `src/lib/repositories/customerRepository.ts:40,45,50-56`,
  `salesOrderRepository.ts:43`, `itemRepository.ts:82,87,92,159`; reachable via
  `src/services/OrderSyncService.ts:193-201` on an attacker-chosen buyer email.
- Do: require `orgId` on `findById`/`findByEmail`/`findByZohoId`/`findBySku`/
  `findByReference`/`listActive`; change `itemRepository.upsertMany`'s conflict target to
  composite `(organization_id, zoho_item_id)` with the migration (the global
  `items.zoho_item_id UNIQUE` at `src/lib/drizzle/schema.ts:702` is the bug).
- Accept: a colliding customer email or Zoho item id across two orgs cannot move a row
  between tenants. Add the case to `src/lib/tenancy/idor-regression.test.ts` compile pins.

### 7. Two dependency majors
- `pdfjs-dist` `^5.7.284` → `^6.2.108` (GHSA-hq66-cqwq-w95j, arbitrary JS on opening a PDF
  in the operator's origin). API churn in `src/lib/manuals/pdfThumbnail.ts`; also set
  `isEvalSupported: false` and self-host the worker instead of cdnjs (`pdfThumbnail.ts:46`,
  no SRI today).
- `@simplewebauthn/server` `^11.0.0` → `^13.3.2` (GHSA-6hxq-p678-4hr2, registration
  attestation). Option shapes change in `src/lib/auth/webauthn.ts` and
  `src/lib/identity/webauthn-account.ts`; needs a passkey register + login smoke.
- Accept: `pnpm audit` no longer lists either; thumbnail generation and passkey login both
  exercised by hand.

### 8. Un-FORCEd tenant tables
- Where: `docs/tenancy/coverage.generated.json` — `ops_events` (20,496 rows,
  `rls_enabled:false`, **no policy at all**), `organization_feature_flags`,
  `packer_log_enrichment`, `receiving_line_{facts,putaway,return,testing,zoho}`,
  `receiving_triage`, `receiving_unbox`.
- Do: write the missing `tenant_isolation` policy for the two with none, then add all ten to
  the next `enforce_tenant_isolation` migration cohort under `src/lib/migrations/`.
- Accept: `tsx scripts/tenancy-guard.ts --check` reports them enforced; app still works
  against the `app_tenant` role.

### 9. Retire the 297 legacy route-only tenancy exemptions
- Where: `scripts/tenancy-guard-exemptions.ts` (328 entries, 242 sharing one
  machine-generated reason, no expiry).
- The guard now keys on `route::table` and warns on legacy route-only keys.
- Do: convert entries to `route::table`, delete the ones the guard reports as stale (30
  today), and re-justify or drop the boilerplate 242. Add an `addedAt` field so this cannot
  silently regrow.
- Accept: zero deprecation warnings from the guard.

### 10. Smaller, still real
- `act-as-staff` in `shared` orgs lets any session become any staff incl. admin
  (`src/app/api/auth/act-as-staff/route.ts:76-90`, `src/lib/auth/act-as-staff.ts:38-46`).
  Same convenience class as pinless — **ask the operator before changing behaviour**;
  propose "target may not exceed caller's permissions".
- `sku-manager` `GET ?action=increment` still mutates (`src/app/api/sku-manager/route.ts`);
  a `POST` exists. Migrate the `.tsx` callers, then make `GET` read-only.
- Product-manual upload now 415s GIF/HEIC/BMP while `UploadManualModal.tsx` still
  advertises `image/*` — narrow the `accept` attribute (operator, `.tsx`).
- Enrollment tokens stored plaintext (`src/lib/auth/enrollment.ts:32-34`) while every other
  token is sha256-only. Hash on write, compare hashes on read.
- Service worker caches `/api/(?!auth)` for 24h (`next.config.ts` workbox block). Inert
  today because `src/app/layout.tsx:150-155` unregisters workers — narrow the pattern
  **before** anyone re-enables the PWA, or a shared station leaks the previous staffer's data.
- `next` is pinned at 16.2.11; re-check `pnpm audit` for newer security releases.

---

## Acceptance for the whole batch

1. Every item you touch has a repro-or-assertion you ran, pasted with its output.
2. `tenancy-guard --check` and `audit-permissions` both still exit 0; the ratchet baseline
   is smaller than 31, never larger.
3. Typecheck clean for files you touched; lint clean; no `.tsx`/`.jsx`/`.css` writes.
4. Regression coverage goes in `src/lib/tenancy/idor-regression.test.ts` compile pins
   (they run without a DB) rather than DB-gated tests, which no-op in `verify`.
5. Update §12 of `HANDOFF-security-auth-pentest.md` with what you closed, and say plainly
   what you did not.
