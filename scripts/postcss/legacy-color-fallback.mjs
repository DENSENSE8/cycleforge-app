/**
 * Legacy-colour fallback for Tailwind v4 output.
 *
 * WHY THIS EXISTS
 * Tailwind v4 emits its entire palette as `oklch()` and every `/opacity`
 * utility as `color-mix(in oklab, …)`. Both shipped in Chrome 111 / Safari
 * 16.4. Windows 7 caps at **Chrome 109** — Google shipped no newer build for
 * it — so those machines cannot parse either function. An unparseable value
 * invalidates the WHOLE declaration, so the element loses its background
 * entirely rather than degrading. `bg-blue-50` is the single most-used class
 * in this codebase (406 sites), which is why arrival/triage surfaces render
 * with no wash on the shop-floor PCs.
 *
 * Setting `browserslist` does NOT help: measured on this tree, Tailwind v4's
 * PostCSS plugin emits byte-identical CSS with and without targets (371,308
 * bytes, 532 oklch, 1,195 color-mix either way). It does not downlevel.
 *
 * WHAT IT DOES
 *   1. Rewrites every `oklch(L C H)` literal to its exact sRGB hex.
 *   2. For `color-mix(in oklab, var(--color-x) N%, transparent)`, inserts a
 *      static `rgba()` declaration BEFORE it. Old engines keep the rgba and
 *      drop the color-mix line they cannot parse; modern engines parse both
 *      and the later color-mix wins, so their rendering is unchanged.
 *
 * Run AFTER `@tailwindcss/postcss` — it rewrites that plugin's output.
 */

const OKLCH = /oklch\(\s*([\d.]+|none)%?\s+([\d.]+|none)\s+([\d.]+|none)(?:deg)?\s*\)/gi;
const CMIX = /color-mix\(\s*in\s+oklab\s*,\s*var\(\s*(--color-[a-z0-9-]+)\s*\)\s*([\d.]+)%\s*,\s*transparent\s*\)/gi;

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  });
}

const toHex = (rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');

/** `L` is a percentage in Tailwind's output (`97%`) but bare in some authored CSS. */
const normL = (raw, hadPct) => (hadPct ? Number(raw) / 100 : Number(raw));
/** `none` is CSS Color 4 for "no value here" — numerically zero for our purposes. */
const num = (raw) => (raw === 'none' ? 0 : Number(raw));

export default function legacyColorFallback() {
  return {
    postcssPlugin: 'legacy-color-fallback',
    OnceExit(root) {
      /** custom-property name -> [r,g,b], harvested as we rewrite the theme block. */
      const palette = new Map();

      // Pass 0 — palette entries already written as hex (`--color-white: #fff`)
      // never pass through the oklch rewrite, so harvest them directly or the
      // mixes that reference them stay unresolvable.
      root.walkDecls((decl) => {
        if (!decl.prop.startsWith('--color-')) return;
        const hex = decl.value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!hex) return;
        const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
        palette.set(decl.prop, [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
      });

      // Pass 1 — oklch() literals become hex, and we remember every palette var.
      root.walkDecls((decl) => {
        if (!decl.value.includes('oklch(')) return;
        decl.value = decl.value.replace(OKLCH, (m, l, c, h) => {
          const rgb = oklchToRgb(normL(l, m.includes('%')), num(c), num(h));
          if (decl.prop.startsWith('--color-')) palette.set(decl.prop, rgb);
          return toHex(rgb);
        });
      });

      // Pass 2 — give each resolvable color-mix() a static rgba predecessor.
      root.walkDecls((decl) => {
        if (!decl.value.includes('color-mix(')) return;
        let resolvable = true;
        const fallback = decl.value.replace(CMIX, (whole, varName, pct) => {
          const rgb = palette.get(varName);
          if (!rgb) { resolvable = false; return whole; }
          return `rgba(${rgb.join(', ')}, ${(Number(pct) / 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')})`;
        });
        // `currentcolor` and unknown vars cannot be resolved at build time; leave
        // those declarations alone rather than emit a wrong colour.
        if (!resolvable || fallback === decl.value) return;
        // A partially-resolved value would clone a color-mix the old engine
        // still cannot parse, so the fallback line would be dropped too.
        if (fallback.includes('color-mix(')) return;
        decl.cloneBefore({ value: fallback });
      });
    },
  };
}
legacyColorFallback.postcss = true;
