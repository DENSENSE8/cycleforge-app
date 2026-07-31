import type { KnipConfig } from 'knip';

/**
 * Knip configuration for dead code / unused export detection.
 *
 * Run:
 *   npx knip
 *   npx knip --reporter compact
 *   npx knip --reporter json > reports/knip-report.json
 *
 * See docs/DEAD_CODE_CLEANUP_PLAN.md for usage in the broader hygiene effort.
 */
const config: KnipConfig = {
  entry: [
    // Main app surfaces
    'src/app/**/*.ts',
    'src/app/**/*.tsx',
    'src/app/**/route.ts',

    // Mobile PWA entry (important — many mobile components are reached here)
    'src/app/m/**/*.ts',
    'src/app/m/**/*.tsx',

    // Pipeline entry points
    'src/lib/pipeline/orchestrator.ts',

    // Scripts that are part of the production surface (cron, workers, etc.)
    'scripts/realtime-outbox-relay.js',
    'scripts/run-pending-migrations.mjs',
  ],
  project: ['src/**/*.{ts,tsx}'],

  // Things we deliberately do not want to treat as dead right now
  ignore: [
    'src/**/*.test.*',
    'src/**/*.spec.*',
    'src/types/**',
    'src/lib/migrations/**',

    // Explicitly transitional / experimental / demo (see plan)
    'src/app/design-demo/**',

    // Old receiving mode implementations — being triaged
    'src/components/receiving/Mode1BulkScan.tsx',
    'src/components/receiving/Mode2Unboxing.tsx',
    'src/components/receiving/Mode3LocalPickup.tsx',

    // Large historical one-off components (triage in progress)
    'src/components/DocxUploader.tsx',
    'src/components/StaffSelector.tsx',
    'src/components/TechSearchPanel.tsx',

    // JIT pack Phase 3 — manual→documents projection (wired next; keep SoT file)
    'src/lib/documents/manual-documents.ts',
  ],

  ignoreDependencies: [
    '@types/*',
    // Keep these even if currently unused — they are part of the dev/CI surface
    'knip',
    'dependency-cruiser',
    'eslint-plugin-unused-imports',
    '@playwright/test',
    // Lighthouse audit tooling — consumed by scripts/lighthouse-audit.mjs and
    // ANALYZE=true builds (next.config.ts), which sit outside knip's `project`
    // globs. See docs/performance/LIGHTHOUSE.md.
    'lighthouse',
    'chrome-launcher',
    '@next/bundle-analyzer',
  ],

  // Be stricter about exports in the future (uncomment after baseline clean)
  // rules: {
  //   exports: 'error',
  //   types: 'warn',
  // },
};

export default config;
