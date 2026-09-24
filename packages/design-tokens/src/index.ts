/**
 * @cycleforge/design-tokens — the single source of every colour, size and
 * duration the CycleForge surfaces share across platforms.
 *
 *   web      imports this package (src/design-system/** re-exports it)
 *   desktop  generated/tokens.css   (`pnpm tokens:build`)
 *   iOS      generated/DesignTokens.swift
 *   tooling  generated/tokens.json  (design-mcp)
 *
 * The generated files are committed; `pnpm tokens:check` (verify gate
 * `Design tokens`) fails when any of them drifts from this source.
 */
export * from './primitives';
export * from './state';
export * from './lifecycle';
export * from './intake';
export * from './light';
export * from './modes';
