'use client';

/**
 * URL → state for the Home ("/") mode router.
 *
 * `?mode=` is the single source of truth so a refresh / deep-link is preserved.
 * There is no `updateMode` here any more: writing the mode is the
 * DeskPageChrome tab / MasterNav job (`applyChildTarget` over the page's
 * `SIDEBAR_PAGE_NAV` entry), and a second writer is how a surface ends up with
 * two mode SoTs that disagree. This hook only reads.
 */

import { useSearchParams } from 'next/navigation';
import { parseHomeMode, type HomeMode } from './home-modes';

export function useHomeMode(): { mode: HomeMode } {
  const searchParams = useSearchParams();
  return { mode: parseHomeMode(searchParams.get('mode')) };
}
