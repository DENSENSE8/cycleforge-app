'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { customerFullName, customerPhone, type CustomerRecord } from '@/lib/customers/customer-display';
import {
  addressCheckError,
  addressCheckKey,
  shipAddressFromBook,
  type AddressCheckResult,
} from '@/lib/shipping/shipstation/address-validation';
import type { ShipAddress } from '@/lib/shipping/shipstation/types';
import { cn } from '@/utils/_cn';

export type { AddressCheckResult };

/** The route's answer: the check plus whether the validator was reached at all. */
type AddressCheckResponse = AddressCheckResult & { checked: boolean };

const addressCheckQueryKey = (address: ShipAddress) => ['address-check', addressCheckKey(address)] as const;

/** One check per normalized address per session — the result never changes under us, so it never goes stale. */
const SESSION_CACHE = { staleTime: Infinity, gcTime: Infinity } as const;

async function postAddressCheck(address: ShipAddress): Promise<AddressCheckResponse> {
  const res = await fetch('/api/shipping/addresses/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const json = (await res.json().catch(() => null)) as (AddressCheckResponse & { ok?: boolean; error?: string }) | null;
  if (res.ok && json?.ok) {
    return { checked: json.checked, status: json.status, matched: json.matched ?? null, messages: json.messages ?? [] };
  }
  // 400 = an incomplete address the validator was never asked about.
  return { checked: false, ...addressCheckError(json?.error ?? `Address check failed (${res.status})`) };
}

/**
 * Validate a ship-to from the editor (session-cached per normalized address,
 * shared with {@link AddressCheckBadge}) so the parent can offer "Use suggested
 * address" from `matched`. Never throws: an unreachable validator reads as
 * status 'error' with the reason.
 */
export function useAddressSuggestion(): { validate: (address: ShipAddress) => Promise<AddressCheckResult>; pending: boolean } {
  const queryClient = useQueryClient();
  const [inFlight, setInFlight] = useState(0);
  const validate = useCallback(
    async (address: ShipAddress): Promise<AddressCheckResult> => {
      setInFlight((n) => n + 1);
      try {
        const { checked: _checked, ...result } = await queryClient.fetchQuery({
          queryKey: addressCheckQueryKey(address),
          queryFn: () => postAddressCheck(address),
          ...SESSION_CACHE,
        });
        return result;
      } catch {
        return addressCheckError('Address check failed');
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [queryClient],
  );
  return { validate, pending: inFlight > 0 };
}

/**
 * A small warn mark beside the ship-to when ShipStation could not verify it;
 * the tooltip lists why. Nothing when verified, while checking, when the
 * book has no complete ship-to, or when ShipStation is not connected.
 */
export function AddressCheckBadge({ customer }: { customer: CustomerRecord }) {
  const address = shipAddressFromBook({
    name: customerFullName(customer),
    phone: customerPhone(customer) || null,
    address1: customer.shipping_address_1,
    address2: customer.shipping_address_2,
    city: customer.shipping_city,
    state: customer.shipping_state,
    postalCode: customer.shipping_postal_code,
    country: customer.shipping_country,
  });
  const { data } = useQuery({
    queryKey: address ? addressCheckQueryKey(address) : ['address-check', null],
    queryFn: () => postAddressCheck(address as ShipAddress),
    enabled: address != null,
    retry: false,
    ...SESSION_CACHE,
  });

  if (!data || !data.checked || data.status === 'verified') return null;

  const reasons = data.messages.length > 0 ? data.messages : ['ShipStation could not verify this address.'];
  return (
    <HoverTooltip
      label={
        <span className="flex flex-col gap-0.5">
          {reasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </span>
      }
      asChild
      placement="above"
    >
      <span
        tabIndex={0}
        className={cn(RECORD_LABEL_CLASS, 'inline-flex h-8 shrink-0 items-center gap-1 rounded-mode-control text-mode-warn', focusRing('control'))}
        aria-label={`Address unverified: ${reasons.join(' ')}`}
        data-testid="order-record-address-check"
        data-status={data.status}
      >
        <AlertTriangle aria-hidden className="size-3.5" />
        Unverified
      </span>
    </HoverTooltip>
  );
}
