'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { SearchField } from '@/design-system/primitives/SearchField';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { useResolveUnfoundException } from '@/hooks/exceptions';
import type { CartonExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { cn } from '@/utils/_cn';
import { CartonFactsGroup, lineTitle } from './CartonFactsGroup';
import { resolveWith } from './resolve-feedback';

/** `GET /api/receiving/po-search` — the same PO mirror the Unbox bench's "Link a PO" tab searches. */
interface PoCandidate {
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string | null;
  reference_number: string | null;
  vendor_name: string | null;
  status: string | null;
}

/**
 * Unfound — a carton that matched no PO. In place: find its purchase order
 * (PO number, reference, vendor; empty lists the most recent incoming POs)
 * and pair the carton to it.
 */
export function UnfoundResolver({ row, facts }: { row: ExceptionRow; facts: CartonExceptionFacts }) {
  const resolve = useResolveUnfoundException();
  const seed = facts.carton.tracking ?? '';
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    queryKey: ['po-search', debounced],
    queryFn: async () => {
      const res = await fetch(`/api/receiving/po-search?q=${encodeURIComponent(debounced)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('PO search failed');
      return ((await res.json()) as { candidates?: PoCandidate[] }).candidates ?? [];
    },
    staleTime: 15_000,
  });
  const candidates = search.data ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-unfound">
      <CartonFactsGroup carton={facts.carton} />
      {facts.lines.some((line) => line.id > 0) ? (
        <RecordGroup title="What was in it">
          <ul className="flex flex-col gap-3 px-4 pb-4 pt-1">
            {facts.lines
              .filter((line) => line.id > 0)
              .map((line) => (
                <li key={line.id} className="truncate text-role-data text-mode-ink">
                  {lineTitle(line)} <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>×{line.quantity_received}</span>
                </li>
              ))}
          </ul>
        </RecordGroup>
      ) : null}
      <RecordGroup title="Pair to its PO">
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={seed ? `PO, reference or vendor (tracking ${seed})` : 'PO, reference or vendor'}
            isSearching={search.isFetching}
            debounceMs={0}
          />
          {search.isError ? <EvidenceNotice tone="warn">PO search failed.</EvidenceNotice> : null}
          {!search.isFetching && candidates.length === 0 ? <EvidenceNotice>No purchase order matches.</EvidenceNotice> : null}
          <ul className="flex flex-col" data-testid="exception-unfound-candidates">
            {candidates.slice(0, 12).map((po) => {
              const label = po.zoho_purchaseorder_number || po.zoho_purchaseorder_id;
              return (
                <li key={po.zoho_purchaseorder_id} className="flex items-center gap-3 border-b border-mode-fact py-2 last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className={cn(RECORD_ID_CLASS, 'block text-mode-ink')}>{label}</span>
                    <span className="block truncate text-role-caption text-mode-muted">
                      {[po.vendor_name, po.reference_number, po.status].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={resolve.isPending && resolve.variables?.zohoPurchaseorderId === po.zoho_purchaseorder_id}
                    disabled={resolve.isPending}
                    onClick={() =>
                      resolveWith(
                        resolve,
                        {
                          clears: row.key,
                          receivingId: facts.carton.receivingId,
                          zohoPurchaseorderId: po.zoho_purchaseorder_id,
                          zohoPurchaseorderNumber: po.zoho_purchaseorder_number,
                        },
                        `Carton paired to PO ${label}`,
                      )
                    }
                    data-testid="exception-resolve-unfound"
                  >
                    Pair
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </RecordGroup>
    </div>
  );
}
