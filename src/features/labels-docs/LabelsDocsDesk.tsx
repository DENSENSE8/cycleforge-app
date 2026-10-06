'use client';

/**
 * Labels & docs — `/shipping/label-intake`. The sidebar's two views, under
 * bare keys 1 · 2:
 *
 *   Bulk    (bare) the uploaded PDFs as a file list — upload + print (`FilesDesk`)
 *   Orders  `?view=orders` one row per order, shaped as its slots — pair + print (`OrdersDesk`)
 *
 * `?view=` picks; the sidebar owns the switch.
 */

import { useSearchParams } from 'next/navigation';
import { parseLabelIntakeView } from '@/lib/triage/views/label-intake';
import { FilesDesk } from './files/FilesDesk';
import { OrdersDesk } from './orders/OrdersDesk';

export function LabelsDocsDesk() {
  const view = parseLabelIntakeView(useSearchParams().get('view'));
  return view === 'orders' ? <OrdersDesk /> : <FilesDesk />;
}
