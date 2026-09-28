'use client';

/**
 * Phone face of the two import lists: a Square invoice or an Ecwid order.
 * One find field, full-width touch rows, tap to import. Each row reads exactly
 * like the desk's (`TriageImportRowFace` over `import-rows.ts`); an order
 * already in CycleForge shows where it lives and is not tappable.
 */

import { useState } from 'react';
import { TriageImportRowFace } from '@/design-system/components/triage-shelf/TriageImportRow';
import { SearchField } from '@/design-system/primitives/SearchField';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useEcwidOrderSearch, useSquareInvoiceImports } from '@/hooks/orders/useIntakeImports';
import type { EcwidOrderImport } from '@/lib/orders/ecwid-order-import';
import { ecwidOrderRow, squareInvoiceRow, type ImportRowFacts } from '@/lib/orders/intake/import-rows';
import type { SquareInvoiceImport } from '@/lib/orders/square-invoice-import-core';
import { cn } from '@/utils/_cn';

function Rows({
  rows,
  label,
  allowImported,
}: {
  rows: ReadonlyArray<{ facts: ImportRowFacts; onPick: () => void }>;
  label: string;
  allowImported: boolean;
}) {
  return (
    <ul aria-label={label} className="divide-y divide-mode-rule border-y border-mode-rule">
      {rows.map(({ facts, onPick }) => (
        <li key={facts.key}>
          {/* ds-raw-button: full-width import row — number, buyer, lines and amount; a Button shape cannot hold the two-line body */}
          <button
            type="button"
            disabled={facts.importedAs != null && !allowImported}
            onClick={onPick}
            className={cn(
              'flex min-h-14 w-full items-center px-mode-page py-3 text-left active:bg-mode-hover disabled:opacity-60',
              focusRing('field', 'accent'),
            )}
            data-testid="m-order-import-row"
          >
            <TriageImportRowFace row={facts} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Notice({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'danger' }) {
  return (
    <p className={cn('px-mode-page py-6 text-center text-role-caption', tone === 'danger' ? 'text-text-danger' : 'text-text-muted')} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/** `allowImported` — test mode: a record already in CycleForge imports again, as a `CF-TEST-` order. */
export function MobileSquareImportList({ onImport, allowImported = false }: { onImport: (invoice: SquareInvoiceImport) => void; allowImported?: boolean }) {
  const [query, setQuery] = useState('');
  const { connected, shown, error } = useSquareInvoiceImports(query);
  return (
    <div data-testid="m-order-import-square">
      <div className="px-mode-page py-3">
        <SearchField placeholder="Find a Square invoice — number, customer, product" value={query} onChange={setQuery} />
      </div>
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : connected == null ? (
        <Notice>Loading Square invoices…</Notice>
      ) : !connected ? (
        <Notice>Square is not connected for this workspace — connect it in Integrations.</Notice>
      ) : shown.length === 0 ? (
        <Notice>No invoice matches.</Notice>
      ) : (
        <Rows
          label="Square invoices"
          allowImported={allowImported}
          rows={shown.map((inv) => ({ facts: squareInvoiceRow(inv), onPick: () => onImport(inv) }))}
        />
      )}
    </div>
  );
}

export function MobileEcwidImportList({
  onImport,
  currency,
  allowImported = false,
}: {
  onImport: (order: EcwidOrderImport) => void;
  currency: string;
  allowImported?: boolean;
}) {
  const [query, setQuery] = useState('');
  const { connected, orders, loading, error, searching } = useEcwidOrderSearch(query);
  return (
    <div data-testid="m-order-import-ecwid">
      <div className="px-mode-page py-3">
        <SearchField placeholder="Find an Ecwid order — number, buyer, product" value={query} onChange={setQuery} />
      </div>
      {!searching ? (
        <Notice>Type at least two characters.</Notice>
      ) : error ? (
        <Notice tone="danger">{error}</Notice>
      ) : connected == null || (loading && orders.length === 0) ? (
        <Notice>Searching Ecwid…</Notice>
      ) : !connected ? (
        <Notice>Ecwid is not connected for this workspace — connect it in Integrations.</Notice>
      ) : orders.length === 0 ? (
        <Notice>No Ecwid order matches.</Notice>
      ) : (
        <Rows
          label="Ecwid orders"
          allowImported={allowImported}
          rows={orders.map((o) => ({ facts: ecwidOrderRow(o, currency), onPick: () => onImport(o) }))}
        />
      )}
    </div>
  );
}
