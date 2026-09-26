'use client';

/** Resolves the tech dashboard's right-pane mode from the `?view=` URL param. */

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
