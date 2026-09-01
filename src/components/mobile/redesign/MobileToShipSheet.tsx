'use client';

/**
 * Phone to-ship order sheet — identity numbers, listing, label, packing slip.
 * Tap a queue row to open; Ship on the row / swipe still processes.
 */

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ClipboardList,
  ExternalLink,
  FileText,
  Printer,
  Truck,
} from '@/components/Icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, Inset, Stack } from '@/design-system/primitives';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import {
  toShipPackerLabel,
  toShipPickerLabel,
} from '@/lib/work-orders/to-ship-assignment';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { OutboundDocument } from '@/lib/documents/types';
import { formatDatePST, getDaysLateNullable, getDaysLateTone } from '@/utils/date';
import {
  ToShipIdentityChips,
  ToShipSlotSubtitle,
} from '@/components/mobile/redesign/MobileToShipRow';

async function fetchOrderDocuments(entityId: number): Promise<OutboundDocument[]> {
  const res = await fetch(`/api/orders/${entityId}/documents`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!data || typeof data !== 'object' || !('documents' in data)) return [];
  const documents = (data as { documents: unknown }).documents;
  return Array.isArray(documents) ? (documents as OutboundDocument[]) : [];
}

function documentUrl(doc: OutboundDocument | undefined): string | null {
  const url = doc?.data?.url?.trim();
  return url || null;
}

export function MobileToShipSheet({
  row,
  open,
  onClose,
  onProcess,
  onOutOfStock,
  onOpenDetail,
  resolveName,
}: {
  row: WorkOrderRow | null;
  open: boolean;
  onClose: () => void;
  onProcess: (row: WorkOrderRow) => void;
  onOutOfStock: (row: WorkOrderRow) => void;
  onOpenDetail: (row: WorkOrderRow) => void;
  resolveName: (id: number) => string;
}) {
  const entityId = row?.entityId ?? null;
  const { data: documents = [], isPending } = useQuery({
    queryKey: ['order-documents', entityId],
    queryFn: () => fetchOrderDocuments(entityId as number),
    enabled: open && entityId != null,
  });

  if (!row) return null;

  const listingHref = getExternalUrlByItemNumber(row.itemNumber || row.sku);
  const label = documents.find((doc) => doc.documentType === 'shipping_label');
  const slip = documents.find((doc) => doc.documentType === 'packing_slip');
  const labelHref = documentUrl(label);
  const slipHref = documentUrl(slip);
  const picker = toShipPickerLabel(row, resolveName);
  const packer = toShipPackerLabel(row, resolveName);
  const daysLate = getDaysLateNullable(row.deadlineAt);

  const openHref = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <BottomSheet open={open} onClose={onClose} forceVariant="sheet" title={row.title}>
      <div data-testid="to-ship-sheet">
        <Inset space="field">
          <Stack space="tight" className="flex flex-col">
            <ToShipIdentityChips row={row} />
            <ToShipSlotSubtitle row={row} />
            <p className="text-role-eyebrow text-text-soft">
              Pick {picker ?? '—'} · Pack {packer ?? '—'}
            </p>
            <p className={`text-role-eyebrow ${getDaysLateTone(daysLate)}`}>
              Ship by {formatDatePST(row.deadlineAt, { shortYear: true })}
            </p>
            {row.sku ? <p className="text-role-eyebrow text-text-soft">{row.sku}</p> : null}

            <Button
              variant="secondary"
              radius="surface"
              icon={<ExternalLink />}
              disabled={!listingHref}
              onClick={() => listingHref && openHref(listingHref)}
            >
              Listing
            </Button>
            <Button
              variant="secondary"
              radius="surface"
              icon={<Printer />}
              disabled={!labelHref}
              loading={isPending}
              onClick={() => labelHref && openHref(labelHref)}
            >
              Shipping label
            </Button>
            <Button
              variant="secondary"
              radius="surface"
              icon={<FileText />}
              disabled={!slipHref}
              loading={isPending}
              onClick={() => slipHref && openHref(slipHref)}
            >
              Internal documents
            </Button>
            <Button
              variant="secondary"
              radius="surface"
              icon={<ClipboardList />}
              onClick={() => onOpenDetail(row)}
            >
              Order details
            </Button>
            <Button
              variant="warning"
              radius="surface"
              icon={<AlertTriangle />}
              onClick={() => onOutOfStock(row)}
            >
              Out of stock
            </Button>
            <Button
              variant="primary"
              radius="surface"
              icon={<Truck />}
              onClick={() => {
                onClose();
                onProcess(row);
              }}
            >
              Ship
            </Button>
          </Stack>
        </Inset>
      </div>
    </BottomSheet>
  );
}
