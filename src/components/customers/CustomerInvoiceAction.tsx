'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail } from '@/components/Icons';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives/Button';
import { customerFullName, type CustomerRecord } from '@/lib/customers/customer-display';
import type { CustomerOrderHistoryPayload } from '@/lib/customers/customer-throughput';
import { customerDateFace, getCustomerJson } from './customer-format';

interface CustomerResponse { ok: true; customer: CustomerRecord }

type CustomerOrder = CustomerOrderHistoryPayload['orders'][number];

/**
 * The customer record's Actions panel (under Identity, operator 2026-10-08):
 * one explicit verb — Email invoice, in the verb's centered dialog.
 */
export function CustomerInvoiceAction({ customerId }: { customerId: number }) {
  const customer = useQuery({
    queryKey: ['customers.record', customerId],
    queryFn: () => getCustomerJson<CustomerResponse>(`/api/customers/${customerId}`),
  });
  const history = useQuery({
    queryKey: ['customers.orders', customerId],
    queryFn: () => getCustomerJson<CustomerOrderHistoryPayload>(`/api/customers/${customerId}/orders`),
  });
  const orders = useMemo(() => history.data?.orders ?? [], [history.data]);
  const record = customer.data?.customer ?? null;
  const email = record?.email?.trim() || '';
  const name = record ? customerFullName(record) || 'this customer' : 'this customer';

  const disabledReason = !email
    ? 'Add an email address before sending an invoice'
    : orders.length === 0
      ? 'This customer has no linked orders'
      : undefined;
  const verbs = useMemo<readonly RecordActionVerb[]>(() => [{
    id: 'email-invoice',
    label: 'Email invoice',
    icon: <Mail aria-hidden />,
    disabled: Boolean(disabledReason),
    disabledReason,
    dialog: (done) => <EmailInvoiceForm customerId={customerId} email={email} orders={orders} done={done} />,
  }], [customerId, disabledReason, email, orders]);

  return (
    <RecordGroup title="Actions" testId="customer-record-actions-panel">
      <RecordActionStrip face="panel" verbs={verbs} label={`${name} actions`} testId="customer-record-actions" />
    </RecordGroup>
  );
}

/**
 * Choose the order (search open and focused, newest first; Enter picks it),
 * then Send (focused once an order is picked; Enter sends). The done face says
 * where it went.
 */
function EmailInvoiceForm({
  customerId,
  email,
  orders,
  done,
}: {
  customerId: number;
  email: string;
  orders: readonly CustomerOrder[];
  done: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(orders[0]?.primaryOrderId ?? null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const [picked, setPicked] = useState(0);
  useEffect(() => {
    if (picked > 0) sendRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const selected = orders.find((order) => order.primaryOrderId === selectedId) ?? null;
  const options = useMemo(
    () =>
      orders.map((order) => ({
        value: String(order.primaryOrderId),
        label: order.orderRef || 'Order without reference',
        meta: `${customerDateFace(order.placedAt)} · ${order.items.length} ${order.items.length === 1 ? 'line item' : 'line items'}`,
        mono: Boolean(order.orderRef),
      })),
    [orders],
  );

  const send = async () => {
    if (!selected || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryOrderId: selected.primaryOrderId }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; delivery?: 'sent' | 'preview'; error?: string } | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error || 'Could not email the invoice');
      setSent(body.delivery === 'preview' ? 'Invoice email prepared in development' : `Sent to ${email}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not email the invoice');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return <VerbDoneState title="Invoice emailed" detail={sent} onDone={done} testId="email-invoice-done" />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-testid="email-invoice-dialog">
      <p className="text-role-caption text-text-soft">
        Choose the purchase invoice to send to <span className="text-text-default">{email}</span>.
      </p>
      <IntakeCombobox
        surface="open"
        value={selectedId == null ? null : String(selectedId)}
        onChange={(value) => {
          setSelectedId(Number(value));
          setError(null);
          setPicked((count) => count + 1);
        }}
        options={options}
        placeholder="Order"
        searchPlaceholder="Search order number…"
        emptyMessage="No matching order"
        disabled={sending}
        ariaLabel="Order to invoice"
        testId="email-invoice-order"
        className="flex-1"
      />
      <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
        {selected ? (
          <p className="text-role-caption text-text-muted">
            The email includes {selected.items.length} {selected.items.length === 1 ? 'line item' : 'line items'} and the recorded order total. It does not request payment.
          </p>
        ) : null}
        {error ? <p role="alert" className="text-role-caption font-semibold text-text-danger">{error}</p> : null}
        <Button
          ref={sendRef}
          type="button"
          variant="primary"
          size="md"
          icon={<Mail aria-hidden />}
          className="w-full"
          loading={sending}
          disabled={!selected || sending}
          onClick={() => void send()}
          data-testid="email-invoice-send"
        >
          {selected ? `Send invoice ${selected.orderRef || ''}`.trim() : 'Choose an order'}
        </Button>
      </div>
    </div>
  );
}
