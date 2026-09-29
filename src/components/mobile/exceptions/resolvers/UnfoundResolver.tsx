'use client';

/**
 * Unfound — a carton no PO matched. Pair it: search the local Zoho PO mirror
 * (`GET /api/receiving/po-search`, the same typeahead the desk's Link-a-PO tab
 * reads; empty query = most recently synced POs), pick one, and `Pair to PO`
 * relinks the whole carton (`POST /api/receiving/relink`, carton scope).
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2 } from '@/components/Icons';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { DetailDock } from '@/design-system/components/DetailDock';
import { SearchableSelectField } from '@/design-system/components';
import { useAuth } from '@/contexts/AuthContext';
import { useResolveUnfoundException } from '@/hooks/exceptions';
import { useDebounce } from '@/hooks/_lifecycle';
import type { CartonExceptionFacts } from '@/lib/exceptions/facts';
import { toast } from '@/lib/toast';
import { CartonFacts } from './CartonFacts';
import type { PhoneResolverProps } from './resolver-props';

interface PoCandidate {
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string | null;
  reference_number: string | null;
  vendor_name: string | null;
  status: string | null;
}

export function UnfoundResolver({ facts, onResolved }: PhoneResolverProps<CartonExceptionFacts>) {
  const { has } = useAuth();
  const resolve = useResolveUnfoundException();
  const canPair = has('receiving.scan_po');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PoCandidate | null>(null);
  const trimmed = useDebounce(query.trim(), 250);

  // Same key + endpoint as the desk Link-a-PO tab, so the cache is shared.
  const search = useQuery({
    queryKey: ['po-search', trimmed],
    queryFn: async () => {
      const res = await fetch(`/api/receiving/po-search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error('PO search failed');
      // The route's own response shape (`src/app/api/receiving/po-search`).
      const body: { candidates?: PoCandidate[] } = await res.json();
      return body.candidates ?? [];
    },
    enabled: canPair,
    staleTime: 15_000,
  });

  const options = (search.data ?? []).map((po) => ({
    value: po.zoho_purchaseorder_id,
    label: po.zoho_purchaseorder_number || po.zoho_purchaseorder_id,
    meta: [po.vendor_name, po.reference_number, po.status].filter(Boolean).join(' · ') || undefined,
    data: po,
  }));
  // Keep the pick paintable after the search moves on.
  const pickedMissing = picked && !options.some((option) => option.value === picked.zoho_purchaseorder_id);
  const shown = pickedMissing
    ? [
        {
          value: picked.zoho_purchaseorder_id,
          label: picked.zoho_purchaseorder_number || picked.zoho_purchaseorder_id,
          meta: picked.vendor_name ?? undefined,
          data: picked,
        },
        ...options,
      ]
    : options;

  const pair = () => {
    if (!picked) return;
    const label = picked.zoho_purchaseorder_number || picked.zoho_purchaseorder_id;
    return resolve
      .mutateAsync({
        receivingId: facts.carton.receivingId,
        zohoPurchaseorderId: picked.zoho_purchaseorder_id,
        zohoPurchaseorderNumber: picked.zoho_purchaseorder_number,
      })
      .then(() => onResolved(`Carton paired to ${label}.`))
      .catch((error: Error) => toast.error(error.message || 'Could not pair the carton.'));
  };

  const blockedReason = !canPair
    ? 'Pairing a carton to a PO needs receiving PO access (Scan PO).'
    : !picked
      ? 'Pick the PO this carton belongs to.'
      : null;

  return (
    <>
      <CartonFacts carton={facts.carton} />
      <section aria-labelledby="unfound-po-heading" className="bg-mode-panel">
        <DetailSectionHeading id="unfound-po-heading">Purchase order</DetailSectionHeading>
        <SearchableSelectField
          value={picked?.zoho_purchaseorder_id ?? null}
          onChange={(_value, option) => setPicked(option?.data ?? null)}
          options={shown}
          onSearchChange={setQuery}
          loading={search.isFetching}
          disabled={!canPair || resolve.isPending}
          placeholder="Choose a PO…"
          searchPlaceholder="PO number, reference or vendor…"
          emptyMessage={search.isError ? 'PO search failed — try again.' : 'No PO matches.'}
          ariaLabel="Purchase order"
          testId="unfound-po-search"
          appearance="flush"
          className="h-mode-hit-cta"
        />
      </section>
      {blockedReason ? (
        <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-text-muted">{blockedReason}</p>
      ) : null}
      <div className="flex-1 bg-mode-panel" />
      <DetailDock
        label="Unfound exception actions"
        verbs={[
          {
            id: 'pair',
            label: 'Pair to PO',
            icon: <Link2 />,
            primary: true,
            disabled: !canPair || !picked,
            loading: resolve.isPending,
          },
        ]}
        onVerb={pair}
      />
    </>
  );
}
