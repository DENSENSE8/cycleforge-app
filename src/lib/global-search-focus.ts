/** Dispatched to focus the active search field (⌘K / quick-access / re-click Search).
 *  Header launcher listens everywhere except `/search`, where SearchSidebarPanel owns focus. */
export const GLOBAL_SEARCH_FOCUS_EVENT = 'cf-global-search-focus';

export function dispatchGlobalSearchFocus(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_FOCUS_EVENT));
}
