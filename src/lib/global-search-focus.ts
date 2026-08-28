/** Dispatched to open header Find / ⌘K ({@link CommandBar}). Same surface as
 *  the right-rail search icon. The chord itself stays owned by CommandBar. */
export const GLOBAL_SEARCH_FOCUS_EVENT = 'cf-global-search-focus';

export function dispatchGlobalSearchFocus(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_FOCUS_EVENT));
}
