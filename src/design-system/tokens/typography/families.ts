/** Typeface stacks for Kinetic Ledger — three cuts, ONE face per cut. */
export const fontFamilies = {
  sans: "var(--font-cf-sans), 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  condensed:
    "var(--font-ibm-plex-condensed), 'IBM Plex Sans Condensed', var(--font-cf-sans), 'Inter', system-ui, sans-serif",
  mono: "var(--font-ibm-plex-mono), 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

type FontFamilies = typeof fontFamilies;
