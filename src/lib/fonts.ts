import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed, Inter } from 'next/font/google';

/**
 * Kinetic Ledger type — **Inter** for the sans cut, IBM Plex for the two specialist cuts.
 * **Exception — mono 700:**
 */
export const cfSans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  // Normal AND italic in ONE query: a second Inter() call for the italic cut
  // made Turbopack's font import map carry two entries for the family and the
  // whole app failed to compile from a cold .next ("next/font/google queries
  // have exactly one entry", 2026-09-30).
  style: ['normal', 'italic'],
  variable: '--font-cf-sans',
  display: 'swap',
});

/** Kept as an alias: the italic cut now rides {@link cfSans}. */
export const cfSansItalic = cfSans;

export const ibmPlexSansCondensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-condensed',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

/** ## The spine has no cut of its own */
