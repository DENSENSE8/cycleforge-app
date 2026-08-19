import path from 'node:path';

/**
 * Plugin path is ABSOLUTE, derived from the project root at load time.
 *
 * Next requires postcss plugins be named by string (it rejects a function:
 * "must be provided as a string"), and then `require()`s that string. A
 * RELATIVE string breaks under Turbopack: it inlines this config into
 * `.next/dev/build/postcss.js` and resolves `./scripts/...` against that
 * chunk's directory, so dev died with "Cannot find module
 * './scripts/postcss/legacy-color-fallback.cjs'". Webpack happened to resolve
 * it from the project root, which is why `next build` passed and only
 * `next dev --turbopack` broke.
 *
 * `import.meta.url` does NOT work here either: Turbopack rewrites this module
 * into `.next/dev/build/`, so it reports the INLINED location and the path
 * resolved to `.next/scripts/postcss/...`. `process.cwd()` is the project root
 * for both `next dev` and `next build` — Next requires being run from the
 * project root — and it is not rewritten by bundling.
 */
const legacyColorFallback = path.join(
  process.cwd(),
  'scripts/postcss/legacy-color-fallback.cjs',
);

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    // Rewrites Tailwind v4's oklch() palette to hex and gives every resolvable
    // color-mix() a static rgba predecessor, so Chrome 109 — the newest build
    // Google shipped for Windows 7 — renders backgrounds instead of dropping
    // the declaration. Modern engines parse the later color-mix and win on
    // cascade order, so they are unaffected.
    [legacyColorFallback]: {},
  },
};

export default config;
