'use client';

/**
 * Quick look (Space) on an import card — only what the card face leaves out,
 * in the To-ship quick look's face. Enter opens the full record.
 */

import type { ReactNode } from 'react';
import { CollapseItem } from '@/design-system/components/Collapse';
import { cn } from '@/utils/_cn';

/** One fact; `null` value = the record has none, so it is not painted. */
export type ImportPeekFact = readonly [label: string, value: ReactNode, wide?: boolean];

export function ImportCardPeek({ facts, testId }: { facts: readonly ImportPeekFact[]; testId: string }) {
  const shown = facts.filter(([, value]) => value != null && value !== '');
  return (
    // A child of the card's AnimatePresence; Collapse moves the card body's gap inside the animated height.
    <CollapseItem data-testid={testId} className="pt-1">
      <div className="rounded-xl bg-surface-sunken/70 p-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 @xl/card:grid-cols-4">
          {shown.map(([label, value, wide]) => (
            <div key={label} className={cn('min-w-0', wide && 'col-span-2 @xl/card:col-span-4')}>
              <dt className="text-role-caption text-text-faint">{label}</dt>
              <dd className="break-words text-role-nav text-text-default">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </CollapseItem>
  );
}
