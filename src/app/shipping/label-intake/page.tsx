import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { LabelIntakeLedger } from '@/features/label-intake/LabelIntakeLedger';

export const metadata: Metadata = { title: 'Label intake' };

/**
 * `/shipping/label-intake` — the V1 label-ingestion ledger on the desk.
 *
 * Outside the `(desk)` group on purpose: the ledger is an edge-to-edge
 * terminal surface (the scan-out precedent), not a stage capped at the desk
 * width. The phone mounts the same component at `/m/label-intake`.
 */
export default async function ShippingLabelIntakePage() {
  await requirePermission('packing.review');
  return <LabelIntakeLedger />;
}
