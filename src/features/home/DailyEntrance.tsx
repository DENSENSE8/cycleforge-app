'use client';

import type { ReactNode } from 'react';

/**
 * Daily's content boundary. The former sign-in welcome hand-off animation was
 * removed: Daily is immediately ready to scan and never withholds content.
 */
export interface DailyEntranceProps {
  children: ReactNode;
}

export function DailyEntrance({ children }: DailyEntranceProps) {
  return <div className="flex h-full min-h-0 w-full min-w-0 flex-col">{children}</div>;
}
