import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed, Inter } from 'next/font/google';

/**
 * Kinetic Ledger type — **Inter** for the sans cut, IBM Plex for the two specialist cuts.
 * **Exception — mono 700 (owner 2026-09-25, BRIEF §4 industrial):** industrial
 */
export const cfSans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-cf-sans',
  display: 'swap',
});

/** Inter's REAL italic cut, loaded for ONE consumer: */
export const cfSansItalic = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['italic'],
  variable: '--font-cf-sans-italic',
  display: 'swap',
  preload: false,
});

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
