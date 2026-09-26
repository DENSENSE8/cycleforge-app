'use client';

/** Phone to-ship order sheet — product header, LN/SKU/BY facts, picker/packer cards, OOS as a critical block, 2-up operations. */

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import {
  ClipboardList,
  ExternalLink,
  FileText,
  Printer,
  Upload,
} from '@/components/Icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { Button, Inset, Stack } from '@/design-system/primitives';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import {
  toShipOrderId,
  toShipPackerLabel,
  toShipPickerLabel,
} from '@/lib/work-orders/to-ship-assignment';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { OutboundDocumentsResponse, PackingSlipIngestState } from '@/lib/documents/types';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { MobileOrderDocumentsSheet } from '@/components/mobile/redesign/MobileOrderDocumentsSheet';

async function fetchOrderDocuments(entityId: number): Promise<OutboundDocumentsResponse> {
  const res = await fetch(`/api/orders/${entityId}/documents`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load order documents');
  return (await res.json()) as OutboundDocumentsResponse;
}

function packingSlipStatusClass(status: PackingSlipIngestState['status']): string {
  if (status === 'available') return 'text-text-success';
  if (status === 'failed') return 'text-text-danger';
  return 'text-text-warning';
}

function ClaimTicks({ filled }: { filled: number }) {
  return (
    <div className="mt-2 flex gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'h-1 flex-1',
            cornerClass('pill'),
            i < filled ? 'bg-text-default' : 'bg-border-soft',
          )}
        />
      ))}
    </div>
  );
}

function PersonCard({
  staffId,
  name,
  colorHex,
  role,
  filled,
}: {
  staffId: number | null;
  name: string | null;
  colorHex?: string | null;
  role: string;
  filled: number;
}) {
  return (
    <div className={cn('min-w-0 flex-1 border border-border-soft bg-surface-card p-3', cornerClass('card'))}>
      <div className="flex items-center gap-2">
        <StaffAvatar
          staffId={staffId}
          name={name}
          colorHex={colorHex}
          size="md"
          alt=""
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-default">
            {name?.trim() || 'Unassigned'}
          </p>
          <p className="text-role-caption text-text-muted">{role}</p>
        </div>
      </div>
      <ClaimTicks filled={filled} />
    </div>
  );
}


function OpButton({
  icon,
  label,
  accessibleName,
  disabled,
  loading,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  accessibleName?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      radius="flush"
      icon={icon}
      disabled={disabled}
      loading={loading}
      aria-label={accessibleName ?? label}
      className={cn('h-auto min-h-11 w-full items-start justify-center px-3 py-2 text-left text-role-caption font-semibold', cornerClass('flush'))}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function MobileToShipSheet({
  row,
  open,
  onClose,
  onOpenDetail,
  resolveName,
}: {
  row: WorkOrderRow | null;
  open: boolean;
  onClose: () => void;
  onOpenDetail: (row: WorkOrderRow) => void;
  resolveName: (id: number) => string;
}) {
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [activeDocumentType, setActiveDocumentType] = useState<'shipping_label' | 'packing_slip'>('shipping_label');
  const shippingLabelInputRef = useRef<HTMLInputElement | null>(null);
  const entityId = row?.entityId ?? null;
  const documentsQuery = useQuery({
    queryKey: ['order-documents', entityId],
    queryFn: () => fetchOrderDocuments(entityId as number),
    enabled: open && entityId != null,
    refetchInterval: (query) =>
      query.state.data?.packingSlipIngest?.status === 'processing' ? 2_000 : false,
  });
  const documents = documentsQuery.data?.documents ?? [];

  const uploadShippingLabel = useMutation({
    mutationFn: async (file: File) => {
      if (entityId == null) throw new Error('Order is unavailable');
      const form = new FormData();
      form.set('file', file);
      form.set('documentType', 'shipping_label');
      form.set('orderRef', row ? toShipOrderId(row) : String(entityId));
      const response = await fetch(`/api/orders/${entityId}/documents/upload`, {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Could not upload shipping label');
      }
    },
    onSuccess: async () => {
      await documentsQuery.refetch();
      setActiveDocumentType('shipping_label');
      setDocumentsOpen(true);
    },
  });

  if (!row) return null;

  const listingHref = getExternalUrlByItemNumber(row.itemNumber || row.sku);
  const label = documents.find((doc) => doc.documentType === 'shipping_label');
  const slip = documents.find((doc) => doc.documentType === 'packing_slip');
  const isEcwid = row.accountSource?.toLowerCase().includes('ecwid') ?? false;
  const packingSlipIngest: PackingSlipIngestState | null = slip
    ? {
        status: 'available',
        label: 'Available',
        attemptCount: documentsQuery.data?.packingSlipIngest?.attemptCount ?? 0,
        lastError: null,
        nextAttemptAt: null,
        documentId: slip.id,
      }
    : documentsQuery.data?.packingSlipIngest ??
      (isEcwid
        ? {
            status: 'processing',
            label: 'Processing',
            attemptCount: 0,
            lastError: null,
            nextAttemptAt: null,
            documentId: null,
          }
        : null);
  const picker = toShipPickerLabel(row, resolveName);
  const packer = toShipPackerLabel(row, resolveName);
  const pickFilled = row.techId != null || picker ? (row.hasTechScan ? 3 : 2) : 0;
  const packFilled = row.packerId != null || packer ? 2 : 0;

  const openHref = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const openDocument = (type: 'shipping_label' | 'packing_slip') => {
    setActiveDocumentType(type);
    setDocumentsOpen(true);
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={() => {
          onClose();
        }}
        forceVariant="sheet"
        title={row.title}
        scrollBody
      >
        <div data-testid="to-ship-sheet">
          <Inset space="field">
            <Stack space="row" className="flex flex-col">
              <div
                data-testid="to-ship-sheet-assignees"
                className="flex gap-2"
              >
                <PersonCard
                  staffId={row.techId}
                  name={picker}
                  colorHex={row.techColorHex}
                  role="Picker"
                  filled={pickFilled}
                />
                <PersonCard
                  staffId={row.packerId}
                  name={packer}
                  colorHex={row.packerColorHex}
                  role="Packer"
                  filled={packFilled}
                />
              </div>

              <div className={cn('overflow-hidden border border-border-soft', cornerClass('card'))}>
                <p className="px-3 pt-2 text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                  Operations
                </p>
                <div className="grid grid-cols-1">
                  <OpButton
                    icon={<ExternalLink className="h-4 w-4" />}
                    label="List Item"
                    accessibleName="Listing"
                    disabled={!listingHref}
                    onClick={() => listingHref && openHref(listingHref)}
                  />
                </div>
                <p className="px-3 pt-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                  Documentation
                </p>
                <div className="grid grid-cols-2">
                  <div>
                    <OpButton
                      icon={label ? <FileText className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                      label={label ? 'View label' : 'Upload label'}
                      accessibleName={label ? 'View shipping label' : 'Upload shipping label'}
                      loading={documentsQuery.isPending || uploadShippingLabel.isPending}
                      onClick={() => {
                        if (label) openDocument('shipping_label');
                        else shippingLabelInputRef.current?.click();
                      }}
                    />
                    <input
                      ref={shippingLabelInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
                      className="hidden"
                      data-testid="mobile-shipping-label-input"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) uploadShippingLabel.mutate(file);
                        event.target.value = '';
                      }}
                    />
                    {!label ? (
                      <p className="px-3 pb-2 text-role-eyebrow text-text-faint">
                        No imported label
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <OpButton
                      icon={<Printer className="h-4 w-4" />}
                      label={slip ? 'View slip' : 'Packing slip'}
                      accessibleName={
                        slip
                          ? 'View packing slip'
                          : packingSlipIngest?.status === 'failed'
                            ? 'Packing slip import failed'
                            : 'Packing slip processing'
                      }
                      disabled={!slip}
                      loading={documentsQuery.isPending}
                      onClick={() => {
                        if (slip) openDocument('packing_slip');
                      }}
                    />
                    {packingSlipIngest ? (
                      <p
                        className={cn(
                          'px-3 pb-2 text-role-eyebrow font-semibold',
                          packingSlipStatusClass(packingSlipIngest.status),
                        )}
                        title={packingSlipIngest.lastError ?? undefined}
                      >
                        {packingSlipIngest.label}
                      </p>
                    ) : null}
                  </div>
                </div>
                {uploadShippingLabel.error ? (
                  <p role="alert" className="border-t border-border-hairline px-3 py-2 text-role-caption text-text-danger">
                    {uploadShippingLabel.error.message}
                  </p>
                ) : null}
                <p className="px-3 pt-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                  Details
                </p>
                <OpButton
                  icon={<ClipboardList className="h-4 w-4" />}
                  label="Order Details"
                  accessibleName="Order details"
                  onClick={() => onOpenDetail(row)}
                />
              </div>

            </Stack>
          </Inset>
        </div>
      </BottomSheet>
      <MobileOrderDocumentsSheet
        open={documentsOpen}
        onClose={() => setDocumentsOpen(false)}
        documents={documents}
        activeType={activeDocumentType}
        onActiveTypeChange={setActiveDocumentType}
      />
    </>
  );
}
