import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { LabelIntakeLedger } from '@/features/label-intake/LabelIntakeLedger';

export const metadata: Metadata = { title: 'Label intake' };

/** `/shipping/label-intake` — the V1 label-ingestion ledger on the desk. */
export default async function ShippingLabelIntakePage() {
  await requirePermission('packing.review');
  return <LabelIntakeLedger />;
}
