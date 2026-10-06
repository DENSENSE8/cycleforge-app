/** Manuals / paperwork for an order pack bundle — `listOrderPaperworkForPrint` rows (`product_manuals`, the one paperwork store). */

export interface PackBundleManual {
  /** product_manuals.id */
  id: number;
  displayName: string;
  sourceUrl: string | null;
  fileName: string | null;
  sku: string | null;
  itemNumber: string | null;
}

export async function readProductManualBytes(
  manual: PackBundleManual,
): Promise<{ bytes: Buffer; contentType: string; filename: string } | null> {
  const url = manual.sourceUrl;
  if (!url || !url.startsWith('http')) return null;

  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const contentType =
      res.headers.get('content-type') ||
      (url.toLowerCase().includes('.pdf') ? 'application/pdf' : 'application/octet-stream');
    const ab = await res.arrayBuffer();
    return {
      bytes: Buffer.from(ab),
      contentType,
      filename: manual.fileName || `${manual.displayName}.pdf`,
    };
  } catch {
    return null;
  }
}
