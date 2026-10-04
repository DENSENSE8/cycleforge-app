import { IBM_Plex_Mono, Inter } from 'next/font/google';

/**
 * CycleForge type — Inter for interface language and IBM Plex Mono only for
 * exact identifiers (SKU, serial, tracking and order numbers).
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

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

/** ## The spine has no cut of its own */
