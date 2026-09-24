import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { LabelIntakeLedger } from '@/features/label-intake/LabelIntakeLedger';

export const metadata: Metadata = { title: 'Label intake' };

/**
 * `/m/label-intake` — phone SoT for the V1 label-ingestion ledger. The same
 * component as the desk row: the evidence pane becomes a bottom sheet on a
 * narrow container, so upload, reprocess and apply all complete here.
 */
export default async function MobileLabelIntakePage() {
  await requirePermission('packing.review');
  return <LabelIntakeLedger />;
}
