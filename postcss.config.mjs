import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Plugin path is ABSOLUTE, derived from this file's own location.
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
 * `import.meta.url` is this file, and this file sits at the project root, so
 * the path holds for every bundler and every cwd — unlike `process.cwd()`,
 * which follows wherever the command was invoked from.
 */
const legacyColorFallback = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
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
