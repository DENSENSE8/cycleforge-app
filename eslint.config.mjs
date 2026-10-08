import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import { builtinRules } from 'eslint/use-at-your-own-risk';

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

// FROZEN DEBT — SHRINK-ONLY (cf-mobile/no-truncated-record-text, owner
// 2026-10-03). Phone files that truncated record text when the guard landed;
// this list IS the baseline (the repo has no guard:accept). Fix a file (move
// it onto MobileRecordCard / wrapping text) → delete its entry. Never add an
// entry to dodge the rule.
const MOBILE_RECORD_TRUNCATION_FROZEN_DEBT = [
  'src/app/m/\\(immersive\\)/stock/\\[stockId\\]/photos/page.tsx',
  'src/app/m/\\(shell\\)/pick/\\[orderId\\]/_picker/PickerTaskCard.tsx',
  'src/app/m/\\(shell\\)/receiving/po/\\[poId\\]/item/\\[itemId\\]/page.tsx',
  'src/app/m/\\(shell\\)/receiving/po/\\[poId\\]/page.tsx',
  'src/app/m/\\(shell\\)/rs/\\[id\\]/photos/page.tsx',
  'src/app/m/\\(shell\\)/shipping/shipments/\\[shipmentId\\]/boxes/page.tsx',
  'src/components/mobile/customers/CustomerProfileScreen.tsx',
  'src/components/mobile/customers/CustomersScreen.tsx',
  'src/components/mobile/daily/MobileDailyRow.tsx',
  'src/components/mobile/daily/MobileDailyTicketSlider.tsx',
  'src/components/mobile/daily/MobileSharedTaskComposerSheet.tsx',
  'src/components/mobile/daily/MobileTaskFollowUps.tsx',
  'src/components/mobile/daily/MobileTaskMedia.tsx',
  'src/components/mobile/daily/MobileTaskMediaFeature.tsx',
  'src/components/mobile/daily/MobileTaskSections.tsx',
  'src/components/mobile/daily/MobileTaskSheet.tsx',
  'src/components/mobile/exceptions/MobileExceptionsHub.tsx',
  'src/components/mobile/exceptions/resolvers/PaperworkResolver.tsx',
  'src/components/mobile/exceptions/resolvers/ShipStationLabelSheet.tsx',
  'src/components/mobile/handling-units/HandlingUnitMemberRow.tsx',
  'src/components/mobile/handling-units/HandlingUnitV2Record.tsx',
  'src/components/mobile/location/LocationStockPositions.tsx',
  'src/components/mobile/orders/new/MobileCustomerStep.tsx',
  'src/components/mobile/orders/new/MobileOrderStep.tsx',
  'src/components/mobile/orders/new/MobileShippingStep.tsx',
  'src/components/mobile/orders/new/MobileTeamStep.tsx',
  'src/components/mobile/pair/MobilePairLocation.tsx',
  'src/components/mobile/pair/MobilePairQty.tsx',
  'src/components/mobile/pair/PairDetailSheet.tsx',
  'src/components/mobile/photos/MobilePackerPhotoStudio.tsx',
  'src/components/mobile/photos/MobileReceivingPhotoStudio.tsx',
  'src/components/mobile/photos/MobileUnitPhotoStudio.tsx',
  'src/components/mobile/picker/SetBinSheet.tsx',
  'src/components/mobile/picker/ShortPickSheet.tsx',
  'src/components/mobile/print/TotePrintRunFields.tsx',
  'src/components/mobile/products/MobileProductParcelCard.tsx',
  'src/components/mobile/products/MobileProductProfile.tsx',
  'src/components/mobile/products/MobileProducts.tsx',
  'src/components/mobile/products/MobileSkuLocations.tsx',
  'src/components/mobile/qc/PairUnitBinSheet.tsx',
  'src/components/mobile/qc/QcUnitRecord.tsx',
  'src/components/mobile/qc/UnitQcBench.tsx',
  'src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx',
  'src/components/mobile/receiving/MobileCartonSheet.tsx',
  'src/components/mobile/receiving/MobilePickupPaperworkScreen.tsx',
  'src/components/mobile/receiving/MobilePickupScreen.tsx',
  'src/components/mobile/receiving/MobileReceivingUnitRow.tsx',
  'src/components/mobile/repair/RepairBenchTimer.tsx',
  'src/components/mobile/repair/RepairCustomerPickerSheet.tsx',
  'src/components/mobile/repair/RepairLogWorkSheet.tsx',
  'src/components/mobile/repair/RepairPartField.tsx',
  'src/components/mobile/repair/RepairPickupSheet.tsx',
  'src/components/mobile/repair/RepairScanCompanion.tsx',
  'src/components/mobile/repair/RepairScanReadNotice.tsx',
  'src/components/mobile/repair/RepairStockBinPicker.tsx',
  'src/components/mobile/reports/MobilePackerReport.tsx',
  'src/components/mobile/scan/MobileScanHeader.tsx',
  'src/components/mobile/session/MobileCurrentSession.tsx',
  'src/components/mobile/shipping/shipment/ShipmentResolveSheet.tsx',
  'src/components/mobile/station/MobileCameraPanel.tsx',
  'src/components/mobile/triage/TriageRow.tsx',
  'src/components/mobile/v2/MobileV2ActionSheet.tsx',
  'src/components/mobile/v2/fulfillment/MobileV2FulfillmentOrders.tsx',
  'src/components/mobile/v2/orders/MobileV2OrderPaperworkSheet.tsx',
  'src/components/mobile/v2/receiving/MobileV2ReceivingCartonRecord.tsx',
  'src/components/mobile/v2/scan/MobileV2ScanRecentList.tsx',
  'src/components/mobile/v2/settings/MobileV2SettingsList.tsx',
  'src/components/mobile/v2/stock/MobileV2LocationRecord.tsx',
  'src/components/mobile/v2/stock/MobileV2StockLocations.tsx',
];

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
      // `framer-motion` is the retired package name of Motion (not installed).
      // Motion itself (`motion/react`, `motion-plus/react`) is free to import
      // anywhere — motion rules were abolished (owner 2026-09-27).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'framer-motion', message: 'framer-motion is retired — import from motion/react.' },
          ],
          patterns: [
            { regex: '^framer-motion/', message: 'framer-motion is retired — import from motion/react.' },
          ],
        },
      ],
    },
  },

  {
    files: ['scripts/**/*', 'src/lib/pipeline/**/*'],
    rules: {
      'no-console': 'off',
    },
  },

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
        {
          // ONE resolver owns the AI endpoint — `resolveOrgAiConfig(orgId,
          // capability)`. `src/lib/ai/provider.ts` is the only legal env
          // reader and is exempted by a rule-OFF block further down, never by
          // a second `no-restricted-syntax` declaration.
          selector:
            'MemberExpression[object.object.name="process"][object.property.name="env"][property.name=/^(HERMES_API_URL|HERMES_MODEL|HERMES_API_KEY|AI_MODEL|AI_CHAT_BASE_URL|AI_CHAT_MODEL|AI_CHAT_API_KEY|ANTHROPIC_API_KEY)$/]',
          message:
            'Do not read an AI endpoint from env. Resolve it with resolveOrgAiConfig(orgId, capability) — src/lib/ai/provider.ts is the only legal env reader (the platform-default leaf).',
        },
        // ── Mode law (docs/design-system/HANDOFF-mode-governance-2.md, Phase D) ──
        // Homes that may do these things are exempted by the rule-OFF blocks
        // below ("Mode-law homes"); pre-existing violators sit in the
        // "Mode-law burn-down" list. Never a second declaration of this rule.
        {
          selector: "JSXAttribute[name.name='className'] Literal[value=/rounded-none/]",
          message:
            'Literal `rounded-none` is mode-blind. Use the mode rung (`rounded-mode` / `rounded-mode-control` / `rounded-mode-pill`) — the Floor renders square through the mode, not a hard-coded corner. See DESIGN_SYSTEM.md § Task modes.',
        },
        {
          selector: "JSXAttribute[name.name='className'] TemplateElement[value.raw=/rounded-none/]",
          message:
            'Literal `rounded-none` is mode-blind. Use the mode rung (`rounded-mode` / `rounded-mode-control` / `rounded-mode-pill`) — the Floor renders square through the mode, not a hard-coded corner. See DESIGN_SYSTEM.md § Task modes.',
        },
        {
          selector: "MemberExpression[property.name='vibrate']",
          message:
            'Haptics go through src/lib/scan-feedback (`vibrateScan` / `vibratePress`) so the org master switch and per-staff toggles apply.',
        },
        {
          selector:
            'NewExpression[callee.name=/^(webkit)?AudioContext$/], MemberExpression[property.name=/^(webkit)?AudioContext$/]',
          message:
            'Scan tones go through src/lib/scan-feedback (`playScanTone`) — one AudioContext, one settings switch.',
        },
        {
          selector: "JSXOpeningElement[name.name='ModeRegion']",
          message:
            'Modes are declared once per route in src/lib/routing/mode-registry.ts (applied by RouteModeRegion). A nested/portal ModeRegion is a reviewed exception — see DESIGN_SYSTEM.md § Task modes.',
        },
        {
          selector:
            "ImportDeclaration[source.value='react-dom'] > ImportSpecifier[imported.name='createPortal'], MemberExpression[object.name='ReactDOM'][property.name='createPortal']",
          message:
            'Raw portals escape the mode region and the overlay stack. Use a design-system layer (`AnchoredLayer`, the Radix `Sheet`, `RightPaneOverlay`, Dialog) — portals live only in src/design-system and src/components/ui.',
        },
        {
          selector:
            "ImportDeclaration[source.value=/^@radix-ui\\/react-(popover|dropdown-menu|hover-card|tooltip)$/]",
          message:
            'Import the wrapped primitive (`@/components/ui/popover`, `@/design-system/primitives/DropdownMenu`, `HoverTooltip`, `AnchoredLayer`) — raw Radix overlays live only in src/design-system and src/components/ui.',
        },
        // ── Height reveals (2026-09-27) ──────────────────────────────────────
        // A hand-rolled height animation leaves the parent's gap / its own
        // margin outside the animated box, so it snaps on mount and unmount
        // (the order card's quick-look "hiccup"). Collapse measures that
        // spacing and moves it inside the height; it builds its shapes as
        // module constants, so it never trips these selectors.
        {
          selector:
            "JSXAttribute[name.name=/^(initial|animate|exit)$/] ObjectExpression > Property[key.name='height'], Property[key.name=/^(initial|animate|exit)$/] > ObjectExpression > Property[key.name='height']",
          message:
            'Animate height only through <Collapse open> / <CollapseItem> (src/design-system/components/Collapse.tsx). A hand-rolled height animation leaves the parent gap and its own margin outside the animated box, so the layout snaps when it mounts and unmounts.',
        },
        // ── Sidebar-only page navigation (owner 2026-09-28) ────────────────
        // AST ancestry, not source text: controls nested under the immediate
        // page body of DeskPageLayout are page navigation and belong in
        // SIDEBAR_PAGE_NAV + NAV_PAGE_DECLS.
        {
          selector:
            "JSXElement:has(> JSXOpeningElement[name.name='DeskPageLayout']) > JSXElement JSXOpeningElement[name.name=/^(TabSwitch|TableTabs|SegmentedControl)$/]",
          message:
            'Page views live in ContextualSidebar. Declare the view in SIDEBAR_PAGE_NAV and NAV_PAGE_DECLS; do not render TabSwitch, TableTabs, or SegmentedControl inside a DeskPageLayout page body.',
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
      'src/lib/pipeline/orchestrator.ts',
      'src/lib/pipeline/collect.ts',
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

  // ── Mode-law homes ───────────────────────────────────────────────────────
  // The places the mode-law selectors (merged block above) exist to point AT.
  // Rule-OFF for the whole file, same shape as the tenancy burn-down: this
  // also drops the tenancy / brand / randomUUID selectors in these trees —
  // an accepted tradeoff of keeping ONE no-restricted-syntax declaration.
  //   · src/design-system + src/components/ui — own portals, Radix, ModeRegion
  //   · src/lib/scan-feedback — owns navigator.vibrate + AudioContext
  //   · src/app/shipping/layout.tsx — the Floor/triage ModeRegion switch
  {
    files: [
      'src/design-system/**/*.{ts,tsx}',
      'src/components/ui/**/*.{ts,tsx}',
      'src/lib/scan-feedback/**/*.{ts,tsx}',
      'src/app/shipping/layout.tsx',
    ],
    // Mirror the merged block's ignore — tokens are not linted as TS.
    ignores: ['src/design-system/tokens/**'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // ── Mode-law burn-down ───────────────────────────────────────────────────
  // Pre-existing violators when the mode-law selectors landed (2026-09-27).
  // Grouped by the selector they trip; a file may appear in several groups.
  // Fix a file's violation → delete it from THAT group. When a file leaves
  // every group, the guard enforces it. Never add a new entry to dodge a rule.
  {
    files: [
      // Kept in-component / portal ModeRegions (reviewed exceptions, not debt):
      // a Sheet / Dialog / popover portals out of the route region, or a
      // component owns a nested mode plane. New ones need review.
      'src/components/assistant/ChatPrintJobCard.tsx',
      'src/components/mobile/fnsku/FnskuStationSheet.tsx',
      'src/components/mobile/orders/MobileOrderEvidenceSheet.tsx',
      'src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx',
      'src/components/mobile/repair/RepairCustomerPickerSheet.tsx',
      'src/components/mobile/repair/RepairInfoEditSheet.tsx',
      'src/components/mobile/repair/RepairPickupSheet.tsx',
      'src/components/mobile/repair/RepairStatusSheet.tsx',
      'src/components/mobile/repair/ScanValueField.tsx',
      'src/components/mobile/scan/ProvisionalCreateSheet.tsx',
      'src/components/mobile/shipping/shipment/ShipmentResolveSheet.tsx',
      'src/components/mobile/unit/UnitLineSheets.tsx',
      'src/components/mobile/unit/UnitSheetParts.tsx',
      // Header chrome sits outside the page's RouteModeRegion; re-resolves it.
      'src/components/outbound/fulfilled/ResolveShipmentExceptionDialog.tsx',
      'src/components/outbound/orders/LinkLabelDialog.tsx',
      'src/components/outbound/orders/OrderLabelEntries.tsx',
      'src/components/outbound/orders/paperwork/PaperworkWalkHost.tsx',
      'src/components/right-rail/RightRailHost.tsx',
      'src/components/receiving/ReceivingLedgers.tsx',
      'src/components/ui/command.tsx',
      // Raw `createPortal` outside src/design-system + src/components/ui.
      'src/components/admin/access/AddRolePopover.tsx',
      'src/components/boot/WelcomeHost.tsx',
      'src/components/boot/WelcomeReplayButton.tsx',
      'src/components/kiosk/KioskFloatingPhoneKeypad.tsx',
      'src/components/mobile/redesign/ItemCardRow.tsx',
      'src/components/mobile/station/MobilePackerSpamCamera.tsx',
      'src/components/mobile/station/MobileSwipePhotoViewer.tsx',
      'src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx',
      'src/components/providers/SiteTooltipProvider.tsx',
      'src/components/receiving/workspace/CartonAddPopover.tsx',
      'src/components/receiving/workspace/SerialCard.tsx',
      'src/components/receiving/workspace/line-edit/PhotoPeekFan.tsx',
      'src/components/repair/RepairIntakeHost.tsx',
      'src/components/settings/sections/KioskAttractMediaCard.tsx',
      'src/components/shipped/photo-gallery/PhotoViewerPortal.tsx',
      'src/components/sidebar/contextual/NavGoKeys.tsx',
      'src/components/sidebar/rail-shell/RailPopover.tsx',
      'src/features/operations/components/DataSourcePopover.tsx',
      // Direct Radix popover / dropdown-menu / hover-card / tooltip imports.
      'src/components/photos/PhotoLibraryFindRow.tsx',
      'src/components/receiving/workspace/line-edit/LabelEditPopover.tsx',
      'src/components/session/composer/AccessModeSwitch.tsx',
      'src/components/session/composer/ContextUsageRing.tsx',
      'src/components/identity/StaffAccountMenu.tsx',
      // Literal `rounded-none` in a className (Phase D2 / per-file burn-down).
      // src/app entries are here because the merged block covers all of src.
      'src/app/m/\\(shell\\)/h/\\[id\\]/page.tsx',
      'src/app/m/\\(shell\\)/pick/\\[orderId\\]/_picker/PickerTaskCard.tsx',
      'src/app/m/\\(shell\\)/pick/\\[orderId\\]/page.tsx',
      'src/app/m/\\(shell\\)/receiving/po/\\[poId\\]/item/\\[itemId\\]/page.tsx',
      'src/app/m/\\(shell\\)/receiving/po/\\[poId\\]/page.tsx',
      'src/app/settings/ai/page.tsx',
      'src/app/settings/integrations/IntegrationCard.tsx',
      'src/app/settings/integrations/\\[provider\\]/IntegrationDetailClient.tsx',
      'src/app/settings/integrations/diagnostics/page.tsx',
      'src/components/admin/AccessSidebarPanel.tsx',
      'src/components/admin/AdminLogsTab.tsx',
      'src/components/admin/FBAManagementTab.tsx',
      'src/components/admin/FavoritesManagementTab.tsx',
      'src/components/admin/GoalsAnalyticsTab.tsx',
      'src/components/admin/PhotoAnalysisProviderPanel.tsx',
      'src/components/admin/PhotosPlatformPanel.tsx',
      'src/components/admin/QualityDashboardTab.tsx',
      'src/components/admin/SystemSyncActivityTab.tsx',
      'src/components/admin/access/cards/CredentialsCard.tsx',
      'src/components/admin/access/cards/LandingPageCard.tsx',
      'src/components/admin/nas-folders/NasAddressPanel.tsx',
      'src/components/admin/nas-folders/NasWorkflowsPanel.tsx',
      'src/components/admin/nas-folders/StationFoldersPanel.tsx',
      'src/components/admin/roles/role-editor/RoleMembersCard.tsx',
      'src/components/admin/roles/role-editor/RolePermissionsSection.tsx',
      'src/components/admin/sourcing/BoseModelsManagementTab.tsx',
      'src/components/admin/staff-management/AvailabilityRulesSection.tsx',
      'src/components/barcode/multi-sku/MultiSkuWorkspaceCards.tsx',
      'src/components/fba/FbaBoardDetailPanel.tsx',
      'src/components/fba/FbaStateShells.tsx',
      'src/components/fba/board-detail/FbaDeleteControl.tsx',
      'src/components/fba/board-detail/PlanEntryCard.tsx',
      'src/components/fba/shared/FbaStatusBadge.tsx',
      'src/components/fba/sidebar/FbaQtySplitPopover.tsx',
      'src/components/fba/sidebar/FbaSidebarRails.tsx',
      'src/components/fba/sidebar/FbaTrackingBucket.tsx',
      'src/components/fba/sidebar/FbaTrackingBundleCard.tsx',
      'src/components/fba/sidebar/FbaUnallocatedBucket.tsx',
      'src/components/fba/sidebar/active-shipments/ActiveShipmentCard.tsx',
      'src/components/fba/sidebar/shipment-editor/FnskuSearchModal.tsx',
      'src/components/fba/sidebar/shipment-editor/UnallocatedDropZone.tsx',
      'src/components/labels/LabelTypeSelect.tsx',
      'src/components/labels/LabelsProductsWorkspace.tsx',
      'src/components/labels/unit-detail/UnitDetailWorkspace.tsx',
      'src/components/labels/unit-detail/cards.tsx',
      'src/components/layout/goal-chip/GoalPanelHomeCta.tsx',
      'src/components/layout/goal-chip/TaskList.tsx',
      'src/components/layout/goal-chip/ThrowTaskRow.tsx',
      'src/components/mobile/ScanSurface.tsx',
      'src/components/mobile/photos/MobilePackerPhotoStudio.tsx',
      'src/components/mobile/picker/ShortPickSheet.tsx',
      'src/components/mobile/picker/directed/DirectedPickNotesSheet.tsx',
      'src/components/mobile/receiving/MobilePhotoCountBadge.tsx',
      'src/components/mobile/receiving/MobileReceivingPhotoStrip.tsx',
      'src/components/mobile/receiving/ReceivingShareToPhoneSheet.tsx',
      'src/components/mobile/redesign/MobileShell.tsx',
      'src/components/mobile/redesign/ScanInput.tsx',
      'src/components/mobile/station/MobilePackerSpamCamera.tsx',
      'src/components/packer/PackFbaScanCard.tsx',
      'src/components/packer/PackPapersStatusCard.tsx',
      'src/components/packer/UnitPackPhotoPeek.tsx',
      'src/components/packing/OrderPackChecklist.tsx',
      'src/components/packing/PackChecklistLineRow.tsx',
      'src/components/products/ProductDetail.tsx',
      'src/components/products/pairing/product-hub/ChannelManualAdd.tsx',
      'src/components/products/pairing/product-hub/ManualPairForm.tsx',
      'src/components/receiving/PreboxWizard.tsx',
      'src/components/receiving/unbox/UnboxPreviewLock.tsx',
      'src/components/receiving/unfound/ecwid-search/ecwid-search-rows.tsx',
      'src/components/receiving/workspace/BulkQuantityPanel.tsx',
      'src/components/receiving/workspace/claim/components/ClaimBackupStep.tsx',
      'src/components/receiving/workspace/claim/components/ClaimPhotoPicker.tsx',
      'src/components/receiving/workspace/claim/components/ClaimTemplateEditor.tsx',
      'src/components/receiving/workspace/claim/components/ClaimTicketReply.tsx',
      'src/components/receiving/workspace/line-edit/NoSerialControl.tsx',
      'src/components/receiving/workspace/line-edit/UnfoundMatchStrip.tsx',
      'src/components/repair/ProductSelector.tsx',
      'src/components/repair/RepairPaperworkSheet.tsx',
      'src/components/right-rail/RightRailHost.tsx',
      'src/components/scan/ScanHotkeyControl.tsx',
      'src/components/settings/PrintPreferences.tsx',
      'src/components/settings/sections/AiProviderOrderCard.tsx',
      'src/components/settings/sections/AppearanceSection.tsx',
      'src/components/settings/sections/CatalogSection.tsx',
      'src/components/settings/sections/KioskAttractMediaCard.tsx',
      'src/components/settings/sections/OrganizationSection.tsx',
      'src/components/settings/sections/QuickAccessSection.tsx',
      'src/components/settings/sections/SecuritySection.tsx',
      'src/components/settings/sections/SupportVisionLaneCard.tsx',
      'src/components/settings/sections/WorkspaceSwitcher.tsx',
      'src/components/shipped/OrderDocumentsSection.tsx',
      'src/components/shipped/details-panel/OrderAssignDisplayHost.tsx',
      'src/components/shipped/details-panel/OrderStationHandoff.tsx',
      'src/components/shipping/ShipmentStatusBadge.tsx',
      'src/components/shipping/shipped-filter/ShippedCarrierFilters.tsx',
      'src/components/shipping/shipped-filter/ShippedFilterControls.tsx',
      'src/components/sidebar/receiving/incoming-details/EbayTab.tsx',
      'src/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel.tsx',
      'src/components/sku/BinStockNumpadSheet.tsx',
      'src/components/sku/LocationDetailView.tsx',
      'src/components/sku/SkuDetailView.tsx',
      'src/components/sku/sku-detail/SkuDetailCards.tsx',
      'src/components/sku/sku-detail/SkuLocationCard.tsx',
      'src/components/sku/sku-detail/SkuStockCard.tsx',
      'src/components/station/PackScanColumn.tsx',
      'src/components/station/displays/StationLookDisplayHost.tsx',
      'src/components/station/entity-context/CartonContextCard.tsx',
      'src/components/station/scan-bar/StationScanBar.tsx',
      'src/components/station/workbench/StationWorkspaceSkeleton.tsx',
      'src/components/support/voice/VoicemailDetail.tsx',
      'src/components/support/zendesk/claim/ClaimTicketPicker.tsx',
      'src/components/tech/ActiveOrderWorkspace.tsx',
      'src/components/tech/shipping/ShippingSkuSerialRows.tsx',
      'src/components/tech/sku-testing/ChecklistStepRow.tsx',
      'src/components/tech/sku-testing/ManualPicker.tsx',
      'src/components/tech/sku-testing/ManualsSection.tsx',
      'src/components/tech/sku-testing/NoCatalogNotice.tsx',
      'src/components/tech/testing-panel/TestingScanSessionFeedback.tsx',
      'src/components/walk-in/WalkInHistoryHub.tsx',
      'src/components/warehouse/RackDetailView.tsx',
      'src/components/warehouse/WarehouseFloorPlan.tsx',
      'src/components/warehouse/room-detail/RoomDetailPieces.tsx',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // ── AI provider consolidation: ONE resolver owns the endpoint ──────────────
  // `resolveOrgAiConfig(orgId, capability)` is the only way to learn where an
  // AI call goes. hermes-client.ts (the env-only twin) was deleted; this stops
  // its vars growing a second reader, which is the shape that let the modern
  // AI_CHAT_* set look configured while the legacy path ignored it.
  // provider.ts is the platform-default leaf and is the ONE legal env reader.
  //
  // ANTHROPIC_API_KEY was added after Phase 4 found the assistant agent loop
  // reading it directly — a single-tenant brain that the first sweep missed
  // because it named a different var, not because it was a different mistake.
  //
  // THE SELECTOR LIVES IN THE MERGED BLOCK ABOVE. It used to sit in its own
  // `{ files: ['src/**/*.ts','src/**/*.tsx'], rules: { 'no-restricted-syntax': … } }`
  // block, which — same rule, same glob, later in the array — OVERRODE the
  // shared one instead of merging with it, silently disabling the tenancy,
  // brand and crypto.randomUUID selectors repo-wide. Found 2026-09-15 by
  // mutation-testing the Id-header rule: a violation linted clean while this
  // one selector was the only guard still firing. That is precisely the trap
  // the shared block's header comment describes; it is left here as a marker
  // so nobody re-splits it.
  //
  // provider.ts keeps its exemption below, as a rule-OFF entry (the same shape
  // the tenancy burn-down list uses) rather than a second declaration.
  {
    files: ['src/lib/ai/provider.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // ── Mobile record text never truncates (owner 2026-10-03) ─────────────────
  // Nothing that identifies or describes a record is truncated, clamped or
  // ellipsized on a phone: records are MobileRecordCard cards whose text
  // wraps. This is the core no-restricted-syntax implementation registered
  // under its OWN name (`cf-mobile/no-truncated-record-text`) on purpose:
  // re-declaring `no-restricted-syntax` for these files would OVERRIDE the
  // merged block above (the trap its header describes), and the rule-OFF
  // burn-down blocks for that rule would silently switch this guard off too.
  {
    files: ['src/components/mobile/**/*.tsx', 'src/app/m/**/*.tsx'],
    ignores: [
      '**/*.test.*',
      // PERMANENT: top-bar / app-switcher chrome titles are the only owner
      // exemption — a one-line chrome title is navigation, not a record.
      'src/components/mobile/v2/MobileV2TopBar.tsx',
      'src/components/mobile/v2/MobileV2DetailTopBar.tsx',
      'src/components/mobile/v2/MobileV2AppSwitcher.tsx',
      ...MOBILE_RECORD_TRUNCATION_FROZEN_DEBT,
    ],
    plugins: {
      'cf-mobile': { rules: { 'no-truncated-record-text': builtinRules.get('no-restricted-syntax') } },
    },
    rules: {
      'cf-mobile/no-truncated-record-text': [
        'error',
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(^|[\\s:!])(truncate|text-ellipsis|line-clamp-(?!none))/]",
          message:
            'Mobile record text never truncates (owner 2026-10-03): no truncate / line-clamp-* / text-ellipsis. Show records as MobileRecordCard (src/design-system/components/MobileRecordCard.tsx) — every slot wraps; tap drills into the detail. See docs/mobile-first/V2_ARCHITECTURE.md "Record display law".',
        },
        {
          selector:
            "JSXAttribute[name.name='className'] TemplateElement[value.raw=/(^|[\\s:!])(truncate|text-ellipsis|line-clamp-(?!none))/]",
          message:
            'Mobile record text never truncates (owner 2026-10-03): no truncate / line-clamp-* / text-ellipsis. Show records as MobileRecordCard (src/design-system/components/MobileRecordCard.tsx) — every slot wraps; tap drills into the detail. See docs/mobile-first/V2_ARCHITECTURE.md "Record display law".',
        },
      ],
    },
  },

  // ── Bottom action buttons float (owner 2026-10-03) ────────────────────────
  // "Bottom buttons ... should have bottom padding. It should never display
  // with a white background. It should just be floating sticky buttons." A
  // class string that pins a band to the bottom edge (`sticky`/`fixed` +
  // `bottom-0`) AND paints a ground under it (`bg-*` other than transparent,
  // or a `border-t` rule) is the banned grounded bar. Verbs ride DetailDock
  // (phone) / StickyActionBar (desk); a bespoke band composes ACTION_DOCK_TOP_GAP
  // + ACTION_DOCK_LIFT with opaque buttons. Matches Literal AND TemplateElement
  // anywhere (class constants live in .ts files). Own plugin name so the merged
  // no-restricted-syntax block above is not overridden. The ignores are
  // PERMANENT and only for pinned surfaces that are NOT verb bands; never add
  // a file to dodge the law — the primitives pass with no ignore.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.*',
      // INPUT SURFACE: the ticket reply composer (textarea + send) — a mouth, not a verb band.
      'src/components/mobile/ticket/MobileTicketReplyDock.tsx',
      // INPUT SURFACE: the AI composer dock's fade-to-canvas behind the prompt field.
      'src/design-system/ai/classes.ts',
      // NON-ACTION CHROME: a report table's pinned totals row (tfoot).
      'src/components/session/artifacts/ReportArtifact.tsx',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'cf-ui': { rules: { 'no-grounded-bottom-bar': builtinRules.get('no-restricted-syntax') } },
    },
    rules: {
      'cf-ui/no-grounded-bottom-bar': [
        'error',
        {
          selector:
            "Literal[value=/^(?=.*(^|\\s)(sticky|fixed)(\\s|$))(?=.*(^|\\s)bottom-0(\\s|$))(?=.*(^|\\s)(bg-(?!transparent)|border-t(\\s|$|-)))/]",
          message:
            'Bottom action buttons float (owner 2026-10-03): never a grounded bottom bar — no bg fill, no border-t rule under sticky/fixed bottom-0. Use DetailDock (phone) or StickyActionBar (desk); a bespoke band composes ACTION_DOCK_TOP_GAP + ACTION_DOCK_LIFT (src/design-system/tokens/dock-clearance.ts) with opaque buttons and FLOATING_ACTION_DISABLED_FACE.',
        },
        {
          selector:
            "TemplateElement[value.raw=/^(?=.*(^|\\s)(sticky|fixed)(\\s|$))(?=.*(^|\\s)bottom-0(\\s|$))(?=.*(^|\\s)(bg-(?!transparent)|border-t(\\s|$|-)))/]",
          message:
            'Bottom action buttons float (owner 2026-10-03): never a grounded bottom bar — no bg fill, no border-t rule under sticky/fixed bottom-0. Use DetailDock (phone) or StickyActionBar (desk); a bespoke band composes ACTION_DOCK_TOP_GAP + ACTION_DOCK_LIFT (src/design-system/tokens/dock-clearance.ts) with opaque buttons and FLOATING_ACTION_DISABLED_FACE.',
        },
      ],
    },
  },

  // ── Hotkeys are disclosed on HOVER, never painted inline (owner 2026-10-03) ─
  // "The D for done, the A for alert must not be displayed in line — it must be
  // displayed [as a] hotkey on hover." A control's key shows only in its hover
  // tooltip (`HoverTooltip shortcut`, `DeskHeaderAction label shortcut`), a
  // hover key card (`KeyHintPopover`), or a surface the staffer SUMMONS to
  // learn keys (`?` cheat sheet / `?` reveal, HotkeyScrim, Settings › Keyboard,
  // the G-leader HUD). Only those owners may import a keycap face. Own rule
  // names (not no-restricted-imports / no-restricted-syntax) so the global
  // framer-motion and tenancy blocks are not overridden. Never add a file to
  // this list to dodge the law: route the key into a tooltip instead.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.*',
      // The keycap faces themselves + the barrels that re-export them.
      'src/design-system/primitives/KeyboardKey.tsx',
      'src/design-system/primitives/ChordKeys.tsx',
      'src/design-system/primitives/index.ts',
      'src/design-system/index.ts',
      // Hover: the tooltip chip and its hotkey variant; the hover key card + G HUD.
      'src/design-system/primitives/TooltipChip.tsx',
      'src/components/ui/HotkeyTooltip.tsx',
      'src/components/sidebar/contextual/NavGoKeys.tsx',
      // Summoned to learn keys: `?` cheat sheet, `?` reveal overlays, the scrim, Settings › Keyboard.
      'src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx',
      'src/design-system/primitives/HotkeyScrim.tsx',
      'src/components/tables/TableStatusBar.tsx',
      'src/design-system/components/record-action-strip/RecordActionStrip.tsx',
      // Danger zone: every danger verb painted in full with its key (operator 2026-10-08).
      'src/design-system/components/danger-zone/DangerZone.tsx',
      'src/components/settings/sections/KeyboardSection.tsx',
      // Leader HUDs painted only after the staffer presses the leader (C, Y, held Shift, G) — summoned, never at rest.
      'src/components/layout/GlobalHeaderAdd.tsx',
      'src/components/layout/GlobalHeaderSync.tsx',
      'src/components/layout/HeaderCenter.tsx',
      'src/components/sidebar/contextual/NavKeyStrip.tsx',
      // A key-binding editor: the bound key is the control's VALUE, not a hint.
      'src/components/scan/ScanHotkeyControl.tsx',
      // Owner 2026-10-06 exception: the Quality control station paints its verdict keys
      // (P / T / F) inside the Fail · Test again · Pass buttons and the Pass dock CTA.
      'src/components/receiving/workspace/TestingStatusPills.tsx',
      'src/design-system/primitives/SlicedActionDock.tsx',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'cf-keys': {
        rules: {
          'hotkey-on-hover': builtinRules.get('no-restricted-imports'),
          'no-raw-kbd': builtinRules.get('no-restricted-syntax'),
        },
      },
    },
    rules: {
      'cf-keys/hotkey-on-hover': [
        'error',
        {
          patterns: [
            {
              regex: '(^@/design-system/primitives|/primitives)(/(index|KeyboardKey|ChordKeys))?$',
              importNames: ['KeyboardKey', 'KeyboardChord', 'ChordKeys'],
              message:
                'Hotkeys are disclosed on hover, never painted inline (owner 2026-10-03). Put the key in the control\'s HoverTooltip `shortcut` (or DeskHeaderAction `label` + `shortcut`, or KeyHintPopover) — see design-system/pinned.json "KeyboardKey".',
            },
          ],
        },
      ],
      'cf-keys/no-raw-kbd': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='kbd']",
          message:
            'No hand-rolled <kbd>: hotkeys are disclosed on hover (HoverTooltip `shortcut`), never painted inline (owner 2026-10-03).',
        },
      ],
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
