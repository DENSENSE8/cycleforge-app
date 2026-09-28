'use client';

/** "More information" before committing a pairing. */

import { useQuery } from '@tanstack/react-query';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives/Button';
import { Loader2 } from '@/components/Icons';
import type { SkuStockedAt } from '@/lib/neon/pair-candidates-queries';

export function PairDetailSheet({
  sku,
  title,
  locationFace,
  onClose,
  onPair,
}: {
  sku: string;
  title: string;
  locationFace: string;
  onClose: () => void;
  onPair: () => void;
}) {
  const { data: stockedAt = [], isLoading } = useQuery<SkuStockedAt[]>({
    queryKey: ['sku-stocked-at', sku],
    queryFn: async () => {
      const res = await fetch(
        `/api/locations/${encodeURIComponent(locationFace)}/pair-candidates?sku=${encodeURIComponent(sku)}`,
        { credentials: 'include' },
      );
      if (!res.ok) return [];
      const json = (await res.json()) as { stockedAt?: SkuStockedAt[] };
      return json.stockedAt ?? [];
    },
  });

  const total = stockedAt.reduce((sum, row) => sum + row.qty, 0);

  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className="font-mono text-role-caption text-text-soft">{sku}</p>

        <div>
          <p className="text-role-eyebrow text-text-soft">
            Where it is now
          </p>
          {isLoading ? (
            <Loader2 className="mt-2 h-4 w-4 animate-spin text-text-muted" />
          ) : stockedAt.length === 0 ? (
            <p className="mt-1 text-role-caption text-text-muted">
              Not stocked anywhere yet — this would be its first bin.
            </p>
          ) : (
            <>
              <ul className="mt-1 divide-y divide-border-hairline">
                {stockedAt.map((row) => (
                  <li
                    key={row.locationId}
                    className="flex items-center justify-between gap-2 py-1.5"
                  >
                    <span className="min-w-0 truncate font-mono text-role-caption text-text-default">
                      {row.barcode || row.locationName}
                    </span>
                    <span className="shrink-0 font-mono text-role-caption tabular-nums text-text-soft">
                      {row.qty}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-role-caption text-text-soft tabular-nums">
                {total} across {stockedAt.length} bin{stockedAt.length === 1 ? '' : 's'}
              </p>
            </>
          )}
        </div>

        <Button variant="primary" size="lg" radius="surface" className="w-full" onClick={onPair}>
          Pair to {locationFace}
        </Button>
      </div>
    </BottomSheet>
  );
}
