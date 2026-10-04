'use client';

/**
 * Ecwid import mode of `/orders/new`: the storefront already holds the order.
 * Type its number, the buyer or a product, ↑/↓, Enter — the form fills with
 * every line, the buyer and ship-to, and moves on to Team. An order already in
 * CycleForge is shown, never importable twice — except in test mode
 * (`allowImported`), where it saves as a separate `CF-TEST-` order.
 */

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useEcwidOrderSearch } from '@/hooks/orders/useIntakeImports';
import { TextField } from '@/design-system/primitives/TextField';
import { TriageImportRowFace } from '@/design-system/components/triage-shelf/TriageImportRow';
import { ecwidOrderRow } from '@/lib/orders/intake/import-rows';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { EcwidOrderImport } from '@/lib/orders/ecwid-order-import';
import { cn } from '@/utils/_cn';

export type { EcwidOrderImport };

export function CheckoutEcwidImport({
  onImport,
  allowImported = false,
}: {
  onImport: (order: EcwidOrderImport) => void;
  /** Test mode: an order already in CycleForge imports again (as a `CF-TEST-` order). */
  allowImported?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { connected, orders: shown, loading, error, searching } = useEcwidOrderSearch(query);
  useEffect(() => setActive(0), [shown]);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && shown.length > 0) {
      event.preventDefault();
      setActive((i) => (i + 1) % shown.length);
    } else if (event.key === 'ArrowUp' && shown.length > 0) {
      event.preventDefault();
      setActive((i) => (i - 1 + shown.length) % shown.length);
    } else if (event.key === 'Enter' && shown[active] && (allowImported || !shown[active]!.importedAs)) {
      event.preventDefault();
      onImport(shown[active]!);
    }
  };

  return (
    <div className="space-y-2" data-testid="checkout-ecwid-import">
      <TextField
        label="Find an Ecwid order — number, buyer or product"
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls="checkout-ecwid-results"
        aria-activedescendant={shown[active] ? `checkout-ecwid-${shown[active]!.orderNumber}` : undefined}
        data-testid="checkout-ecwid-query"
      />
      {!searching ? (
        <p className="text-role-caption text-text-muted">Type at least two characters.</p>
      ) : error ? (
        <p className="text-role-caption text-text-danger" role="alert">{error}</p>
      ) : connected == null || (loading && shown.length === 0) ? (
        <p className="text-role-caption text-text-muted" role="status">Searching Ecwid…</p>
      ) : !connected ? (
        <p className="text-role-caption text-text-muted">Ecwid is not connected for this workspace — connect it in Integrations.</p>
      ) : shown.length === 0 ? (
        <p className="text-role-caption text-text-muted">No Ecwid order matches.</p>
      ) : (
        <ul
          id="checkout-ecwid-results"
          role="listbox"
          aria-label="Ecwid orders"
          className="max-h-[26rem] divide-y divide-border-hairline overflow-y-auto rounded-mode-control border border-border-hairline"
        >
          {shown.map((order, index) => {
            const done = order.importedAs != null && !allowImported;
            return (
              <HoverTooltip key={order.orderNumber} label="Import" shortcut="↵" focusable={false} disabled={done} asChild>
                <li
                  id={`checkout-ecwid-${order.orderNumber}`}
                  role="option"
                  aria-selected={index === active}
                  aria-disabled={done}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => !done && onImport(order)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5',
                    done ? 'cursor-default opacity-60' : 'cursor-pointer',
                    index === active && !done && 'bg-surface-hover',
                  )}
                  data-testid="checkout-ecwid-row"
                >
                  <TriageImportRowFace row={ecwidOrderRow(order, 'USD')} />
                </li>
              </HoverTooltip>
            );
          })}
        </ul>
      )}
    </div>
  );
}
