'use client';

/** Inline Ecwid product / repair-order search. */

import { useEcwidProductSearch } from './ecwid-search/useEcwidProductSearch';
import { EcwidSearchHeader } from './ecwid-search/EcwidSearchHeader';
import { EcwidSearchInputs } from './ecwid-search/EcwidSearchInputs';
import { EcwidResultsList } from './ecwid-search/EcwidResultsList';
import type { EcwidProductSearchPopoverProps } from './ecwid-search/ecwid-search-shared';

export type {
  EcwidProductSelection,
  EcwidProductPopoverMode,
  EcwidOrderScope,
} from './ecwid-search/ecwid-search-shared';

interface EcwidProductSearchInlineProps extends EcwidProductSearchPopoverProps {
  /** Render the title + close header (for panel hosts). Omit when a tab labels it. */
  showHeader?: boolean;
  /**
   * `card` (default) — bordered inset panel. `bare` — no nested card chrome when
   * the host (Package Pairing) already supplies the glass card.
   */
  chrome?: 'card' | 'bare';
  className?: string;
}

export function EcwidProductSearchInline({
  showHeader = false,
  chrome = 'card',
  className,
  autoFocusSearch = true,
  ...props
}: EcwidProductSearchInlineProps) {
  const c = useEcwidProductSearch(props);

  // `bare` (Package Pairing / right-rail Displays):
  const shell =
    chrome === 'bare'
      ? 'flex h-full min-h-0 min-w-0 max-w-full flex-col'
      : 'flex min-w-0 max-w-full max-h-[60vh] flex-col rounded-xl border border-border-soft bg-surface-card';

  return (
    // No outer overflow-hidden — it clipped SearchField focus borders and
    // result-row hover/selection rings into a flat blue edge. Height scroll
    // lives on the results list only; long titles truncate via min-w-0.
    <div className={`${shell} ${className ?? ''}`}>
      {showHeader ? <EcwidSearchHeader c={c} onClose={props.onClose} /> : null}
      <EcwidSearchInputs
        c={c}
        autoFocusSearch={autoFocusSearch}
        flush={chrome === 'bare'}
      />
      <EcwidResultsList c={c} />
    </div>
  );
}
