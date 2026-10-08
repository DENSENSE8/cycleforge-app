'use client';

/**
 * A stock record's temporary (`TMP-`) SKU: the copy chip, plus an edit button
 * that shows on hover (always on touch) and opens the same Pair to SKU action
 * as the record's Actions panel verb. Its glyph is the pair link, not a pencil — the
 * SKU chip already wears the pencil as its tone mark. No "Open this SKU in…":
 * a temporary SKU has no outside home to open.
 */

import { useState } from 'react';
import { Link2 } from '@/components/Icons';
import { SkuPairSheet } from '@/components/inventory/sku-exceptions/SkuPairSheet';
import { CopyChip } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { cn } from '@/utils/_cn';

export function StockTemporarySku({
  sku,
  item,
  onPaired,
}: {
  sku: string;
  /** The loaded temporary SKU; the pencil waits for it. */
  item: ProvisionalSkuDetail | null;
  /** The merge landed — this record no longer exists. */
  onPaired: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Touch has no hover: the pencil stays visible on the phone.
  const { isMobile } = useUIModeOptional();

  return (
    <span className="group/tmp-sku flex min-w-0 items-center gap-1" data-testid="stock-record-temporary-sku">
      <CopyChip value={sku} display={sku} tone="sku" fitDisplayWidth />
      <HoverTooltip label="Pair to SKU" asChild placement="above">
        <IconButton
          icon={<Link2 className="size-3.5" aria-hidden />}
          ariaLabel={`Pair ${sku} to a permanent SKU`}
          size="xs"
          radius="pill"
          tone="neutral"
          disabled={item == null}
          // Opacity only: the button keeps its box, so revealing it never moves the line.
          className={cn(
            !isMobile && 'opacity-0 transition-opacity group-hover/tmp-sku:opacity-100 focus-visible:opacity-100',
          )}
          onClick={() => setOpen(true)}
          data-testid="stock-record-temporary-sku-edit"
        />
      </HoverTooltip>
      <SkuPairSheet open={open} onClose={() => setOpen(false)} item={item} onPaired={onPaired} />
    </span>
  );
}
