'use client';

/**
 * Resolves the tech dashboard's right-pane mode from the `?view=` URL param.
 * Shipping mode's right pane is the Shipping workspace (Pending · FBA | History
 * via `?ship=`); `view=testing` is the Testing workspace (Pending · Returns |
 * History via `?testTab=`); anything unrecognised falls through to shipping.
 * Legacy `view=testing-history` is treated as testing (proxy redirects to
 * `view=testing`).
 */

import { useSearchParams } from 'next/navigation';

export type TechRightViewMode = 'receiving' | 'testing' | 'history';

export interface TechRightView {
  rightViewMode: TechRightViewMode;
  isTestingMode: boolean;
}

export function useTechRightView(): TechRightView {
  const searchParams = useSearchParams();
  const rawView = searchParams.get('view');
  const rightViewMode: TechRightViewMode =
    rawView === 'receiving'
      ? 'receiving'
      : rawView === 'testing' || rawView === 'testing-history'
        ? 'testing'
        : 'history';
  return { rightViewMode, isTestingMode: rightViewMode === 'testing' };
}
