/** Typeface stacks: one readable interface face and one identifier face. */
export const fontFamilies = {
  sans: "var(--font-cf-sans), 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "var(--font-ibm-plex-mono), 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

type FontFamilies = typeof fontFamilies;
