/** Typeface stacks: Inter is the only family; `mono` names the identifier
 *  role (tabular figures, no ligatures — src/app/globals.css), not a face. */
export const fontFamilies = {
  sans: "var(--font-cf-sans), 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "var(--font-cf-sans), 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

type FontFamilies = typeof fontFamilies;
