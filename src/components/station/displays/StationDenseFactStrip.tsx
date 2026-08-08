'use client';

/**
 * Station Action Plane — dense fixed-column fact strip.
 *
 * Spatial lock: every fact stays in the same grid cell; empty paints `—`.
 * Composed by Inventory PO header and future Displays leaves.
 * Law: source-of-truth.md → Station Action vs Context planes.
 */

import type { ReactNode } from 'react';
import { Copy as CopyIcon } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { isSearchOrderFactEmpty } from '@/components/order-record/order-fact-presence';

type StationDenseFact = {
  label: string;
  value: ReactNode;
  /** When set, shows a flush copy control on the value. */
  copyValue?: string | null;
  mono?: boolean;
};

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* clipboard may be unavailable — silent */
  }
}

export function StationDenseFactStrip({
  facts,
  columns = 4,
  className,
  'data-testid': testId = 'station-dense-fact-strip',
}: {
  facts: StationDenseFact[];
  /** Immutable column count — keeps eye position stable across loads. */
  columns?: 2 | 3 | 4 | 5;
  className?: string;
  'data-testid'?: string;
}) {
  const colClass =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-3'
        : columns === 5
          ? 'grid-cols-5'
          : 'grid-cols-4';

  return (
    <dl
      className={cn(
        'grid gap-x-3 gap-y-2 border border-border-hairline bg-surface-canvas px-2 py-1.5',
        cornerClass('flush'),
        colClass,
        className,
      )}
      data-testid={testId}
    >
      {facts.map((fact) => {
        const empty = isSearchOrderFactEmpty(fact.value);
        return (
          <div key={fact.label} className="min-w-0">
            <dt className="text-role-eyebrow uppercase tracking-wider text-text-soft">
              {fact.label}
            </dt>
            <dd
              className={cn(
                'mt-0.5 flex min-w-0 items-start gap-1 break-words text-role-caption font-semibold text-text-default',
                fact.mono && 'font-mono tabular-nums',
                empty && 'text-text-faint',
              )}
            >
              <span className="min-w-0 flex-1">{empty ? '—' : fact.value}</span>
              {fact.copyValue ? (
                <HoverTooltip label={`Copy ${fact.label}`} asChild>
                  <IconButton
                    onClick={() => void copyText(fact.copyValue!)}
                    className="shrink-0"
                    size="sm"
                    ariaLabel={`Copy ${fact.label}`}
                    icon={<CopyIcon className="h-3 w-3" />}
                  />
                </HoverTooltip>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
