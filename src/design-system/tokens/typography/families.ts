/**
 * Typeface stacks for Kinetic Ledger — ONE macro-family (IBM Plex), three cuts.
 *
 * `--font-ibm-plex-sans` / `--font-ibm-plex-condensed` / `--font-ibm-plex-mono`
 * are set by `next/font` on `<html>` (`src/lib/fonts.ts` + `app/layout.tsx`).
 * Fallbacks keep SSR / print / error shells readable if the var is missing.
 * These stacks mirror `src/styles/globals.css` byte-for-byte.
 *
 * Contextuality lives in WIDTH + role binding, not in a second foundry:
 *   sans      → display / title / body / data / caption
 *   condensed → eyebrow / micro — dense chrome, bound intrinsically by the
 *               `text-role-eyebrow` / `text-role-micro` utilities so 10–11px
 *               labels stay legible without wrapping a grid column
 *   mono      → identifiers (serial / FNSKU / tracking / SKU)
 *
 * The old `heading` / `display` / `label` slots were deleted 2026-07-28: all
 * three aliased the sans stack, so they were three names for one decision and a
 * standing invitation to fork a display face. Pick a ROLE, not a family.
 */
export const fontFamilies = {
  sans: "var(--font-ibm-plex-sans), 'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  condensed:
    "var(--font-ibm-plex-condensed), 'IBM Plex Sans Condensed', var(--font-ibm-plex-sans), 'IBM Plex Sans', system-ui, sans-serif",
  mono: "var(--font-ibm-plex-mono), 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export type FontFamilies = typeof fontFamilies;
