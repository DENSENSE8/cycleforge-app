'use client';

import { useMultiSkuBarcode } from './barcode/multi-sku/useMultiSkuBarcode';
import { MultiSkuBarcodeWorkspace } from './barcode/multi-sku/MultiSkuBarcodeWorkspace';

/**
 * Unit-label workspace: scan a SKU, capture serials, and print / log / reprint
 * products labels. A thin composition layer — all state and the three issue
 * paths live in {@link useMultiSkuBarcode}; the layout is presentational.
 *
 * Kept as its own module rather than inlined into `LabelsProductsWorkspace`,
 * because that caller reaches it through `next/dynamic`. Inlining would pull
 * the print/barcode graph into the labels chunk — `build-gotchas.md` → bundle
 * altitude.
 *
 * A `layout` prop used to pick between this workspace and a narrow-column
 * wizard. Every mount passed `horizontal`, so the wizard was reachable only
 * through the default parameter; both were deleted 2026-08-01.
 */
export default function MultiSkuSnBarcode() {
  const b = useMultiSkuBarcode();
  return <MultiSkuBarcodeWorkspace b={b} />;
}
