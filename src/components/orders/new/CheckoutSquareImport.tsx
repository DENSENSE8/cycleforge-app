'use client';

/**
 * Import mode of `/orders/new`: the order was already written up in Square
 * (an invoice), so nothing is re-typed. Filter, ↑/↓, Enter — the form fills
 * from the invoice and the cursor moves on to Team (picker → packer).
 * An invoice already in CycleForge is shown, never importable twice — except
 * in test mode (`allowImported`), where it saves as a separate `CF-TEST-` order.
 */

import { useEffect, useState, type KeyboardEvent } from 'react';
import { useSquareInvoiceImports } from '@/hooks/orders/useIntakeImports';
import { KeyboardKey } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { TriageImportRowFace } from '@/design-system/components/triage-shelf/TriageImportRow';
import { squareInvoiceRow } from '@/lib/orders/intake/import-rows';
import type { SquareInvoiceImport } from '@/lib/orders/square-invoice-import-core';
import { cn } from '@/utils/_cn';

/** One wire shape, server → form: prefill, `hasShipTo` (none = walk-in / pickup), and the Square card facts. */
export type { SquareInvoiceImport };

/** Enter imports the highlighted row — taught on that row only. */
export function ImportKeyHint() {
  return (
    <span className="inline-flex items-center gap-1">
      Import <KeyboardKey size="xs">↵</KeyboardKey>
    </span>
  );
}

export function CheckoutSquareImport({
  onImport,
  allowImported = false,
}: {
  onImport: (invoice: SquareInvoiceImport) => void;
  /** Test mode: an invoice already in CycleForge imports again (as a `CF-TEST-` order). */
  allowImported?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { connected, shown, error } = useSquareInvoiceImports(query);
  useEffect(() => setActive(0), [query]);

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
    <div className="space-y-2" data-testid="checkout-square-import">
      <TextField
        label="Find a Square invoice — number, customer or product"
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls="checkout-invoice-results"
        aria-activedescendant={shown[active] ? `checkout-invoice-${shown[active]!.invoiceId}` : undefined}
        data-testid="checkout-invoice-query"
      />
      {error ? (
        <p className="text-role-caption text-text-danger" role="alert">{error}</p>
      ) : connected == null ? (
        <p className="text-role-caption text-text-muted" role="status">Loading Square invoices…</p>
      ) : !connected ? (
        <p className="text-role-caption text-text-muted">Square is not connected for this workspace — connect it in Integrations.</p>
      ) : shown.length === 0 ? (
        <p className="text-role-caption text-text-muted">No invoice matches.</p>
      ) : (
        <ul
          id="checkout-invoice-results"
          role="listbox"
          aria-label="Square invoices"
          className="max-h-[26rem] divide-y divide-border-hairline overflow-y-auto rounded-mode-control border border-border-hairline"
        >
          {shown.map((inv, index) => {
            const done = inv.importedAs != null && !allowImported;
            return (
              <li
                key={inv.invoiceId}
                id={`checkout-invoice-${inv.invoiceId}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={done}
                onMouseEnter={() => setActive(index)}
                onClick={() => !done && onImport(inv)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5',
                  done ? 'cursor-default opacity-60' : 'cursor-pointer',
                  index === active && !done && 'bg-surface-hover',
                )}
                data-testid="checkout-invoice-row"
              >
                <TriageImportRowFace row={squareInvoiceRow(inv)} hint={index === active ? <ImportKeyHint /> : null} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
