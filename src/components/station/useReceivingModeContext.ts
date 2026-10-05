'use client';

/** The receiving-lines table's URL state for the page it is on — `readReceivingModeState` over the live pathname + params. */

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReceivingModeContext } from '@/lib/receiving/receiving-modes';
import { readReceivingModeState, type ReceivingModeState } from '@/lib/receiving/receiving-mode-state';

export function useReceivingModeContext(): ReceivingModeState {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const state = readReceivingModeState(pathname, searchParams);
  // Keyed on its VALUE so the query key / params stay referentially stable
  // across unrelated param changes (`openLine`, a status cut) and re-renders.
  const contextKey = JSON.stringify(state.modeContext);
  const modeContext = useMemo(() => JSON.parse(contextKey) as ReceivingModeContext, [contextKey]);
  return { ...state, modeContext };
}
