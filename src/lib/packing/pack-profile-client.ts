/** The ONE client-side writer for a SKU's pack standard time. */

import { snapMinutes, tierForMinutes } from '@/lib/packing/pack-standard-stops';

type PackProfileSaveResult = {
  ok: boolean;
  status: number;
  /** Operator-readable reason; already mapped for the 403 case by callers. */
  error?: string;
  /** What actually got stored, after snapping to the stop list. */
  minutes: number;
};

export async function savePackStandardMinutes(args: {
  skuCatalogId: number;
  minutes: number;
}): Promise<PackProfileSaveResult> {
  const minutes = snapMinutes(args.minutes);
  const res = await fetch(`/api/sku-catalog/${args.skuCatalogId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packTier: tierForMinutes(minutes),
      estimatedPackMinutes: minutes,
    }),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  return {
    ok: res.ok && body?.success !== false,
    status: res.status,
    error: body?.error,
    minutes,
  };
}

/** Shared copy so both surfaces fail the same way. */
export function packProfileSaveError(result: PackProfileSaveResult): string {
  if (result.status === 403) return 'You need catalog manage permission to edit time to pack.';
  return result.error || 'Could not save time to pack.';
}
