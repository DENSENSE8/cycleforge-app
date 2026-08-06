/** Dispatched to hand focus to the active search field (re-click Search, or a
 *  surface that wants to delegate to it). On `/search` without `?sel=`,
 *  `SearchFindStage` owns focus; elsewhere `GlobalHeaderSearch` owns it.
 *
 *  NOT a ⌘K path — that chord opens the CommandBar palette and has exactly one
 *  owner (`src/components/layout/cmdk-owner.guard.test.ts`). */
export const GLOBAL_SEARCH_FOCUS_EVENT = 'cf-global-search-focus';

export function dispatchGlobalSearchFocus(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_FOCUS_EVENT));
}
