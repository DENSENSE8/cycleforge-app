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

    // Mid-wire WIP (My Day grid + Order rail) — imported once composition lands;
    // keep SoT files out of the dead-code gate until the mount is reviewed.
    'src/features/my-day/MyDaySidebarPanel.tsx',
    'src/features/my-day/MyDayTaskInspector.tsx',
    'src/features/my-day/useMyDayView.ts',
    'src/features/my-day/grid/**',
    'src/lib/my-day/my-day-grid-layout.ts',
    'src/lib/my-day/my-day-tasks.ts',
    'src/lib/work-orders/work-status-display.ts',

    // Mid-wire WIP (photo aspect helpers) — ASPECTS_BY_STAGE is already composed
    // from photo-aspects; remaining helpers mount next.
    'src/lib/photos/photo-aspects.ts',
    'src/lib/receiving/photo-aspect-counts.ts',

    // Guided ProcedureDeck / step bodies / step dock — parked on `unbox-work`
    // (`../cycleforge-unbox`). Main dogfood mounts PO lines + label instead.
    // Keep DS + step vocabulary on main for checklist/ring + guards; ignore
    // the unmounted centre-deck surface and its private face helpers.
    'src/design-system/components/procedure/ProcedureDeck.tsx',
    'src/components/receiving/workspace/line-edit/steps/**',
    'src/components/receiving/workspace/line-edit/UnboxStepDock.tsx',

    // Mid-canvas right-edge sliced action — SoT file; Triage/Unbox mount lands
    // next (not inside StationContextBar moreDetails).
    'src/components/station/entity-context/StationRightEdgeAction.tsx',

    // Mid-wire WIP (dense motion primitives) — files exist beside the barrel;
    // first consumer mounts next. Keep SoT out of the dead-code gate.
    'src/design-system/motion/ActionFlash.tsx',
    'src/design-system/motion/DenseList.tsx',
    'src/design-system/motion/DenseRowReveal.tsx',
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
    // The motion engine is imported as `motion/react` from the single boundary
    // file `src/design-system/motion/framer.ts`. `framer-motion` is the legacy
    // alias for the SAME v12 package (and `motion`'s own dependency), kept as a
    // direct dep so `pnpm why framer-motion` — the dual-major canary in
    // `motion-major.guard.test.ts` — has a stable anchor.
    'framer-motion',
  ],

  // Be stricter about exports in the future (uncomment after baseline clean)
  // rules: {
  //   exports: 'error',
  //   types: 'warn',
  // },
};

export default config;
