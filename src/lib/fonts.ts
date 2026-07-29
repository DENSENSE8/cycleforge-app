import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from 'next/font/google';

/**
 * Kinetic Ledger type — IBM Plex (Carbon-adjacent) for dense ops rows.
 * CSS vars are stamped on `<html>` from `app/layout.tsx`; stacks live in
 * `design-system/tokens/typography/families.ts`.
 *
 * ONE macro-family, three cuts. Contextuality comes from WIDTH + role binding,
 * not from a second foundry:
 *   Sans       → display / title / body / data / caption
 *   Condensed  → eyebrow / micro (dense chrome — 10–11px stays legible without
 *                wrapping in a grid; bound intrinsically by `text-role-*`)
 *   Mono       → identifiers (serial / FNSKU / tracking / SKU)
 *
 * Weights stop at 600 on every cut. 700+ bleeds pixels at small sizes on the
 * 1080p warehouse monitors this UI lives on, and hierarchy here comes from
 * color contrast + tracking (Linear discipline), not from ink. Loading the
 * weight at all is what lets it drift back in — so it is not loaded.
 */
export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const ibmPlexSansCondensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-condensed',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});
