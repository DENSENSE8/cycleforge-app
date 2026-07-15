'use client';

/**
 * Resolves the tech dashboard's right-pane mode from the `?view=` URL param.
 * Shipping mode's right pane is the Shipping workspace (Pending · FBA | History
 * via `?ship=`); `testing-history` is the tested-lines browse feed; anything
 * unrecognised falls through to the shipping workspace.
 * Extracted from TechDashboard; behaviour is unchanged.
 */

import { useSearchParams } from 'next/navigation';

export type TechRightViewMode = 'receiving' | 'testing' | 'testing-history' | 'history';

export interface TechRightView {
  rightViewMode: TechRightViewMode;
  isTestingHistory: boolean;
}

export function useTechRightView(): TechRightView {
  const searchParams = useSearchParams();
  const rawView = searchParams.get('view');
  const rightViewMode: TechRightViewMode =
    rawView === 'receiving'
      ? 'receiving'
      : rawView === 'testing'
        ? 'testing'
        : rawView === 'testing-history'
          ? 'testing-history'
          : 'history';
  return { rightViewMode, isTestingHistory: rightViewMode === 'testing-history' };
}
