'use client';

/**
 * Client reads/writes for "what we sent the customer" (support_ticket_items)
 * and the support product search behind the composer's "Product sent to
 * customer" picker. One module so desk and phone share the cache keys.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/_lifecycle';
import { toast } from '@/lib/toast';
import {
  supportTicketItemsUrl,
  type SupportProductFace,
  type SupportProductsResponse,
  type SupportTicketItem,
  type SupportTicketItemCreate,
  type SupportTicketItemsResponse,
} from '@/lib/support/ticket-items-shared';

export const supportTicketItemKeys = {
  list: (ticketId: number) => ['support', 'ticket', ticketId, 'items'] as const,
  products: (q: string, ticketId: number | null) => ['support', 'products', q, ticketId] as const,
  face: (skuCatalogId: number) => ['support', 'product-face', skuCatalogId] as const,
  bySku: (sku: string) => ['support', 'product-sku', sku] as const,
};

/** Between keystrokes and the search call (the intake picker's cadence). */
const PRODUCT_SEARCH_DEBOUNCE_MS = 200;
/** Catalog faces barely move inside a session. */
const PRODUCT_FACE_STALE_MS = 5 * 60_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

/** Everything logged on a ticket, newest first. Primes the per-product face cache. */
export function useSupportTicketItems(ticketId: number | null | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: supportTicketItemKeys.list(ticketId ?? 0),
    enabled: ticketId != null && ticketId > 0,
    queryFn: async () => {
      const data = await getJson<SupportTicketItemsResponse>(supportTicketItemsUrl(ticketId!));
      for (const item of data.items) {
        qc.setQueryData(supportTicketItemKeys.face(item.product.skuCatalogId), item.product);
      }
      return data.items;
    },
    staleTime: 30_000,
  });
}

/**
 * The picker's list: debounced search once 2+ characters are typed; before
 * that, the ticket's linked products (else recent picks) — just-in-time first.
 */
export function useSupportProductSearch(query: string, ticketId: number | null, enabled = true) {
  const debounced = useDebounce(query.trim(), PRODUCT_SEARCH_DEBOUNCE_MS);
  const q = debounced.length >= 2 ? debounced : '';
  return useQuery({
    queryKey: supportTicketItemKeys.products(q, ticketId),
    enabled,
    queryFn: () => {
      const sp = new URLSearchParams();
      if (q) sp.set('q', q);
      else if (ticketId != null && ticketId > 0) sp.set('ticketId', String(ticketId));
      return getJson<SupportProductsResponse>(`/api/support/products?${sp.toString()}`);
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/** One product's live face by catalog id (a token card with no log row yet). */
export function useSupportProductFace(skuCatalogId: number | null) {
  return useQuery({
    queryKey: supportTicketItemKeys.face(skuCatalogId ?? 0),
    enabled: skuCatalogId != null && skuCatalogId > 0,
    queryFn: async () => {
      const data = await getJson<SupportProductsResponse>(`/api/support/products?ids=${skuCatalogId}`);
      return data.products[0] ?? null;
    },
    staleTime: PRODUCT_FACE_STALE_MS,
  });
}

/** One product's live face by SKU string (the `sku` detail-stack peek). */
export function useSupportProductBySku(sku: string | null) {
  return useQuery<SupportProductFace | null>({
    queryKey: supportTicketItemKeys.bySku(sku ?? ''),
    enabled: Boolean(sku),
    queryFn: async () => {
      const data = await getJson<SupportProductsResponse>(
        `/api/support/products?sku=${encodeURIComponent(sku!)}`,
      );
      return data.products[0] ?? null;
    },
    staleTime: PRODUCT_FACE_STALE_MS,
  });
}

/**
 * Log the picks that rode one sent comment. Not optimistic: the thread already
 * shows the token card from the comment echo; the strip refreshes on success.
 */
export async function postSupportTicketItems(args: {
  ticketId: number;
  zendeskCommentId: number | null;
  items: SupportTicketItemCreate[];
}): Promise<SupportTicketItem[]> {
  const res = await fetch(supportTicketItemsUrl(args.ticketId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ zendeskCommentId: args.zendeskCommentId, items: args.items }),
  });
  const data = (await res.json().catch(() => null)) as (SupportTicketItemsResponse & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error || `Could not log the products (${res.status})`);
  return data.items;
}

/** Undo one logged item (the strip's remove). */
export function useDeleteSupportTicketItem(ticketId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`${supportTicketItemsUrl(ticketId)}/${itemId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || `Could not remove (${res.status})`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => void qc.invalidateQueries({ queryKey: supportTicketItemKeys.list(ticketId) }),
  });
}
