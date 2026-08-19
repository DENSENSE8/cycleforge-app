/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    // Rewrites Tailwind v4's oklch() palette to hex and gives every resolvable
    // color-mix() a static rgba predecessor, so Chrome 109 — the newest build
    // Google shipped for Windows 7 — renders backgrounds instead of dropping
    // the declaration. Modern engines parse the later color-mix and win on
    // cascade order, so they are unaffected.
    //
    // Object form with a STRING path is the only shape Next accepts here; see
    // the plugin header for why it is CommonJS.
    './scripts/postcss/legacy-color-fallback.cjs': {},
  },
};

export default config;
