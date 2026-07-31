'use client';

/**
 * OrderCustomerFacts — flat customer + ship-to facts for the order-record rail.
 *
 * No nested bordered card inside the rail Panel (that double chrome was a
 * density tax). Fields are copy-on-click OrderFactRows.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, User } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

interface CustomerRecord {
  id: number;
  display_name: string | null;
  customer_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  shipping_address_1: string | null;
  shipping_address_2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
}

function fullName(c: CustomerRecord): string {
  return (
    c.display_name || c.customer_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || ''
  ).trim();
}

function addressLines(c: CustomerRecord): string[] {
  const street = [c.shipping_address_1, c.shipping_address_2].filter(Boolean).join(', ');
  const cityLine = [c.shipping_city, c.shipping_state, c.shipping_postal_code].filter(Boolean).join(' ');
  return [street, cityLine, c.shipping_country || ''].map((s) => s.trim()).filter(Boolean);
}

function CopyableFact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <HoverTooltip label={copied ? 'Copied' : 'Click to copy'} asChild>
      {/* ds-raw-button: fact cell is the copy target */}
      <button
        type="button"
        className="ds-raw-button w-full text-left"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        <OrderFactRow
          label={label}
          mono={mono}
          value={
            <span className="inline-flex items-center gap-1.5">
              <span className="whitespace-pre-line break-words">{value}</span>
              {copied ? (
                <Check className="h-3 w-3 shrink-0 text-text-success" />
              ) : (
                <Copy className="h-3 w-3 shrink-0 text-text-faint" />
              )}
            </span>
          }
        />
      </button>
    </HoverTooltip>
  );
}

export function OrderCustomerFacts({ customerId }: { customerId?: number | null }) {
  const [copiedFull, setCopiedFull] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}`);
      if (!res.ok) throw new Error('Failed to load customer');
      const json = await res.json();
      return json.customer as CustomerRecord;
    },
  });

  if (!customerId) {
    return (
      <div className="flex flex-col items-center gap-1 py-3 text-center">
        <User className="h-4 w-4 text-text-faint" />
        <p className="text-role-caption font-medium text-text-faint">No customer linked</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-20 animate-pulse rounded-lg bg-surface-sunken" />;
  }

  if (isError || !data) {
    return (
      <p className="text-role-caption font-semibold text-text-danger">Failed to load customer.</p>
    );
  }

  const name = fullName(data);
  const phone = data.phone || data.mobile || '';
  const lines = addressLines(data);
  const shipTo = lines.join('\n');
  const fullAddress = [name, ...lines].filter(Boolean).join('\n');
  const hasAnything = Boolean(name || data.email || phone || lines.length > 0);

  if (!hasAnything) {
    return (
      <p className="text-role-caption font-medium text-text-faint">
        Customer linked, but no contact details captured yet.
      </p>
    );
  }

  return (
    <div className="stack-tight">
      <OrderFactList cols={1}>
        <CopyableFact label="Name" value={name} />
        <CopyableFact label="Email" value={data.email || ''} />
        <CopyableFact label="Phone" value={phone} />
        <CopyableFact label="Ship to" value={shipTo} />
      </OrderFactList>

      {lines.length > 0 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(fullAddress);
            setCopiedFull(true);
            setTimeout(() => setCopiedFull(false), 1200);
          }}
          icon={
            copiedFull ? (
              <Check className="h-3.5 w-3.5 text-text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )
          }
          className="w-full"
        >
          {copiedFull ? 'Copied' : 'Copy full address'}
        </Button>
      ) : null}
    </div>
  );
}
