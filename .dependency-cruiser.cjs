/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Circular dependencies make refactors painful.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'info',
      comment: 'Orphan modules are usually dead code.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$',
          'next-env\\.d\\.ts$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-test',
      comment: 'App code should not reach into test files.',
      severity: 'error',
      from: { pathNot: '\\.(spec|test)\\.(js|mjs|cjs|ts|ls|coffee|litcoffee|coffee\\.md)$' },
      to: { path: '\\.(spec|test)\\.(js|mjs|cjs|ts|ls|coffee|litcoffee|coffee\\.md)$' },
    },
    {
      name: 'no-deprecated-core',
      comment: "Don't use deprecated Node core modules.",
      severity: 'warn',
      from: {},
      to: { dependencyTypes: ['deprecated'] },
    },
    {
      name: 'design-system-stays-generic',
      comment:
        'design-system must stay context-free: it should not import app/feature/domain code ' +
        '(components, hooks, lib, app, features, queries, services, contexts, data). ' +
        'Shared UI that needs app context belongs in components/ui instead. ' +
        'Currently `warn` because ~35 pre-existing violations exist (Icons barrel, a few ' +
        'mis-filed feature components); see COMPONENT_DEDUP_PLAN.md. Drive these to zero, ' +
        'then raise severity to `error`.',
      severity: 'warn',
      from: { path: '^src/design-system' },
      to: { path: '^src/(components|hooks|lib|app|features|queries|services|contexts|data)(/|$)' },
    },
    {
      name: 'use-the-sheet-not-the-scroll-shell',
      severity: 'error',
      comment:
        'Compose WorkbenchSheetView (the three-band assembly). DashboardScrollShell is an ' +
        'internal part — feature routes that import it are hand-rolling a custom car. ' +
        'Documented exceptions (Unbox / Unbox skeleton / Photo library) are different tasks; ' +
        'reasons live in workbench-sheet-view.test.ts OUT_OF_COHORT.',
      from: {
        pathNot:
          '(^src/components/dashboard/WorkbenchSheetView\\.tsx$)|(^src/components/dashboard/DashboardScrollShell\\.tsx$)|(^src/components/receiving/unbox/UnboxWorkspaceView\\.tsx$)|(^src/components/receiving/unbox/UnboxWorkbenchSkeleton\\.tsx$)|(^src/components/photos/PhotoLibraryPage\\.tsx$)',
      },
      to: { path: '^src/components/dashboard/DashboardScrollShell\\.tsx$' },
    },
    {
      name: 'use-the-scan-host-not-the-utility-rail',
      severity: 'error',
      comment:
        'ScanStationUtilityRail is internal to StationScanPaneHost. Import the host, not the rail.',
      from: { pathNot: '^src/components/station/workbench/' },
      to: { path: '^src/components/station/workbench/ScanStationUtilityRail\\.tsx$' },
    },
    {
      name: 'use-the-panel-root-not-the-ambient-wash',
      severity: 'error',
      comment:
        'StationAmbientWash is internal to StationPanelRoot / StationWorkbench. Compose those hosts — do not copy the 3-blob wash.',
      from: { pathNot: '^src/components/station/workbench/' },
      to: { path: '^src/components/station/workbench/StationAmbientWash\\.tsx$' },
    },
    {
      name: 'no-retired-order-warranty-section',
      severity: 'error',
      comment:
        'OrderWarrantySection is retired. Compose OrderWarrantySummary ' +
        '(density="pane" for the exclusive order tab).',
      from: {},
      to: { path: '^src/components/shipped/details-panel/OrderWarrantySection\\.tsx$' },
    },
    {
      name: 'no-retired-rack-numeric-step',
      severity: 'error',
      comment:
        'rack-printer/NumericStep is retired. Compose NumericStep from ' +
        'bin-label-printer (prefix optional).',
      from: {},
      to: { path: '^src/components/barcode/rack-printer/NumericStep\\.tsx$' },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', '\\.next', 'dist', 'out', 'coverage', 'electron', 'scripts'],
    },
    exclude: {
      path: [
        '^node_modules',
        '^\\.next',
        '^dist',
        '^out',
        '^coverage',
        '^electron',
        '^public',
        '^scripts',
        '\\.test\\.(ts|tsx|js|jsx|mjs)$',
        '\\.spec\\.(ts|tsx|js|jsx|mjs)$',
      ],
    },
    includeOnly: '^src',
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      archi: {
        collapsePattern: '^(src/[^/]+)',
      },
      dot: {
        collapsePattern: '^src/(app|components|lib|domain)/[^/]+',
      },
    },
  },
};
