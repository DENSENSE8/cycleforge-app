'use client';

/** "More information" before committing a pairing. */

import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/design-system/primitives/Button';
import { Loader2 } from '@/components/Icons';
import type { SkuStockedAt } from '@/lib/neon/pair-candidates-queries';
import { SkuLinkedPhotoStrip } from '@/components/mobile/stock/SkuLinkedPhotoStrip';
import { stockQtyToneClass } from '@/design-system/tokens/stock-qty';
import { cn } from '@/utils/_cn';

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
  const { data, isLoading } = useQuery<{ stockedAt: SkuStockedAt[]; photoIds: number[] }>({
    queryKey: ['sku-stocked-at', sku],
    queryFn: async () => {
      const res = await fetch(
        `/api/locations/${encodeURIComponent(locationFace)}/pair-candidates?sku=${encodeURIComponent(sku)}`,
        { credentials: 'include' },
      );
      if (!res.ok) return { stockedAt: [], photoIds: [] };
      const json = (await res.json()) as { stockedAt?: SkuStockedAt[]; photoIds?: number[] };
      return { stockedAt: json.stockedAt ?? [], photoIds: json.photoIds ?? [] };
    },
  });
  const stockedAt = data?.stockedAt ?? [];

  const total = stockedAt.reduce((sum, row) => sum + row.qty, 0);

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3">
          <p className="font-mono text-role-caption text-text-soft">{sku}</p>

          <SkuLinkedPhotoStrip photoIds={data?.photoIds ?? []} />

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
                      <span className={cn('shrink-0 font-mono text-role-caption font-semibold tabular-nums', stockQtyToneClass(row.qty))}>
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
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
