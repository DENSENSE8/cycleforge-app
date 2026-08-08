import { queryOptions } from '@tanstack/react-query';

type SellerClaimedFactsResponse = {
  ok: boolean;
  matchedOrderCondition?: string | null;
  listingCondition?: string | null;
  error?: string;
};

export function sellerClaimedFactsQuery(input: {
  serialUnitId: number | null;
  serial: string | null;
  skuCatalogId: number | null;
  orderId: string | null;
}) {
  const enabled = Boolean(
    input.serialUnitId || input.serial || input.skuCatalogId || input.orderId,
  );
  return queryOptions({
    queryKey: [
      'testing-seller-claimed',
      input.serialUnitId ?? 0,
      input.serial ?? '',
      input.skuCatalogId ?? 0,
      input.orderId ?? '',
    ] as const,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<SellerClaimedFactsResponse> => {
      const sp = new URLSearchParams();
      if (input.serialUnitId) sp.set('serialUnitId', String(input.serialUnitId));
      if (input.serial) sp.set('serial', input.serial);
      if (input.skuCatalogId) sp.set('skuCatalogId', String(input.skuCatalogId));
      if (input.orderId) sp.set('orderId', input.orderId);
      const res = await fetch(`/api/testing/seller-claimed?${sp}`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => null)) as SellerClaimedFactsResponse | null;
      if (!res.ok || !data?.ok) {
        return {
          ok: false,
          matchedOrderCondition: null,
          listingCondition: null,
          error: data?.error || `seller-claimed ${res.status}`,
        };
      }
      return data;
    },
  });
}
