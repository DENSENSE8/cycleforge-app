'use client';

import { useSearchParams } from 'next/navigation';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { parseReviewMode, type ReviewMode } from '@/features/review/review-mode';

/**
 * Teaching copy is keyed to the MODE that owns it (`display/workbench.md` →
 * Teaching empty + typed states). One line served all three modes, so
 * `?mode=catalog-link` — which has no packed orders and no Pairing control —
 * read the packer prompt.
 *
 * Packing and Pairing share a line on purpose: both tables are the same
 * packed-order collection (`packedOrdersQuery`), and the sentence already names
 * the Pairing jump. That string is unchanged; only catalog-link was wrong.
 */
const PACKED_ORDER_PROMPT =
  'Select a packed order in the table to review slip/box photos, or open Pairing to allocate a serial to an outbound line.';

const REVIEW_RAIL_EMPTY_STATE: Record<ReviewMode, string> = {
  packer: PACKED_ORDER_PROMPT,
  pairing: PACKED_ORDER_PROMPT,
  'catalog-link':
    'Select a listing in the table to link it to a catalog SKU, or open Missing item number to resolve sheet rows that never became orders.',
};

/**
 * Review station sidebar — slim chrome only. The primary map lives in the
 * Workbench table (`ReviewPackingTable` / `ReviewPairingTable` /
 * `ReviewCatalogLinkTable`); mode pills are SIDEBAR_PAGE_NAV.
 *
 * The staff filter is scoped to the modes that READ `?staff=` — Packing and
 * Pairing both resolve it through `parseStaffParam` into `packedOrdersQuery`.
 * `ReviewCatalogLinkTable` never reads it, so on catalog-link the control was a
 * filter that filtered nothing. Hiding it does NOT drop the param (the mode
 * target carries `staff` across the switch), so a round trip through
 * catalog-link comes back to the same filtered packing queue.
 */
export function ReviewSidebarPanel() {
  const searchParams = useSearchParams();
  const mode = parseReviewMode(searchParams.get('mode'));
  const staffScoped = mode === 'packer' || mode === 'pairing';

  return (
    <SidebarShell
      headerRows={[
        // Falsy rows are skipped by the shell — no empty 40px band.
        staffScoped && (
          <div key="review-staff" className="flex items-center justify-end px-1">
            <StaffFilterButton />
          </div>
        ),
      ]}
      bodyClassName="pb-6"
    >
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-sunken px-4 py-6 text-center text-role-caption font-semibold text-text-muted">
        {REVIEW_RAIL_EMPTY_STATE[mode]}
      </div>
    </SidebarShell>
  );
}
