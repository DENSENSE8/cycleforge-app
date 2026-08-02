/**
 * Typeface stacks for Kinetic Ledger — three cuts, ONE face per cut.
 *
 * `--font-cf-sans` / `--font-ibm-plex-condensed` / `--font-ibm-plex-mono` are
 * set by `next/font` on `<html>` (`src/lib/fonts.ts` + `app/layout.tsx`).
 * Fallbacks keep SSR / print / error shells readable if the var is missing.
 * These stacks mirror `src/styles/globals.css` byte-for-byte.
 *
 *   sans      → display / title / body / data / caption      — **Inter**
 *   condensed → eyebrow / micro — dense chrome, bound intrinsically by the
 *               `text-role-eyebrow` / `text-role-micro` utilities so 10–11px
 *               labels stay legible without wrapping a grid column
 *   mono      → identifiers (serial / FNSKU / tracking / SKU)
 *
 * The sans cut moved from IBM Plex Sans to Inter on 2026-08-02 — a swap for
 * small-size legibility, not a second language. Rationale + why the other two
 * cuts stayed Plex: `src/lib/fonts.ts`.
 *
 * The var is named `--font-cf-sans`, deliberately foundry-neutral: the old
 * `--font-ibm-plex-sans` would now be a name that lies about what it holds,
 * which is the same class of defect as a tooltip advertising a shortcut it does
 * not own.
 *
 * The old `heading` / `display` / `label` slots were deleted 2026-07-28: all
 * three aliased the sans stack, so they were three names for one decision and a
 * standing invitation to fork a display face. Pick a ROLE, not a family — that
 * rule is unchanged by the swap.
 */
export const fontFamilies = {
  sans: "var(--font-cf-sans), 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  condensed:
    "var(--font-ibm-plex-condensed), 'IBM Plex Sans Condensed', var(--font-cf-sans), 'Inter', system-ui, sans-serif",
  mono: "var(--font-ibm-plex-mono), 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export type FontFamilies = typeof fontFamilies;
