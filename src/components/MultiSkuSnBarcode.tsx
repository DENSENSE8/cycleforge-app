'use client';

import { useMultiSkuBarcode } from './barcode/multi-sku/useMultiSkuBarcode';
import { MultiSkuBarcodeWorkspace } from './barcode/multi-sku/MultiSkuBarcodeWorkspace';

/** Unit-label workspace: */
export default function MultiSkuSnBarcode() {
  const b = useMultiSkuBarcode();
  return <MultiSkuBarcodeWorkspace b={b} />;
}
