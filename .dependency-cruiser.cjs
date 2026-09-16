/**
 * Boundary law, executable — ARCHITECTURE.md "Component split (binding)".
 *
 * Two forbidden directions (2026-09-14 audit):
 *   1. mobile → desktop surface components   (src/components/mobile + src/app/m
 *      may import only the platform layer + logic, never desktop feature dirs)
 *   2. desktop → mobile components           (desktop consumes the /m SoT by
 *      embedding the frame, never by importing mobile internals)
 *
 * Sanctioned platform layer (ARCHITECTURE.md rule 2 + identity amendment,
 * 2026-09-14): components/ui, components/Icons, components/identity,
 * components/providers, components/error. Everything under src/design-system
 * is outside src/components and therefore always sanctioned. Logic
 * (src/lib, src/hooks, src/contexts, src/utils) is outside these rules.
 *
 * Type-only imports count as crossings (ARCHITECTURE.md rule 3) — hence
 * tsPreCompilationDeps below.
 *
 * Violations are EXPECTED today: the frozen baseline lives in
 * scripts/boundary-exemptions.ts (shrink-only). This config states the LAW;
 * scripts/boundary-guard.ts applies the RATCHET.
 */
module.exports = {
  forbidden: [
    {
      name: 'mobile-no-desktop-surface-components',
      comment:
        'ARCHITECTURE.md rule 2 — /m surfaces never import desktop feature components; shared domain vocab/types/hooks belong in src/lib or packages/shared.',
      severity: 'error',
      from: { path: '^src/(components/mobile|app/m)(/|$)' },
      to: {
        path: '^src/components/',
        pathNot: [
          '^src/components/mobile',
          '^src/components/ui/',
          '^src/components/Icons',
          '^src/components/identity/',
          '^src/components/providers/',
          '^src/components/error/',
        ],
      },
    },
    {
      name: 'desktop-no-mobile-components',
      comment:
        'ARCHITECTURE.md rule 2 — desktop consumes the mobile SoT by embedding the /m frame (SURFACE_LAW §4), never by importing mobile internals.',
      severity: 'error',
      from: { path: '^src/(components/(?!mobile)|app/(?!m(/|$)))' },
      to: { path: '^src/components/mobile' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
