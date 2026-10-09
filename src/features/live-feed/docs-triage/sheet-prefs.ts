/**
 * The docs sheet remembers, per staffer on this browser, whether the order
 * rail was folded, the tab last open and the owed filter (operator
 * 2026-10-06; filter 2026-10-09). Storage that is missing, full, blocked or
 * holding garbage reads as the defaults and never throws.
 */

import { DOC_TABS, type DocTab } from './doc-tabs';
import { isRailFilter, type RailFilter } from './sheet-model';

export interface SheetPrefs {
  railFolded: boolean;
  /** The tab last open; null = never opened here. */
  tab: DocTab | null;
  /** Which orders the rail and the grid show. */
  filter: RailFilter;
}

export const DEFAULT_SHEET_PREFS: SheetPrefs = { railFolded: false, tab: null, filter: 'all' };

const KEY_PREFIX = 'cf.live-feed.docs-sheet.v1:';

export function parseSheetPrefs(raw: string | null): SheetPrefs {
  if (!raw) return DEFAULT_SHEET_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof SheetPrefs, unknown>> | null;
    const filter = value?.filter;
    return {
      railFolded: value?.railFolded === true,
      tab: DOC_TABS.find((tab) => tab === value?.tab) ?? null,
      filter: isRailFilter(filter) ? filter : 'all',
    };
  } catch {
    return DEFAULT_SHEET_PREFS;
  }
}

export function readSheetPrefs(staffId: number | null | undefined): SheetPrefs {
  if (staffId == null || typeof window === 'undefined') return DEFAULT_SHEET_PREFS;
  try {
    return parseSheetPrefs(window.localStorage.getItem(`${KEY_PREFIX}${staffId}`));
  } catch {
    return DEFAULT_SHEET_PREFS;
  }
}

/** Remember one or more prefs; the rest keep what is stored. */
export function writeSheetPrefs(staffId: number | null | undefined, patch: Partial<SheetPrefs>): void {
  if (staffId == null || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${staffId}`, JSON.stringify({ ...readSheetPrefs(staffId), ...patch }));
  } catch {
    // Private mode / quota: the sheet still works, it just does not remember.
  }
}
