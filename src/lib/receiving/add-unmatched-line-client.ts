/**
 * Shared client mutation for POST /api/receiving/add-unmatched-line.
 *
 * Used by {@link useUnmatchedItems} (items accordion) and by Classify identify
 * without mounting a second unmatched controller (no GET / setLines([]) flash).
 */

import type { QueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { writeReceivingSiblingLine } from '@/lib/queries/receiving-queries';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import type { EcwidProductSelection } from '@/components/receiving/unfound/ecwid-search/ecwid-search-shared';

type AddUnmatchedLineSelection = EcwidProductSelection;

type AddUnmatchedLineLinked = {
  carton: {
    zoho_purchaseorder_number: string | null;
    source: string | null;
    source_platform: string | null;
    intake_type?: string | null;
  };
  line?: {
    id: number;
    sku: string | null;
    item_name: string | null;
    quantity_expected: number | null;
    quantity_received: number;
    condition_grade: string | null;
    listing_url: string | null;
    source_platform_pill: string | null;
    image_url?: string | null;
  } | null;
};

type AddUnmatchedLineParams = {
  receivingId: number;
  selection: AddUnmatchedLineSelection;
  opts?: { allowOffPo?: boolean };
  listingUrlHint?: string;
  sourcePlatformHint?: string;
  receivingTypeHint?: string;
  /** When set, warm the siblings accordion cache for the created line. */
  queryClient?: QueryClient;
  onLinked?: (result: AddUnmatchedLineLinked) => void;
};

/**
 * POST add-unmatched-line + toast + refresh + optional siblings seed.
 * Returns the created line (with image_url) on success, else null.
 */
export async function addUnmatchedLine(
  params: AddUnmatchedLineParams,
): Promise<AddUnmatchedLineLinked['line'] | null> {
  const {
    receivingId,
    selection,
    opts,
    listingUrlHint,
    sourcePlatformHint,
    receivingTypeHint = 'PO',
    queryClient,
    onLinked,
  } = params;

  if (!Number.isFinite(receivingId) || receivingId <= 0) {
    toast.error('No carton to add to');
    return null;
  }

  const clientEventId = `add-line-${receivingId}-${Date.now()}`;
  const effectiveListingUrl =
    (selection.is_repair_service ? selection.ecwid_product_url : null) ||
    listingUrlHint ||
    undefined;
  const effectiveSourcePlatformPill = selection.is_repair_service
    ? 'ecwid'
    : sourcePlatformHint || undefined;
  const effectiveIntakeType = selection.is_repair_service
    ? 'repair'
    : receivingTypeHint.toLowerCase();

  const res = await fetch('/api/receiving/add-unmatched-line', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': clientEventId,
    },
    body: JSON.stringify({
      receiving_id: receivingId,
      ...(opts?.allowOffPo ? { allow_off_po: true } : {}),
      ...(selection.sku_platform_id_row != null && selection.sku_platform_id_row > 0
        ? { sku_platform_id_row: selection.sku_platform_id_row }
        : {}),
      sku_catalog_id: selection.sku_catalog_id,
      sku: selection.sku || undefined,
      item_name: selection.item_name,
      source_platform_pill: effectiveSourcePlatformPill,
      intake_type: effectiveIntakeType,
      listing_url: effectiveListingUrl,
      is_repair_service: selection.is_repair_service || undefined,
      ecwid_order_id: selection.ecwid_order_id || undefined,
      client_event_id: clientEventId,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) {
    toast.error(body.error ?? `add line failed (${res.status})`);
    return null;
  }

  const lineWithImage = body.line
    ? { ...body.line, image_url: selection.image_url }
    : null;

  if (queryClient && lineWithImage?.id) {
    writeReceivingSiblingLine(queryClient, receivingId, lineWithImage);
  }

  if (selection.is_repair_service || selection.ecwid_order_id) {
    const carton = body.carton as
      | {
          zoho_purchaseorder_number: string | null;
          source: string | null;
          source_platform: string | null;
        }
      | null
      | undefined;
    refreshDomains(REFRESH_BUNDLES.receivingWrite);
    window.dispatchEvent(
      new CustomEvent('receiving-package-updated', {
        detail: {
          receiving_id: receivingId,
          source_platform: carton?.source_platform ?? 'ecwid',
          zoho_purchaseorder_number: carton?.zoho_purchaseorder_number ?? null,
        },
      }),
    );
    const repId = carton?.zoho_purchaseorder_number || selection.ecwid_order_id;
    onLinked?.({
      carton: {
        zoho_purchaseorder_number: carton?.zoho_purchaseorder_number ?? repId ?? null,
        source: carton?.source ?? 'zoho_po',
        source_platform: carton?.source_platform ?? 'ecwid',
      },
      line: lineWithImage,
    });
    if (selection.is_repair_service) {
      toast.success(repId ? `Linked repair order #${repId}` : 'Repair service linked');
      refreshDomains(['repairs']);
    } else {
      toast.success(repId ? `Linked Ecwid order #${repId}` : 'Store order linked');
    }
  } else {
    const label = selection.item_name || selection.sku || 'item';
    toast.success(
      opts?.allowOffPo ? `Added off-PO · ${label}` : `Acknowledged · ${label}`,
    );
    refreshDomains(REFRESH_BUNDLES.receivingWrite);
    onLinked?.({
      carton: {
        zoho_purchaseorder_number:
          (body.carton as { zoho_purchaseorder_number?: string | null } | null)
            ?.zoho_purchaseorder_number ?? null,
        source:
          (body.carton as { source?: string | null } | null)?.source ?? 'unmatched',
        source_platform:
          (body.carton as { source_platform?: string | null } | null)?.source_platform ??
          null,
      },
      line: lineWithImage,
    });
  }

  return lineWithImage;
}
