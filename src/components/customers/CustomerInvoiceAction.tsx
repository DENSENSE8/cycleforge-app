'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail } from '@/components/Icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { FormField } from '@/design-system/components/FormField';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { Button } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { customerFullName, type CustomerRecord } from '@/lib/customers/customer-display';
import type { CustomerOrderHistoryPayload } from '@/lib/customers/customer-throughput';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { customerDateFace, getCustomerJson } from './customer-format';

interface CustomerResponse { ok: true; customer: CustomerRecord }

/** One explicit customer-record verb: choose an order, then email its purchase invoice. */
export function CustomerInvoiceAction({ customerId }: { customerId: number }) {
  const customer = useQuery({
    queryKey: ['customers.record', customerId],
    queryFn: () => getCustomerJson<CustomerResponse>(`/api/customers/${customerId}`),
  });
  const history = useQuery({
    queryKey: ['customers.orders', customerId],
    queryFn: () => getCustomerJson<CustomerOrderHistoryPayload>(`/api/customers/${customerId}/orders`),
  });
  const orders = history.data?.orders ?? [];
  const record = customer.data?.customer ?? null;
  const email = record?.email?.trim() || '';
  const name = record ? customerFullName(record) || 'this customer' : 'this customer';
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId == null && orders[0]) setSelectedId(orders[0].primaryOrderId);
  }, [orders, selectedId]);

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
    run: () => setOpen(true),
  }], [disabledReason]);

  const selected = orders.find((order) => order.primaryOrderId === selectedId) ?? null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
      setOpen(false);
      toast.success(body.delivery === 'preview' ? 'Invoice email prepared in development' : `Invoice emailed to ${email}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not email the invoice');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <RecordActionStrip face="header" verbs={verbs} label={`${name} actions`} testId="customer-record-actions" />
      <Dialog open={open} onOpenChange={(next) => { if (!sending) { setOpen(next); setError(null); } }}>
        <DialogContent data-testid="email-invoice-dialog">
          <form className="grid gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Email invoice</DialogTitle>
              <DialogDescription>Choose the purchase invoice to send to {email}.</DialogDescription>
            </DialogHeader>
            <FormField label="Order" required>
              <select
                value={selectedId ?? ''}
                onChange={(event) => setSelectedId(Number(event.target.value))}
                disabled={sending}
                className={cn('h-11 w-full rounded-mode-control border border-border-soft bg-surface-card px-3 text-role-data text-text-default outline-none', focusRing('field'))}
                data-testid="email-invoice-order"
              >
                {orders.map((order) => (
                  <option key={order.primaryOrderId} value={order.primaryOrderId}>
                    {order.orderRef || 'Order without reference'} · {customerDateFace(order.placedAt)}
                  </option>
                ))}
              </select>
            </FormField>
            {selected ? (
              <p className="text-role-caption text-text-muted">
                The email includes {selected.items.length} {selected.items.length === 1 ? 'line item' : 'line items'} and the recorded order total. It does not request payment.
              </p>
            ) : null}
            {error ? <p role="alert" className="text-role-caption font-semibold text-text-danger">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={sending} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={sending} disabled={!selected || sending}>Send invoice</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
