import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { LabelsDocsDesk } from '@/features/labels-docs/LabelsDocsDesk';

export const metadata: Metadata = { title: 'Labels & docs' };

/** `/shipping/label-intake` — Labels & docs: print every stored label (paired or not) and file + print its order's packing slips and manuals. */
export default async function ShippingLabelsDocsPage() {
  await requirePermission('packing.review');
  return <LabelsDocsDesk />;
}
