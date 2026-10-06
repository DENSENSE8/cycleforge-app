'use client';

import { useState, type ReactNode } from 'react';
import { RecordPhoto } from '@/design-system/components/record-ledger/RecordPhoto';
import type { PrepackCatalogChoice } from '@/lib/prepack/types';
import { cn } from '@/utils/_cn';

/**
 * A product's photo tile — the product photo, or its initials (also when the
 * photo URL fails, e.g. a Zoho image while Zoho is disconnected).
 * Non-interactive on purpose: it sits inside row buttons.
 */
export function ProductThumb({ src, title, className }: { src: string | null; title: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shown = src && src !== failedSrc ? src : null;
  return (
    <span
      className={cn('relative block size-11 shrink-0 overflow-hidden rounded-mode-control bg-surface-sunken ring-1 ring-inset ring-black/5', className)}
      data-testid="product-thumb"
      data-has-photo={shown ? 'true' : 'false'}
      data-photo-failed={src && src === failedSrc ? 'true' : undefined}
    >
      <RecordPhoto src={shown} fallback={title} onError={() => setFailedSrc(src)} />
    </span>
  );
}

/**
 * The one product identity face — square image, title, SKU underneath — in
 * the browser rows, the form's Product section and the context hero.
 * `photo` lets the caller wrap the thumb (the hero's shared-layout morph).
 */
export function ProductIdentity({
  product,
  size = 'row',
  photo,
  trailing,
}: {
  product: PrepackCatalogChoice;
  size?: 'row' | 'card' | 'hero';
  photo?: (thumb: ReactNode) => ReactNode;
  trailing?: ReactNode;
}) {
  const thumb = (
    <ProductThumb
      src={product.imageUrl}
      title={product.title}
      className={size === 'hero' ? 'size-full' : size === 'card' ? 'size-20' : 'size-12'}
    />
  );
  if (size === 'hero') {
    return (
      <div className="flex flex-col gap-3" data-testid="prepack-product-hero">
        <div className="aspect-square w-full max-w-72">{photo ? photo(thumb) : thumb}</div>
        <div className="min-w-0">
          <p className="break-words text-role-title font-semibold text-mode-ink">{product.title}</p>
          <p className="break-all font-mono text-role-caption text-text-muted">{product.sku}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {photo ? photo(thumb) : thumb}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className={cn('line-clamp-2 break-words font-semibold text-mode-ink', size === 'card' ? 'text-role-data' : 'text-sm')}>
          {product.title}
        </span>
        <span className="break-all font-mono text-role-caption text-text-muted">{product.sku}</span>
      </div>
      {trailing}
    </div>
  );
}
