'use client';

/**
 * Phone to-ship order sheet — product header, LN/SKU/BY facts, picker/packer
 * cards, OOS as a critical block, 2-up operations. Ship is a small CTA.
 */

import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  ExternalLink,
  FileText,
  Printer,
  Truck,
  User,
} from '@/components/Icons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  CopyChip,
  EmptySkuChipFace,
  OrderIdChip,
  SkuScanRefChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { Button, Inset, Stack } from '@/design-system/primitives';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';
import {
  isToShipOutOfStock,
  toShipOrderId,
  toShipPackerLabel,
  toShipPickerLabel,
} from '@/lib/work-orders/to-ship-assignment';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { OutboundDocument } from '@/lib/documents/types';
import { formatDatePST, getDaysLateNullable, getDaysLateTone } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { MobileToShipPickerSheet } from '@/components/mobile/redesign/MobileToShipPickerSheet';
import { ToShipQtyFace } from '@/components/mobile/redesign/to-ship-faces';
import { OosProductCombobox } from '@/components/outbound/orders/oos/OosProductCombobox';
import type { OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';

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

function ClaimTicks({ filled }: { filled: number }) {
  return (
    <div className="mt-2 flex gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full',
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
    <div className="min-w-0 flex-1 rounded-2xl border border-border-soft bg-surface-card p-3">
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
      className="h-auto min-h-11 w-full items-start justify-center rounded-none px-3 py-2 text-left text-role-caption font-semibold"
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
  onProcess,
  onOutOfStock,
  onOpenDetail,
  onPassPicker,
  resolveName,
  blocked = false,
}: {
  row: WorkOrderRow | null;
  open: boolean;
  onClose: () => void;
  onProcess: (row: WorkOrderRow) => void;
  onOutOfStock: (row: WorkOrderRow, identity?: OrderShortageIdentity) => void;
  onOpenDetail: (row: WorkOrderRow) => void;
  onPassPicker: (row: WorkOrderRow, staff: { id: number; name: string }) => void;
  resolveName: (id: number) => string;
  blocked?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [oosPickOpen, setOosPickOpen] = useState(false);
  const entityId = row?.entityId ?? null;
  const { data: documents = [], isPending } = useQuery({
    queryKey: ['order-documents', entityId],
    queryFn: () => fetchOrderDocuments(entityId as number),
    enabled: open && entityId != null,
  });

  if (!row) return null;

  const isBlocked = blocked || isToShipOutOfStock(row);
  const listingHref = getExternalUrlByItemNumber(row.itemNumber || row.sku);
  const label = documents.find((doc) => doc.documentType === 'shipping_label');
  const slip = documents.find((doc) => doc.documentType === 'packing_slip');
  const labelHref = documentUrl(label);
  const slipHref = documentUrl(slip);
  const picker = toShipPickerLabel(row, resolveName);
  const packer = toShipPackerLabel(row, resolveName);
  const daysLate = getDaysLateNullable(row.deadlineAt);
  const itemNumber = row.itemNumber?.trim() || '';
  const orderId = toShipOrderId(row);
  const sku = row.sku?.trim() || '';
  const shipBy = formatDatePST(row.deadlineAt, { shortYear: true });
  const pickFilled = row.techId != null || picker ? (row.hasTechScan ? 3 : 2) : 0;
  const packFilled = row.packerId != null || packer ? 2 : 0;

  const openHref = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={() => {
          setPickerOpen(false);
          onClose();
        }}
        forceVariant="sheet"
        title={row.title}
        scrollBody
      >
        <div data-testid="to-ship-sheet">
          <Inset space="field">
            <Stack space="row" className="flex flex-col">
              <div className="flex justify-start">
                <ToShipQtyFace row={row} />
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <OrderIdChip
                  value={itemNumber || orderId}
                  display={getLast8(itemNumber || orderId)}
                  displayWidth="last8"
                  dense
                  truncateDisplay={false}
                />
                {sku ? (
                  <SkuScanRefChip value={sku} display={sku} dense />
                ) : (
                  <EmptySkuChipFace dense />
                )}
                {row.deadlineAt ? (
                  <CopyChip
                    value={row.deadlineAt}
                    display={shipBy}
                    tone="id"
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    dense
                    truncateDisplay={false}
                    fitDisplayWidth
                  />
                ) : null}
              </div>

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

              {isBlocked ? (
                <div className="rounded-2xl bg-rose-50 px-3 py-2 text-role-caption text-rose-800">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Critical Block: Out of stock
                  </p>
                  <p className="mt-0.5 pl-5 text-rose-700">Inventory mismatch for current unit</p>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-border-soft">
                <p className="px-3 pt-2 text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                  Operations
                </p>
                <div className="grid grid-cols-2">
                  <OpButton
                    icon={<User className="h-4 w-4" />}
                    label="Pass pick"
                    onClick={() => setPickerOpen(true)}
                  />
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
                      icon={<FileText className="h-4 w-4" />}
                      label="Label"
                      accessibleName="Shipping label"
                      disabled={!labelHref}
                      loading={isPending}
                      onClick={() => labelHref && openHref(labelHref)}
                    />
                    {!labelHref ? (
                      <p className="px-3 pb-2 text-role-eyebrow text-text-faint">
                        Prerequisites Pending
                      </p>
                    ) : null}
                  </div>
                  <OpButton
                    icon={<Printer className="h-4 w-4" />}
                    label="Inter Docs"
                    accessibleName="Internal documents"
                    disabled={!slipHref}
                    loading={isPending}
                    onClick={() => slipHref && openHref(slipHref)}
                  />
                </div>
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

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  radius="pill"
                  icon={<AlertTriangle />}
                  disabled={isBlocked}
                  className="text-role-caption"
                  onClick={() => setOosPickOpen(true)}
                >
                  Out of stock
                </Button>
                <Button
                  variant="primary"
                  radius="pill"
                  size="sm"
                  icon={<Truck />}
                  disabled={isBlocked}
                  className="min-w-16 px-3"
                  onClick={() => {
                    if (isBlocked) return;
                    onClose();
                    onProcess(row);
                  }}
                >
                  Ship
                </Button>
              </div>
              <p className={`text-role-eyebrow ${getDaysLateTone(daysLate)}`}>
                Ship by {formatDatePST(row.deadlineAt, { shortYear: true })}
              </p>
              {oosPickOpen && !isBlocked ? (
                <div className="pt-2" data-testid="mobile-oos-product-picker">
                  <OosProductCombobox
                    lines={[
                      {
                        id: row.entityId,
                        sku: row.sku,
                        product_title: row.title,
                        quantity: row.quantity,
                        catalog_image_url: row.imageUrl,
                      },
                    ]}
                    onPick={(_orderRowId, identity) => {
                      onOutOfStock(row, identity);
                      setOosPickOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </Stack>
          </Inset>
        </div>
      </BottomSheet>
      <MobileToShipPickerSheet
        row={row}
        open={open && pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPass={(staff) => {
          onPassPicker(row, staff);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
