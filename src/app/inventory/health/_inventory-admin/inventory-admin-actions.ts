'use server';

import { redirect } from 'next/navigation';

/** Server action: redirect to the per-unit timeline page on form submit. */
export async function lookupUnit(formData: FormData): Promise<void> {
  const ref = String(formData.get('ref') ?? '').trim();
  if (ref) redirect(`/inventory?unit=${encodeURIComponent(ref)}`);
  redirect('/inventory/health');
}

/** Server action: redirect to the SKU detail page on form submit. */
export async function lookupSku(formData: FormData): Promise<void> {
  const sku = String(formData.get('sku') ?? '').trim();
  if (sku) redirect(`/inventory/health/sku/${encodeURIComponent(sku)}`);
  redirect('/inventory/health');
}
