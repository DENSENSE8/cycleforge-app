/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    // Rewrites Tailwind v4's oklch() palette to hex and gives every resolvable
    // color-mix() a static rgba predecessor, so Chrome 109 (the newest build
    // Google ever shipped for Windows 7) still renders backgrounds instead of
    // dropping the declaration. Modern engines are unaffected — they parse the
    // later color-mix and win on cascade order. See the plugin header for the
    // measurements behind this.
    './scripts/postcss/legacy-color-fallback.mjs': {},
  },
};

export default config;
