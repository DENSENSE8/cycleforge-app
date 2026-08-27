'use client';

/**
 * Station Action Plane — dense fact band.
 *
 * Two layouts (pick by surface):
 *   - `rows` (default for Displays Action / Inventory Information) — one
 *     horizontal label|value row per fact. WMS muscle-memory: scan down the
 *     label column, read values on the trailing edge. Empty paints `—`.
 *   - `strip` — fixed multi-column label-above-value cells for wide desk
 *     Incoming mirrors. Never use `strip` inside Station Displays leaves.
 *
 * Read facts are coplanar with the Displays `bg-surface-card` host — hairline
 * dividers only. Never `bg-surface-canvas` / `bg-surface-sunken` as a fact-list
 * wash; sunken depth-indent is exclusive to `DenseComposeBodyBand` (notes ·
 * claim create/edit).
 *
 * Law: source-of-truth.md → Station Action vs Context planes · Spatial
 * predictability (locked triage boxes).
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

function FactValue({
  fact,
  align = 'start',
}: {
  fact: StationDenseFact;
  align?: 'start' | 'end';
}) {
  const empty = isSearchOrderFactEmpty(fact.value);
  return (
    <dd
      className={cn(
        // items-center — copy glyph must sit on the caption baseline, not a
        // taller sm IconButton that dwarfs the value (Information Reference #).
        'flex min-w-0 items-center gap-0.5 break-words text-role-caption font-semibold text-text-default',
        fact.mono && 'font-mono tabular-nums',
        empty && 'text-text-faint',
        align === 'end' && 'justify-end text-end',
      )}
    >
      <span className="min-w-0">{empty ? '—' : fact.value}</span>
      {fact.copyValue ? (
        <HoverTooltip label={`Copy ${fact.label}`} asChild>
          <IconButton
            onClick={() => void copyText(fact.copyValue!)}
            className="shrink-0"
            size="xs"
            ariaLabel={`Copy ${fact.label}`}
            icon={<CopyIcon className="h-2.5 w-2.5" aria-hidden />}
          />
        </HoverTooltip>
      ) : null}
    </dd>
  );
}

export function StationDenseFactStrip({
  facts,
  layout = 'rows',
  columns = 4,
  className,
  'data-testid': testId = 'station-dense-fact-strip',
}: {
  facts: StationDenseFact[];
  /**
   * `rows` — WMS horizontal label|value stack (Displays Action SoT).
   * `strip` — multi-column label-above-value (desk Incoming only).
   */
  layout?: 'rows' | 'strip';
  /** Strip layout only — immutable column count for eye-position lock. */
  columns?: 2 | 3 | 4 | 5;
  className?: string;
  'data-testid'?: string;
}) {
  if (layout === 'rows') {
    return (
      <dl
        className={cn(
          'divide-y divide-border-hairline border border-border-hairline',
          cornerClass('flush'),
          className,
        )}
        data-testid={testId}
        data-fact-layout="rows"
      >
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex min-w-0 items-baseline justify-between gap-3 px-2 py-1.5"
            data-station-dense-fact-row=""
          >
            <dt className="shrink-0 text-role-eyebrow uppercase tracking-wider text-text-soft">
              {fact.label}
            </dt>
            <FactValue fact={fact} align="end" />
          </div>
        ))}
      </dl>
    );
  }

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
        'grid gap-x-3 gap-y-2 border border-border-hairline px-2 py-1.5',
        cornerClass('flush'),
        colClass,
        className,
      )}
      data-testid={testId}
      data-fact-layout="strip"
    >
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-role-eyebrow uppercase tracking-wider text-text-soft">
            {fact.label}
          </dt>
          <FactValue fact={fact} align="start" />
        </div>
      ))}
    </dl>
  );
}
