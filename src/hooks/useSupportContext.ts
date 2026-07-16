'use client';

import { useQuery } from '@tanstack/react-query';
import type { SupportContextBundle } from '@/lib/support/context-types';

export type SupportContextAnchor = {
  order?: string | null;
  tracking?: string | null;
  ticket?: string | null;
  receivingId?: number | null;
  lineId?: number | null;
  ensureThread?: boolean;
};

export function supportContextQueryKey(anchor: SupportContextAnchor) {
  return [
    'support-context',
    anchor.order ?? '',
    anchor.tracking ?? '',
    anchor.ticket ?? '',
    anchor.receivingId ?? null,
    anchor.lineId ?? null,
    anchor.ensureThread !== false,
  ] as const;
}

export function useSupportContext(anchor: SupportContextAnchor, enabled = true) {
  const hasAnchor = Boolean(
    (anchor.order ?? '').trim() ||
      (anchor.tracking ?? '').trim() ||
      (anchor.ticket ?? '').trim() ||
      anchor.receivingId != null ||
      anchor.lineId != null,
  );

  return useQuery<SupportContextBundle, Error>({
    queryKey: supportContextQueryKey(anchor),
    enabled: enabled && hasAnchor,
    staleTime: 15_000,
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (anchor.order?.trim()) sp.set('order', anchor.order.trim());
      if (anchor.tracking?.trim()) sp.set('tracking', anchor.tracking.trim());
      if (anchor.ticket?.trim()) sp.set('ticket', anchor.ticket.trim());
      if (anchor.receivingId != null) sp.set('receivingId', String(anchor.receivingId));
      if (anchor.lineId != null) sp.set('lineId', String(anchor.lineId));
      if (anchor.ensureThread === false) sp.set('ensureThread', '0');
      const res = await fetch(`/api/support/context?${sp.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `support/context ${res.status}`);
      }
      return data as SupportContextBundle;
    },
  });
}
