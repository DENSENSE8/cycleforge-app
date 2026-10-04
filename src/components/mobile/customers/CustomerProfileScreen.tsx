'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Mail, MapPin, Package, Phone, User } from '@/components/Icons';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { MobileDataListRow } from '@/design-system/components/MobileDataListRow';
import {
  MobileRecordFact,
  MobileRecordFacts,
  MobileRecordGroup,
  MOBILE_RECORD_ROW_CLASS,
} from '@/design-system/components/MobileRecordGroup';
import {
  customerAddressLines,
  customerFullName,
  customerPhone,
  type CustomerRecord,
} from '@/lib/customers/customer-display';
import type { CustomerOrderStats } from '@/lib/customers/customer-order-stats';
import type { CustomerOrderHistoryPayload } from '@/lib/customers/customer-throughput';
import { sourcePlatformLabel } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import { formatPhoneNumber } from '@/utils/phone';

interface CustomerResponse { ok: true; customer: CustomerRecord }
interface StatsResponse extends CustomerOrderStats { ok: true }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Could not load customer');
  return json as T;
}

function dateFace(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateTimeFace(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function money(value: number | null, currency: string | null): string | null {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || 'USD'}`;
  }
}

function platformFace(value: string | null): string {
  const label = sourcePlatformLabel(value);
  if (label !== 'Unknown') return label;
  const raw = String(value ?? '').trim().replace(/[_-]+/g, ' ');
  return raw ? raw.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown platform';
}

/** One customer record: identity first, throughput second, complete order history third. */
export function CustomerProfileScreen({ customerId }: { customerId: number }) {
  const customer = useQuery({
    queryKey: ['customers.record', customerId],
    queryFn: () => getJson<CustomerResponse>(`/api/customers/${customerId}`),
  });
  const stats = useQuery({
    queryKey: ['customers.stats', customerId],
    queryFn: () => getJson<StatsResponse>(`/api/customers/${customerId}/stats`),
  });
  const history = useQuery({
    queryKey: ['customers.orders', customerId],
    queryFn: () => getJson<CustomerOrderHistoryPayload>(`/api/customers/${customerId}/orders`),
  });

  const record = customer.data?.customer ?? null;
  const name = record ? customerFullName(record) || `Customer ${customerId}` : `Customer ${customerId}`;
  const count = stats.data?.orderCount ?? history.data?.orders.length ?? 0;
  const repeatFace = count > 1 ? `Repeat customer · ${count} orders` : `${count} order${count === 1 ? '' : 's'}`;
  const address = record ? customerAddressLines(record) : [];
  const phone = record ? customerPhone(record) : '';
  const loading = customer.isPending || stats.isPending || history.isPending;
  const failed = customer.isError || stats.isError || history.isError;

  return (
    <div className="flex min-h-full flex-col bg-surface-card" data-testid="mobile-customer-profile">
      <MobileV2DetailTopBar
        backHref="/m/customers"
        subtitle="Customer"
        title={name}
        meta={repeatFace}
        lead={<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-muted"><User className="size-4" /></span>}
      />

      {loading && !record ? (
        <UniversalLoader isLoading label="Loading customer" className="min-h-64" />
      ) : failed && !record ? (
        <p role="alert" className="px-mode-page py-12 text-center text-role-data font-semibold text-text-danger">
          Couldn&apos;t load this customer.
        </p>
      ) : record ? (
        <div className="divide-y divide-border-soft">
          <MobileRecordGroup id="customer-contact" title="Identity">
            <div className="divide-y divide-border-soft">
              {phone ? (
                <a href={`tel:${phone}`} className={MOBILE_RECORD_ROW_CLASS}>
                  <Phone className="size-4 shrink-0 text-text-muted" />
                  <span className="tabular-nums">{formatPhoneNumber(phone)}</span>
                </a>
              ) : null}
              {record.email ? (
                <a href={`mailto:${record.email}`} className={MOBILE_RECORD_ROW_CLASS}>
                  <Mail className="size-4 shrink-0 text-text-muted" />
                  <span className="min-w-0 truncate">{record.email}</span>
                </a>
              ) : null}
              {address.length > 0 ? (
                <div className={cn(MOBILE_RECORD_ROW_CLASS, 'items-start')}>
                  <MapPin className="mt-0.5 size-4 shrink-0 text-text-muted" />
                  <span className="whitespace-pre-line">{address.join('\n')}</span>
                </div>
              ) : null}
              {!phone && !record.email && address.length === 0 ? (
                <p className={cn(MOBILE_RECORD_ROW_CLASS, 'text-text-muted')}>No contact details on file.</p>
              ) : null}
            </div>
          </MobileRecordGroup>

          <MobileRecordGroup id="customer-throughput" title="Throughput">
            <MobileRecordFacts label="Customer throughput">
              <MobileRecordFact label="Orders" value={count} />
              <MobileRecordFact label="First order" value={dateFace(stats.data?.firstOrderAt ?? null)} />
              <MobileRecordFact label="Latest order" value={dateFace(stats.data?.lastOrderAt ?? null)} />
              <MobileRecordFact
                label="Realized spend"
                value={stats.data ? money(stats.data.totalSpent, stats.data.currency) : null}
              />
            </MobileRecordFacts>
          </MobileRecordGroup>

          <MobileRecordGroup id="customer-orders" title="Order history" summary={`${count} ${count === 1 ? 'order' : 'orders'}`}>
            {(history.data?.orders ?? []).length === 0 ? (
              <p className="px-mode-page py-8 text-center text-role-data text-text-muted">No linked orders.</p>
            ) : (
              <ol className="divide-y divide-border-soft">
                {(history.data?.orders ?? []).map((order) => {
                  const href = order.orderRef
                    ? `/m/orders/${encodeURIComponent(order.orderRef)}?back=${encodeURIComponent(`/m/customers/${customerId}`)}`
                    : `/m/orders/${order.primaryOrderId}?by=id&back=${encodeURIComponent(`/m/customers/${customerId}`)}`;
                  const platform = platformFace(order.platform);
                  const orderTotal = money(order.totalAmount, order.currency);
                  return (
                    <li key={`${order.orderRef ?? 'row'}:${order.primaryOrderId}`}>
                      <MobileDataListRow
                        href={href}
                        ariaLabel={`Open ${order.orderRef || `order ${order.primaryOrderId}`}`}
                        className="px-mode-page py-3"
                        testId="mobile-customer-order-row"
                      >
                        <span className="flex items-start gap-2">
                          <PlatformMark platformValue={order.platform} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate font-mono text-role-data font-bold text-mode-ink">{order.orderRef || `Order ${order.primaryOrderId}`}</span>
                              {orderTotal ? <span className="shrink-0 text-role-caption font-bold tabular-nums text-mode-ink">{orderTotal}</span> : null}
                              <ChevronRight className="size-4 shrink-0 text-text-faint" aria-hidden />
                            </span>
                            <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-role-micro font-semibold text-mode-muted">
                              <span>{platform}</span><span aria-hidden>·</span><span>{dateTimeFace(order.placedAt)}</span>{order.status ? <><span aria-hidden>·</span><span>{order.status}</span></> : null}
                            </span>
                            <span className="mt-2 block space-y-1">
                              {order.items.map((item) => (
                                <span key={item.id} className="flex min-w-0 items-center gap-2 text-role-caption text-mode-ink">
                                  <Package className="size-3.5 shrink-0 text-mode-muted" />
                                  <span className="shrink-0 font-mono font-bold tabular-nums">{item.quantity}×</span>
                                  <span className="truncate">{item.title || 'Untitled item'}</span>
                                  {item.sku || item.itemNumber || item.condition ? (
                                    <span className="ml-auto shrink-0 font-mono text-role-micro text-mode-muted">
                                      {[item.sku, item.itemNumber ? `#${item.itemNumber}` : null, item.condition].filter(Boolean).join(' · ')}
                                    </span>
                                  ) : null}
                                </span>
                              ))}
                            </span>
                          </span>
                        </span>
                      </MobileDataListRow>
                    </li>
                  );
                })}
              </ol>
            )}
          </MobileRecordGroup>
        </div>
      ) : null}
    </div>
  );
}
