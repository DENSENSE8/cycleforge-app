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
            'Raw portals escape the mode region and the overlay stack. Use a design-system layer (`AnchoredLayer`, `BottomSheet`, `RightPaneOverlay`, Dialog) — portals live only in src/design-system and src/components/ui.',
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
      // a BottomSheet / Dialog / popover portals out of the route region, or a
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
      'src/components/layout/LiveSyncIndicator.tsx',
      'src/components/outbound/label-intake/LabelIntakeDesk.tsx',
      'src/components/outbound/orders/LinkLabelDialog.tsx',
      'src/components/outbound/orders/OrderLabelEntries.tsx',
      'src/components/outbound/orders/paperwork/PaperworkWalkHost.tsx',
      'src/components/right-rail/RightRailHost.tsx',
      'src/components/shipped/ledger/ResolveShipmentExceptionDialog.tsx',
      'src/components/station/ReceivingLinesTable.tsx',
      'src/components/ui/command.tsx',
      // Raw `createPortal` outside src/design-system + src/components/ui.
      'src/components/admin/access/AddRolePopover.tsx',
      'src/components/board/SwimlaneBoard.tsx',
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
      'src/components/station/StationHistoryTable.tsx',
      'src/features/operations/components/DataSourcePopover.tsx',
      // Direct Radix popover / dropdown-menu / hover-card / tooltip imports.
      'src/components/board/SwimlaneBoard.tsx',
      'src/components/outbound/labels/AddTrackingPopover.tsx',
      'src/components/photos/PhotoLibraryFindRow.tsx',
      'src/components/receiving/workspace/line-edit/LabelEditPopover.tsx',
      'src/components/session/composer/AccessModeSwitch.tsx',
      'src/components/session/composer/ContextUsageRing.tsx',
      'src/components/sidebar/master-nav/StaffAccountFooter.tsx',
      // Literal `rounded-none` in a className (Phase D2 / per-file burn-down).
      // src/app entries are here because the merged block covers all of src.
      'src/app/m/\\(shell\\)/h/\\[id\\]/page.tsx',
      'src/app/m/\\(shell\\)/pick/\\[orderId\\]/_picker/PickerTaskCard.tsx',
      'src/app/m/\\(shell\\)/pick/\\[orderId\\]/page.tsx',
      'src/app/m/\\(shell\\)/receiving/po/\\[poId\\]/item/\\[itemId\\]/page.tsx',
      'src/app/m/\\(shell\\)/receiving/po/\\[poId\\]/page.tsx',
      'src/app/settings/ai/page.tsx',
      'src/app/settings/audit/page.tsx',
      'src/app/settings/integrations/IntegrationCard.tsx',
      'src/app/settings/integrations/\\[provider\\]/IntegrationDetailClient.tsx',
      'src/app/settings/integrations/diagnostics/page.tsx',
      'src/app/settings/staff/StaffTable.tsx',
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
      'src/components/dashboard/GettingStartedChecklist.tsx',
      'src/components/fba/FbaBoardDetailPanel.tsx',
      'src/components/fba/FbaStateShells.tsx',
      'src/components/fba/StationFbaInput.tsx',
      'src/components/fba/board-detail/FbaDeleteControl.tsx',
      'src/components/fba/board-detail/PlanEntryCard.tsx',
      'src/components/fba/shared/FbaStatusBadge.tsx',
      'src/components/fba/sidebar/FbaCatalogSidebar.tsx',
      'src/components/fba/sidebar/FbaFnskuScanToast.tsx',
      'src/components/fba/sidebar/FbaQtySplitPopover.tsx',
      'src/components/fba/sidebar/FbaSidebarRails.tsx',
      'src/components/fba/sidebar/FbaTrackingBucket.tsx',
      'src/components/fba/sidebar/FbaTrackingBundleCard.tsx',
      'src/components/fba/sidebar/FbaUnallocatedBucket.tsx',
      'src/components/fba/sidebar/FbaWorkspaceSidebar.tsx',
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
      'src/components/mobile/packer/MobilePackingRow.tsx',
      'src/components/mobile/packer/MobilePackingSheet.tsx',
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
      'src/components/settings/sections/KioskDevicesSection.tsx',
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
      'src/components/sidebar/OperationsSidebarPanel.tsx',
      'src/components/sidebar/receiving/incoming-details/EbayTab.tsx',
      'src/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel.tsx',
      'src/components/sidebar/receiving/incoming/IncomingReturnsImportStagingHost.tsx',
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
      'src/components/walk-in/SalesHistoryTable.tsx',
      'src/components/walk-in/WalkInHistoryHub.tsx',
      'src/components/warehouse/LabelPrintWorkspace.tsx',
      'src/components/warehouse/RackDetailView.tsx',
      'src/components/warehouse/WarehouseFloorPlan.tsx',
      'src/components/warehouse/room-detail/RoomDetailPieces.tsx',
      'src/components/warranty/WarrantyClaimsTable.tsx',
      'src/components/warranty/WarrantyCoverageCard.tsx',
      'src/components/warranty/WarrantyQuotesSection.tsx',
      'src/features/review/packer/PackerReviewMode.tsx',
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
