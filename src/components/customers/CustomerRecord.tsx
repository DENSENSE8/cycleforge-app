'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Mail, MapPin, Package, Phone } from '@/components/Icons';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import {
  customerAddressLines, customerFullName, customerPhone, type CustomerRecord as CustomerRecordData,
} from '@/lib/customers/customer-display';
import type { CustomerOrderHistoryEntry, CustomerOrderHistoryPayload } from '@/lib/customers/customer-throughput';
import { searchOrderFeedbackHref } from '@/lib/search/search-hit';
import { formatPhoneNumber } from '@/utils/phone';
import {
  customerDateFace, customerDateTimeFace, customerMoney, customerPlatformFace, getCustomerJson, type StatsResponse,
} from './customer-format';

interface CustomerResponse { ok: true; customer: CustomerRecordData }

export function CustomerRecord({ customerId }: { customerId: number }) {
  const customer = useQuery({ queryKey: ['customers.record', customerId], queryFn: () => getCustomerJson<CustomerResponse>(`/api/customers/${customerId}`) });
  const stats = useQuery({ queryKey: ['customers.stats', customerId], queryFn: () => getCustomerJson<StatsResponse>(`/api/customers/${customerId}/stats`) });
  const history = useQuery({ queryKey: ['customers.orders', customerId], queryFn: () => getCustomerJson<CustomerOrderHistoryPayload>(`/api/customers/${customerId}/orders`) });
  const record = customer.data?.customer ?? null;
  const failed = customer.isError || stats.isError || history.isError;
  if ((customer.isPending || stats.isPending || history.isPending) && !record) return <UniversalLoader isLoading label="Loading customer" className="min-h-64" />;
  if (!record) return <div className="p-4"><EvidenceNotice tone="warn">{failed ? 'Couldn’t load this customer.' : 'Customer not found.'}</EvidenceNotice></div>;

  const address = customerAddressLines(record);
  const phone = customerPhone(record);
  const count = stats.data?.orderCount ?? history.data?.orders.length ?? 0;
  return (
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid="customer-record">
      <DeskRecordLayout
        main={<CustomerOrderHistory orders={history.data?.orders ?? []} />}
        aside={(
          <div className="flex min-w-0 flex-col gap-4">
            <RecordGroup title="Identity" testId="customer-record-identity">
              <div className="px-4 pb-1">
                <EvidenceFactRow label="Name">{customerFullName(record) || 'Unnamed customer'}</EvidenceFactRow>
                {phone ? <EvidenceFactRow label="Phone"><a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="size-3.5 text-mode-muted" aria-hidden />{formatPhoneNumber(phone)}</a></EvidenceFactRow> : null}
                {record.email ? <EvidenceFactRow label="Email"><a href={`mailto:${record.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:underline"><Mail className="size-3.5 shrink-0 text-mode-muted" aria-hidden /><span className="truncate">{record.email}</span></a></EvidenceFactRow> : null}
                {address.length > 0 ? <EvidenceFactRow label="Address" wide><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-mode-muted" aria-hidden /><span className="whitespace-pre-line">{address.join('\n')}</span></span></EvidenceFactRow> : null}
                {!phone && !record.email && address.length === 0 ? <EvidenceFactRow label="Contact">No contact details on file</EvidenceFactRow> : null}
              </div>
            </RecordGroup>
            <RecordGroup title="Throughput" testId="customer-record-throughput">
              <div className="px-4 pb-1">
                <EvidenceFactRow label="Orders">{count}</EvidenceFactRow>
                <EvidenceFactRow label="First order">{customerDateFace(stats.data?.firstOrderAt ?? null)}</EvidenceFactRow>
                <EvidenceFactRow label="Latest order">{customerDateFace(stats.data?.lastOrderAt ?? null)}</EvidenceFactRow>
                <EvidenceFactRow label="Realized spend">{stats.data ? customerMoney(stats.data.totalSpent, stats.data.currency) : '—'}</EvidenceFactRow>
              </div>
            </RecordGroup>
          </div>
        )}
      />
    </div>
  );
}

function CustomerOrderHistory({ orders }: { orders: readonly CustomerOrderHistoryEntry[] }) {
  return (
    <RecordGroup title="Order history" titleAccessory={<span className="text-role-caption tabular-nums text-mode-muted">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span>} testId="customer-record-orders">
      {orders.length === 0 ? <div className="p-4"><EvidenceNotice>No linked orders.</EvidenceNotice></div> : (
        <ol className="divide-y divide-mode-fact">
          {orders.map((order) => (
            <li key={`${order.orderRef ?? 'row'}:${order.primaryOrderId}`}>
              <Link href={searchOrderFeedbackHref(order.primaryOrderId)} className="group block px-4 py-3 transition-colors hover:bg-mode-hover focus-visible:bg-mode-hover" aria-label={`Open ${order.orderRef || `order ${order.primaryOrderId}`}`}>
                <span className="flex min-w-0 items-start gap-2">
                  <PlatformMark platformValue={order.platform} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-role-data font-semibold tabular-nums text-mode-ink">{order.orderRef || `Order ${order.primaryOrderId}`}</span>
                      <span className="flex shrink-0 items-center gap-2 text-role-caption font-semibold tabular-nums text-mode-ink">{customerMoney(order.totalAmount, order.currency)}<ChevronRight className="size-4 text-mode-muted transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-role-micro font-medium text-mode-muted">
                      <span>{customerPlatformFace(order.platform)}</span><span aria-hidden>·</span><span>{customerDateTimeFace(order.placedAt)}</span>{order.status ? <><span aria-hidden>·</span><span>{order.status}</span></> : null}
                    </span>
                    <span className="mt-2 block space-y-1">
                      {order.items.map((item) => (
                        <span key={item.id} className="flex min-w-0 items-center gap-2 text-role-caption text-mode-ink">
                          <Package className="size-3.5 shrink-0 text-mode-muted" aria-hidden />
                          <span className="shrink-0 font-semibold tabular-nums">{item.quantity}×</span>
                          <span className="truncate">{item.title || 'Untitled item'}</span>
                          {item.sku || item.itemNumber || item.condition ? <span className="ml-auto shrink-0 text-role-micro text-mode-muted">{[item.sku, item.itemNumber ? `#${item.itemNumber}` : null, item.condition].filter(Boolean).join(' · ')}</span> : null}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </RecordGroup>
  );
}
