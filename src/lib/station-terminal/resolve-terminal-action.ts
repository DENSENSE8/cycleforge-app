/** Resolve the terminal kind key for (mode, tab). */

import { getTerminalSlice } from './registry';
import type { ResolveTerminalKindInput } from './types';

export function resolveTerminalKind(input: ResolveTerminalKindInput): string | null {
  const slice = getTerminalSlice(input.mode);
  const tabId = input.tabId?.trim() || null;

  let kind: string | undefined;
  if (tabId && Object.prototype.hasOwnProperty.call(slice.tabs, tabId)) {
    kind = slice.tabs[tabId];
  } else if (!slice.hasSectionTabs || !tabId) {
    kind = slice.defaultKind;
  } else {
    // Unknown tab — fall back to default if present, else hide.
    kind = slice.defaultKind;
  }

  if (kind == null || kind === 'none') return null;
  return kind;
}
