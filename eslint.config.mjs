import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';

/**
 * Minimal flat ESLint config focused on dead code hygiene.
 *
 * The primary goal is enabling `unused-imports` (the package was in devDeps
 * but had no effect because there was no eslint.config.* before).
 *
 * Full Next.js rules can be re-enabled later once we resolve compat layer
 * circular issues with eslint-config-next + ESLint 9 flat config.
 *
 * Usage:
 *   npx eslint src --max-warnings=10000
 *   npx eslint src --rule 'unused-imports/no-unused-imports:error' --fix
 *
 * `next lint` may still fall back to its defaults until this is polished.
 *
 * NOTE: do not paste a recursive glob into this block comment — the star-slash
 * sequence it contains closes the comment early and makes the whole config
 * unparseable (Node ESM "Unexpected token"). Describe paths in prose instead.
 */

export default [
  // Registering react-hooks/@next/next/jsx-a11y below (so their rule names
  // resolve for pre-existing eslint-disable comments, see the plugins block)
  // makes those rules "known but off" — which makes `--fix` treat every
  // disable comment referencing them as an unused directive and strip it.
  // That's a real, repo-wide side effect (confirmed: it touched ~165 files
  // on a first run), not what registering the plugins was for. Disable the
  // unused-directive check globally rather than let `--fix` rewrite comments
  // it didn't add.
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'build/**',
      'apps/desktop/**',
      'reports/**',
      '**/*.min.js',
      'src/lib/migrations/**',
      'public/sw.js',
      'public/workbox-*.js',
      'public/fallback-*.js',
      'public/swe-worker-*.js',
    ],
  },

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    plugins: {
      'unused-imports': unusedImports,
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooksPlugin,
      '@next/next': nextPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },

    rules: {
      // Core dead-code signal we care about for this effort
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // Light baseline to avoid noise while cleaning
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',

      // These plugins are registered (not extended via eslint-config-next,
      // which needs FlatCompat and previously caused circular-resolution
      // issues under ESLint 9 flat config) solely so that pre-existing
      // `eslint-disable` comments referencing their rules resolve instead
      // of erroring with "Definition for rule X was not found". Left off
      // rather than enabled — turning them on is a separate, deliberate
      // decision, not a side effect of fixing dangling disable comments.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      '@next/next/no-img-element': 'off',
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
    },
  },

  {
    files: ['scripts/**/*', 'src/lib/pipeline/**/*'],
    rules: {
      'no-console': 'off',
    },
  },

  // ── Z-index scale guard ──────────────────────────────────────────────────
  // Stacking order is owned by the named scale in
  // `src/design-system/tokens/z-index.ts` (memory: z-index-scale-sot). New code
  // must consume a token — a `z-*` Tailwind class, `zIndex.*`, a CSS var, or the
  // <Layer>/<AnchoredLayer> primitives — never a raw global-scale number.
  //
  // These rules ban the *global-scale* offenders only: arbitrary `z-[NN]`
  // (2+ digits — Tailwind's own scale stops at z-50, so any multi-digit
  // arbitrary value is an overlay-layer number) and inline `zIndex: >= 50`
  // (the scale's overlay bands start at dropdown=50). Purely-local in-flow
  // stacking — `z-[1]` decorative masks, `whileDrag zIndex: 20` lifts — stays
  // native and is intentionally left alone. The one documented exception
  // (SerialCard's in-flow hover tooltip) carries an inline disable.
  //
  // ── Tenancy escape-hatch guard (merged into the same no-restricted-syntax) ─
  // `DOGFOOD_ORG_ID` / `transitionalDogfoodOrgId()` hardcode the dogfood org instead
  // of reading `ctx.organizationId` from the session. New code MUST NOT add
  // either. Both selectors live in THIS block (not a second one) because a
  // second block re-declaring no-restricted-syntax for the same files would
  // override — not merge with — this one, silently dropping the z-index guard.
  // The current known callers are allowlisted in the SEPARATE "rule off" block
  // immediately below (the burn-down list) — that disables only this rule for
  // those files, keeping them parsed + linted by every other rule. Delete each
  // allowlist entry as it is refactored so the debt can never regress.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/design-system/tokens/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/z-\\[\\d{2,}/]',
          message:
            'Arbitrary z-[NN] is banned. Use a named z-index token (z-panel/z-modal/…) or <Layer>/<AnchoredLayer>. See tokens/z-index.ts.',
        },
        {
          selector: 'TemplateElement[value.raw=/z-\\[\\d{2,}/]',
          message:
            'Arbitrary z-[NN] is banned. Use a named z-index token (z-panel/z-modal/…) or <Layer>/<AnchoredLayer>. See tokens/z-index.ts.',
        },
        {
          selector: "Property[key.name='zIndex'] > Literal[value>=50]",
          message:
            'Inline global zIndex literal is banned. Use zIndex.<token> from tokens/z-index.ts (or useZIndex()/<Layer>). Local in-flow lifts (< 50) are fine.',
        },
        {
          selector: "ImportSpecifier[imported.name='DOGFOOD_ORG_ID']",
          message:
            'Do not import DOGFOOD_ORG_ID in new code — derive the tenant from ctx.organizationId. See docs/tenancy/multi-tenancy-execution-plan.md §A3.',
        },
        {
          selector: "ImportSpecifier[imported.name='transitionalDogfoodOrgId']",
          message:
            'transitionalDogfoodOrgId() is deprecated migration debt — thread ctx.organizationId through instead. See docs/tenancy/multi-tenancy-execution-plan.md §A3.',
        },
        {
          selector: "CallExpression[callee.name='transitionalDogfoodOrgId']",
          message:
            'transitionalDogfoodOrgId() is deprecated migration debt — thread ctx.organizationId through instead. See docs/tenancy/multi-tenancy-execution-plan.md §A3.',
        },
        {
          selector: "Literal[value=/USAV Solutions|USAV Orders|USAV Assistant|USAV Ops Assistant/]",
          message:
            'Hardcoded USAV product brand is banned. Use PRODUCT_NAME / PRODUCT_NAME_AI from src/lib/branding/constants.ts, or organizations.name from the DB. See docs/cycle-forge-branding-spec.md.',
        },
        {
          selector: "TemplateElement[value.raw=/USAV Solutions|USAV Orders|USAV Assistant|USAV Ops Assistant/]",
          message:
            'Hardcoded USAV product brand is banned. Use PRODUCT_NAME / PRODUCT_NAME_AI from src/lib/branding/constants.ts, or organizations.name from the DB. See docs/cycle-forge-branding-spec.md.',
        },
        {
          selector:
            "CallExpression[callee.object.name='crypto'][callee.property.name='randomUUID']",
          message:
            'crypto.randomUUID() is undefined in insecure contexts (LAN-HTTP phone, older Safari) and throws. Use safeRandomUUID() from @/lib/safe-uuid — the crash-safe SoT.',
        },
      ],
    },
  },

  // ── Tenancy burn-down allowlist ──────────────────────────────────────────
  // The current known `DOGFOOD_ORG_ID` / `transitionalDogfoodOrgId()` callers. This
  // block turns OFF no-restricted-syntax ONLY for these files (they stay parsed
  // by tsParser from the block above and linted by every other rule). As each
  // file is refactored to thread ctx.organizationId, DELETE its entry here so
  // the guard starts enforcing it. When this list is empty, the debt is paid.
  // (z-index does not apply to these backend files, so disabling the whole rule
  // here is harmless.)
  {
    files: [
      'src/lib/tenancy/**/*.{ts,tsx}',
      'src/lib/ebay/browse-client.ts',
      'src/lib/integrations/credentials.ts',
      'src/app/api/auth/staff-picker/route.ts',
      'src/app/api/cron/zoho/orders-ingest-drain/route.ts',
      'src/lib/pipeline/orchestrator.ts',
      'src/lib/pipeline/collect.ts',
      'src/lib/zoho/fulfillment-sync.ts',
      'src/lib/realtime/publish.ts',
      'src/lib/jobs/google-sheets-transfer-orders.ts',
      // RELOCATED debt, not new debt: the order-ingest pipeline was extracted
      // out of google-sheets-transfer-orders.ts (above) into this writer. The
      // same four `transitionalDogfoodOrgId()` fallbacks moved with it — the
      // count did not grow. They exist because `ingestCanonicalOrders` still
      // takes `orgId?`, which is what selects the legacy raw-pool path for
      // un-migrated cron callers. Making `orgId` REQUIRED is the burn-down step
      // that retires this entry; it needs those callers migrated first.
      'src/lib/orders/ingest-canonical-orders.ts',
      'src/services/OrderSyncService.ts',
      // D1 (Ably org-namespacing) session-less integration publishers — these
      // carrier/Square/shipping-sync paths have no request org yet (single-tenant
      // USAV today); they resolve org from the row's organization_id post-Phase-B.
      'src/lib/shipping/publish-on-status-change.ts',
      'src/lib/neon/stock-ledger-helpers.ts',
      'src/app/api/webhooks/square/route.ts',
      'src/app/api/webhooks/ups/route.ts',
      'src/app/api/ecwid/transfer-orders/route.ts',
      'src/app/api/google-sheets/transfer-orders/route.ts',
      'src/app/api/shipping/track/sync-one/route.ts',
      // Bulk-added 2026-07-10: remaining pre-existing DOGFOOD_ORG_ID /
      // transitionalDogfoodOrgId() callers surfaced once `no-restricted-syntax`
      // started actually running in CI (previously masked because `next
      // lint` — removed in Next.js 16 — was silently a no-op, and disabled
      // Next-plugin rules referenced in stale eslint-disable comments were
      // erroring the whole run before reaching these files). Same debt as
      // the rest of this list, not new code — delete entries as refactored.
      'src/app/api/admin/po-gmail/create-zoho-draft/\\[id\\]/route.ts',
      'src/app/api/admin/po-gmail/triage/\\[id\\]/extract/route.ts',
      'src/app/api/auth/pin/create/route.ts',
      'src/app/api/auth/switch/route.ts',
      'src/app/api/ebay/refresh-tokens/route.ts',
      'src/app/api/ecwid/sync-exception-tracking/route.ts',
      'src/app/api/import-orders/route.ts',
      'src/app/api/locations/\\[barcode\\]/route.ts',
      'src/app/api/locations/\\[barcode\\]/swap/route.ts',
      'src/app/api/orders/add/route.ts',
      'src/app/api/orders/assign/route.ts',
      'src/app/api/post-multi-sn/route.ts',
      'src/app/api/receiving-entry/route.ts',
      'src/app/api/receiving-logs/route.ts',
      'src/app/api/receiving/po/\\[poId\\]/attach-box/route.ts',
      'src/app/api/receiving/zendesk-claim/link/route.ts',
      'src/app/api/repair-service/pickup/route.ts',
      'src/app/api/repair-service/repaired/route.ts',
      'src/app/api/repair-service/route.ts',
      'src/app/api/repair/actions/\\[id\\]/route.ts',
      'src/app/api/repair/actions/route.ts',
      'src/app/api/repair/submit/route.ts',
      'src/app/api/scan-tracking/route.ts',
      'src/app/api/shipped/scan-out/route.ts',
      'src/app/api/sku-stock/\\[sku\\]/route.ts',
      'src/app/api/sync-sheets/route.ts',
      'src/app/api/webhooks/fedex/route.ts',
      'src/app/api/webhooks/usps/route.ts',
      'src/app/api/webhooks/zoho/orders/route.ts',
      'src/app/api/zoho/orders/ingest/route.ts',
      'src/app/api/zoho/purchase-orders/receive/route.ts',
      'src/lib/billing/plan-feature-gate.ts',
      'src/lib/billing/studio-gate.ts',
      'src/lib/cron/for-each-org.ts',
      'src/lib/inventory/parts-sort.ts',
      'src/lib/inventory/state-machine.ts',
      'src/lib/neon/orders-tracking-queries.ts',
      'src/lib/po-gmail/client.ts',
      'src/lib/po-gmail/messages.ts',
      'src/lib/po-gmail/reconcile-run.ts',
      'src/lib/receiving/state-machine.ts',
      'src/lib/rma/authorizations.ts',
      'src/lib/shipping/shipstation/webhook.ts',
      'src/lib/sourcing/adapters/ebay.ts',
      'src/lib/sourcing/search.ts',
      'src/lib/sync-cursors.ts',
      'src/lib/sync/sheet-sync-common.ts',
      'src/lib/tracking-exceptions.ts',
      'src/lib/warranty/linkage.ts',
      'src/lib/warranty/mutations.ts',
      'src/lib/warranty/zendesk-link.ts',
      'src/lib/workflow/applyTransition.ts',
      'src/lib/zoho/core.ts',
      'src/lib/ecwid/client.ts',
      'src/lib/zoho/tenant-context.ts',
      'src/lib/zoho/webhooks/resolve-org.ts',
      // Added 2026-07-10 (USAV→cycleforge SoT merge): the Wave-3 org-require
      // refactor routed these session-less legacy paths through the explicit
      // transitionalDogfoodOrgId() service-org bridge, making the debt greppable
      // (see scripts/usav-fallback-guard.mjs allowlist — same ledger). Same
      // burn-down contract: delete each entry as it is refactored.
      'src/app/api/need-to-order/create-po/route.ts',
      'src/app/api/need-to-order/recalculate/route.ts',
      'src/lib/zoho.ts',
      // DOGFOOD TRANSITIONAL (token-SoT Phase 5 removes): capability checks
      // compare orgId against the dogfood org to allow its env-credential
      // bridge — a comparison, not a tenant fallback. Remove with the bridge.
      'src/lib/integrations/capability-connections.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  {
    files: ['**/*.test.*', '**/*.spec.*', 'tests/**/*'],
    // Tests are TypeScript — parse with tsParser so type annotations don't trip
    // the default (espree) parser when these files are linted directly.
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-console': 'off',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': 'warn',
      'no-restricted-syntax': 'off',
    },
  },
];
