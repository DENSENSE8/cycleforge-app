'use client';

/**
 * Inline Ecwid product / repair-order search.
 *
 * The non-modal successor to the retired `EcwidProductSearchPopover` — composes
 * the same reusable pieces (`useEcwidProductSearch` + `EcwidSearchHeader` /
 * `EcwidSearchInputs` / `EcwidResultsList`) but renders in flow (no portal,
 * no backdrop, no Escape handler). Drop it into a tab/panel; the host owns
 * layout and when it's shown.
 *
 * Used by the triage Smart-Matching "Repair Service / Trade in" tab and the
 * Local-Pickup "Add item" panel.
 */

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

  // `bare` (Package Pairing / right-rail Displays): fills whatever height its
  // flex host gives it — `h-full min-h-0` — so the results list's own
  // `overflow-y-auto` scrolls inside the available column instead of the
  // panel stopping at a fixed viewport fraction and leaving dead space below
  // it. `card` (floating popover-style hosts — Local-Pickup add-item, triage
  // Smart-Matching) keeps the `max-h-[60vh]` cap; those aren't full-height
  // flex columns and never were.
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
