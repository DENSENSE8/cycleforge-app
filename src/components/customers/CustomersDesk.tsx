'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { DeskRecordPlane } from '@/design-system/components/DeskRecordPlane';
import type { CustomerDirectoryPayload } from '@/lib/customers/customer-throughput';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { CUSTOMER_PATHS } from '@/lib/nav/route-tree';
import { CustomerDirectoryList, CustomerDirectorySummary } from './CustomerDirectoryList';
import { CustomerDeskActions } from './CustomerDeskActions';
import { CustomerInvoiceAction } from './CustomerInvoiceAction';
import { CustomerRecord } from './CustomerRecord';
import { getCustomerJson } from './customer-format';

/** Sales › Customers — one uniform directory opening the same record on the desktop plane. */
export function CustomersDesk() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q')?.trim() ?? '';
  const rawCustomerId = searchParams.get('customer');
  const selectedId = rawCustomerId && /^\d+$/.test(rawCustomerId) ? Number(rawCustomerId) : null;
  const directory = useQuery({
    queryKey: ['customers.directory', query],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100' });
      if (query) params.set('q', query);
      return getCustomerJson<CustomerDirectoryPayload>(`/api/customers?${params.toString()}`);
    },
    staleTime: 30_000,
  });
  const rows = directory.data?.customers ?? [];
  const selected = selectedId == null ? null : rows.find((row) => row.id === selectedId) ?? null;

  const writeSelected = useCallback((customerId: number | null) => {
    const params = readLiveSearchParams(searchParams.toString());
    if (customerId == null) params.delete('customer');
    else params.set('customer', String(customerId));
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${CUSTOMER_PATHS.desktop}?${qs}` : CUSTOMER_PATHS.desktop);
  }, [searchParams]);

  const title = selected?.name ?? (selectedId ? 'Customer record' : 'Customer');
  const subtitle = selected
    ? selected.orderCount > 1
      ? `Repeat customer · ${selected.orderCount} orders`
      : `${selected.orderCount} order${selected.orderCount === 1 ? '' : 's'}`
    : undefined;
  return (
    <>
      <CustomerDeskActions onCreated={writeSelected} />
      <DeskRecordPlane
        open={selectedId != null}
        onClose={() => writeSelected(null)}
        title={title}
        subtitle={subtitle}
        recordNoun="customer"
        recordKey={selectedId == null ? null : String(selectedId)}
        testId="customer-record-plane"
        actions={selectedId == null ? null : <CustomerInvoiceAction customerId={selectedId} />}
        list={<CustomerDirectoryList rows={rows} loading={directory.isPending} failed={directory.isError} fetching={directory.isFetching} selectedId={selectedId} narrowed={Boolean(query)} onOpen={writeSelected} />}
        summary={<CustomerDirectorySummary rows={rows} />}
      >
        {selectedId != null ? <CustomerRecord customerId={selectedId} /> : null}
      </DeskRecordPlane>
    </>
  );
}
