/**
 * Typeface stacks for Kinetic Ledger.
 *
 * `--font-ibm-plex-sans` / `--font-ibm-plex-mono` are set by `next/font` on
 * `<html>` (`src/lib/fonts.ts` + `app/layout.tsx`). Fallbacks keep SSR / print
 * / error shells readable if the var is missing.
 */
export const fontFamilies = {
  sans: "var(--font-ibm-plex-sans), 'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  heading: "var(--font-ibm-plex-sans), 'IBM Plex Sans', system-ui, sans-serif",
  display: "var(--font-ibm-plex-sans), 'IBM Plex Sans', system-ui, sans-serif",
  /** Same face as sans — one family at dense sizes beats a geometric label fork. */
  label: "var(--font-ibm-plex-sans), 'IBM Plex Sans', system-ui, sans-serif",
  mono: "var(--font-ibm-plex-mono), 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export type FontFamilies = typeof fontFamilies;
