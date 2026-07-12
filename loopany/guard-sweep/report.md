---
type: alert
title: Guard sweep failures (2026-07-11)
date: 2026-07-11
---

# Guard sweep — 2026-07-11

3 of 4 checks failed.

## audit-route-auth (exit 1)
```
[41m[31m[[39m[49m[41m[30mELIFECYCLE[39m[49m[41m[31m][39m[49m [31mCommand failed with exit code 1.[39m

[2m$ tsx scripts/audit-route-auth.ts --check[22m
✗ route-permissions manifest is OUT OF DATE

  The live routes diverge from the committed manifest at:
  docs/security/route-permissions.json

  Diff summary:
    + /api/auth/act-as-staff/route.ts::POST → gate=NONE, perm=∅

  Fix: run `npm run audit-route-auth -- --emit` and commit the result.
```

## tenancy-guard (exit 1)
```
Tenancy guard (A): 192 enforced table(s); 255 documented exemption(s) (helper-safe-delegation=180, no-db-false-positive=30, cross-org-by-design=23, preauth-identity=21, owner-pool-admin=1); 54 unresolved static violation(s).
Tenancy guard (B): tenant-runtime role 'app_tenant' (bypassrls=false) via TENANT_APP_DATABASE_URL; 209 FORCEd table(s) live.
[41m[31m[[39m[49m[41m[30mELIFECYCLE[39m[49m[41m[31m][39m[49m [31mCommand failed with exit code 1.[39m

[2m$ tsx scripts/tenancy-guard.ts --check[22m
Tenancy guard (A): 3 exemption(s) no longer match a live violation (safe to prune): /api/receiving-lines/incoming/inventory-refresh, /api/rma/[id], /api/rma/by-number/[number]
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=require'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.

❌ Tenancy isolation violations:
  - route /api/webhooks/zoho/orders (risk=critical) touches ENFORCED table(s) [orders] but is not GUC-wrapped or allowlisted
  - route /api/auth/verify-email (risk=high) touches ENFORCED table(s) [email_login_tokens, staff] but is not GUC-wrapped or allowlisted
  - route /api/cron/feed-membership-projection (risk=high) touches ENFORCED table(s) [feed_memberships, receiving, orders] but is not GUC-wrapped or allowlisted
  - route /api/cron/search-outbox (risk=high) touches ENFORCED table(s) [entity_search_outbox, entity_search_docs, staff] but is not GUC-wrapped or allowlisted
  - route /api/cron/signal-insight-rollup (risk=high) touches ENFORCED table(s) [entity_signals, insight_links] but is not GUC-wrapped or allowlisted
  - route /api/cron/signals/buyer-notes-heal (risk=high) touches ENFORCED table(s) [entity_signals, ebay_accounts, orders] but is not GUC-wrapped or allowlisted
  - route /api/desktop-app/release (risk=high) touches ENFORCED table(s) [orders] but is not GUC-wrapped or allowlisted
  - route /api/testing/receiving-lines (risk=high) touches ENFORCED table(s) [receiving] but is not GUC-wrapped or allowlisted
  - route /api/ai/retrieve (risk=medium) touches ENFORCED table(s) [types] but is not GUC-wrapped or allowlisted
  - route /api/assistant/chat (risk=medium) touches ENFORCED table(s) [messages, staff, types] but is not GUC-wrapped or allowlisted
  - route /api/assistant/mutations/[id]/revert (risk=medium) touches ENFORCED table(s) [staff] but is not GUC-wrapped or allowlisted
  - route /api/assistant/mutations/stats (risk=medium) touches ENFORCED table(s) [agent_mutations] but is not GUC-wrapped or allowlisted
  - route /api/documents/[id] (risk=medium) touches ENFORCED table(s) [document_entity_links, documents, orders] but is not GUC-wrapped or allowlisted
  - route /api/documents/download-zip (risk=medium) touches ENFORCED table(s) [documents, orders] but is not GUC-wrapped or allowlisted
  - route /api/ebay/connect (risk=medium) touches ENFORCED table(s) [ebay_accounts] but is not GUC-wrapped or allowlisted
  - route /api/entity-signals (risk=medium) touches ENFORCED table(s) [entity_signals] but is not GUC-wrapped or allowlisted
  - route /api/global-search (risk=medium) touches ENFORCED table(s) [receiving, orders, staff, sku] but is not GUC-wrapped or allowlisted
  - route /api/inbox/support (risk=medium) touches ENFORCED table(s) [support_ticket_assignments, items] but is not GUC-wrapped or allowlisted
  - route /api/label-manifests (risk=medium) touches ENFORCED table(s) [items, sku] but is not GUC-wrapped or allowlisted
  - route /api/label-manifests/[id]/dissolve (risk=medium) touches ENFORCED table(s) [items] but is not GUC-wrapped or allowlisted
  - route /api/label-manifests/[id]/items (risk=medium) touches ENFORCED table(s) [items] but is not GUC-wrapped or 
```

## ds-guards (exit 1)
```
TAP version 13
# Subtest: raw neutral utility classes do not grow (ratchet → theme-registry tokens)
not ok 1 - raw neutral utility classes do not grow (ratchet → theme-registry tokens)
  ---
  duration_ms: 397.340917
  type: 'test'
  location: '/Users/icecube/repos/cycleforge-app/src/components/ui/color-neutrals.guard.test.ts:2:1869'
  failureType: 'testCodeFailure'
  error: 'Raw neutral utility classes grew to 79 (baseline 43). Use the theme-registry tokens instead: bg-surface-card/canvas/sunken/hover/strong, text-text-default/muted/soft/faint, border-border-hairline/soft/default (also as ring-/divide-). If a raw neutral is genuinely needed (alpha wash, deliberate dark chrome), add a `ds-allow-raw-neutral` comment. Do not raise the baseline — LOWER it. Top offenders: text-gray-500×16, bg-white×8, ring-gray-200×8, border-gray-200×7, text-gray-900×6, border-gray-300×6, bg-gray-50×5, text-gray-600×5'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (/Users/icecube/repos/cycleforge-app/src/components/ui/color-neutrals.guard.test.ts:87:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
# Subtest: arbitrary-hex utility classes do not grow (ratchet → semantic tokens)
ok 2 - arbitrary-hex utility classes do not grow (ratchet → semantic tokens)
  ---
  duration_ms: 288.009167
  type: 'test'
  ...
# Subtest: native-element title= count does not grow (ratchet → HoverTooltip)
ok 3 - native-element title= count does not grow (ratchet → HoverTooltip)
  ---
  duration_ms: 75.136958
  type: 'test'
  ...
# Subtest: HoverTooltip remains the single house tooltip primitive
ok 4 - HoverTooltip remains the single house tooltip primitive
  ---
  duration_ms: 0.209583
  type: 'test'
  ...
# Subtest: raw <button> count outside the design system does not grow (ratchet)
not ok 5 - raw <button> count outside the design system does not grow (ratchet)
  ---
  duration_ms: 296.19
  type: 'test'
  location: '/Users/icecube/repos/cycleforge-app/src/components/ui/raw-button.guard.test.ts:2:1587'
  failureType: 'testCodeFailure'
  error: 'Hand-rolled <button> count grew to 45 (baseline 36). Use <Button>/<IconButton> from @/design-system/primitives. If a raw <button> is genuinely required, add a `ds-raw-button` comment on/above the line. Do not raise the baseline — LOWER it as you migrate.'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
  stack: |-
    TestContext.<anonymous> (/Users/icecube/repos/cycleforge-app/src/components/ui/raw-button.guard.test.ts:97:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
# Subtest: the deprecated DS PrimaryButton alias stays deleted (use <Button>)
ok 6 - the deprecated DS PrimaryButton alias stays deleted (use <Button>)
  ---
  duration_ms: 167.616792
  type: 'test'
  ...
# Subtest: the deleted SidebarSearchBar component stays deleted
ok 7 - the deleted SidebarSearchBar component stays deleted
  ---
  duration_ms: 0.8075
  type: 'test'
  ...
# Subtest: no file imports a SidebarSearchBar symbol
ok 8 - no file imports a SidebarSearchBar symbol
  ---
  duration_ms: 214.635292
  type: 'test'
  ...
# Subtest: SidebarShell exposes no `search` prop (header owns search)
ok 9 - SidebarShell exposes no `search` prop (header owns search)
  ---
  duration_ms: 0.22775
  type: 'test'
  ...
# Subtest: the 40px sidebar search band token stays deleted
ok 10 - the 40px sidebar search band token stays deleted
  ---
  duration_ms: 176.606292
  type: 'test'
  ...
# Subtest: no raw text-[Npx] for a size that has a named token
no
```
