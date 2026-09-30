'use client';

/**
 * RecordItem — ONE item row for every desk record (owner 2026-09-29): the
 * inbound receiving record, the outbound order record, pickup, repair and QC.
 * One ruler:
 *
 *   [photo 112²] title ................................. count
 *                SKU  <value>        [actions] | Item # <value>        [actions]
 *                Cond <chip>                   | Qty    <value>
 *                Serial <chips>                | Cost   <unit × n = total>
 *
 * Every row is an {@link ItemIdentityRow} — the same label width, the same
 * height, the actions in the same fixed slot — so SKU and Item # values start
 * on the same x in every record. Values are plain values; links and menus live
 * in the actions slot, never inside the value.
 *
 * The photo tile takes a product photo (click, drag-drop, paste; the camera
 * when `capture`) for anyone with `receiving.upload_photo`: it lands on the
 * catalog SKU as its listing cover and paints at once.
 */

import { useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2 } from '@/components/Icons';
import { CopyableCellValue } from '@/components/ui/CopyChip';
import { useAuth } from '@/contexts/AuthContext';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { recordInitials } from '@/design-system/components/record-ledger/IndustrialRecord';
import { ItemIdentityRow, SkuOpenInMenu } from '@/design-system/components/record-ledger/RecordItemIdentity';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/industrial-record';
import { uploadSkuProductPhoto } from '@/lib/photos/sku-product-photo-upload';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** One labelled row under SKU (left) or Item # (right). `wrap`: a multi-value row (serial chips) may grow past one line. */
export interface RecordItemFact {
  label: string;
  value: ReactNode;
  actions?: ReactNode;
  testId?: string;
  wrap?: boolean;
}

/** Where an uploaded product photo lands — the catalog SKU — and who hears about it. */
export interface RecordItemPhotoUpload {
  skuCatalogId: number;
  /** Refetch the record's read so every surface paints the new cover. */
  onUploaded?: () => void;
  /** Phone surfaces (`/m/*`) open the camera. */
  capture?: boolean;
}

/** A plain identity value — copyable, the record's id face; `—` when unknown. */
export function RecordItemValue({ value, historyKind }: { value: string | null | undefined; historyKind: string }) {
  const clean = String(value ?? '').trim() || null;
  return (
    <CopyableCellValue
      value={clean}
      display={clean ?? '—'}
      historyKind={historyKind}
      disableCopy={!clean}
      className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal', clean ? 'text-mode-ink' : 'text-mode-muted')}
    />
  );
}

/** `unit × n = total` — the line price read on the item itself; one unit reads its total alone. */
export function RecordItemCost({
  unit,
  qty,
  total,
  format,
  testId = 'record-item-cost',
}: {
  unit: number | null;
  qty: number;
  total: number | null;
  format: (value: number) => string;
  testId?: string;
}) {
  const lineTotal = total ?? (unit != null ? unit * qty : null);
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5 whitespace-nowrap" data-testid={testId}>
      {unit != null && qty > 1 ? (
        <span className="text-role-caption tabular-nums text-mode-muted">
          {format(unit)} × {qty} =
        </span>
      ) : null}
      <span className={cn(RECORD_PRICE_CLASS, lineTotal == null && 'text-mode-muted')}>{lineTotal != null ? format(lineTotal) : '—'}</span>
    </span>
  );
}

const TILE_CLASS = 'h-28 w-28 overflow-hidden border border-mode-frame';

function RecordItemPhoto({
  src,
  title,
  onOpen,
  upload,
  testId,
}: {
  src: string | null;
  title: string;
  onOpen?: () => void;
  upload: RecordItemPhotoUpload | null;
  testId: string;
}) {
  const canUpload = useAuth().has('receiving.upload_photo') && upload != null && upload.skuCatalogId > 0;
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const url = uploaded ?? src;

  const send = (file: File | null | undefined) => {
    if (!file || !upload || busy) return;
    setBusy(true);
    uploadSkuProductPhoto(upload.skuCatalogId, file)
      .then((photo) => {
        setUploaded(photo.url);
        toast.success('Product photo saved');
        upload.onUploaded?.();
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not save the product photo'))
      .finally(() => setBusy(false));
  };

  const dropTarget = canUpload
    ? {
        onDragOver: (event: DragEvent) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          setDragging(false);
          send(event.dataTransfer.files[0]);
        },
        onPaste: (event: ClipboardEvent) => {
          const file = Array.from(event.clipboardData.files).find((f) => f.type.startsWith('image/'));
          if (!file) return;
          event.preventDefault();
          send(file);
        },
      }
    : {};

  const initials = (
    <span className="flex h-full w-full items-center justify-center text-role-title font-black text-mode-muted industrial:font-mono" aria-hidden>
      {recordInitials(title)}
    </span>
  );

  return (
    <div className="group/photo relative shrink-0" data-testid={`${testId}-photo-tile`} {...dropTarget}>
      {url ? (
        <PhotoHoverPeek
          src={url}
          alt={title}
          onOpen={uploaded ? undefined : onOpen}
          testId={`${testId}-photo`}
          className={cn(TILE_CLASS, 'block bg-surface-card')}
        >
          <Image src={url} alt="" fill unoptimized sizes="112px" className="object-cover" />
        </PhotoHoverPeek>
      ) : canUpload ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label="Add product photo"
          title="Add product photo — click, drop or paste an image"
          data-testid={`${testId}-photo-add`}
          className={cn('ds-raw-button relative flex flex-col bg-mode-well hover:bg-mode-hover', TILE_CLASS, focusRing('control'))}
        >
          {initials}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1 text-role-caption font-medium text-mode-muted">
            <ImagePlus className="size-3.5" aria-hidden />
            Add photo
          </span>
        </button>
      ) : (
        <span className={cn('block bg-mode-well', TILE_CLASS)} data-testid={`${testId}-photo`}>
          {initials}
        </span>
      )}
      {url && canUpload ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label="Replace product photo"
          title="Replace product photo — click, drop or paste an image"
          data-testid={`${testId}-photo-replace`}
          className={cn(
            'ds-raw-button absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-mode-control bg-mode-panel text-mode-ink opacity-0 shadow-elev-overlay transition-opacity group-focus-within/photo:opacity-100 group-hover/photo:opacity-100',
            focusRing('control'),
          )}
        >
          <ImagePlus className="size-3.5" aria-hidden />
        </button>
      ) : null}
      {busy || dragging ? (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-mode-edge bg-mode-panel text-mode-ink opacity-90"
          aria-hidden
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
        </span>
      ) : null}
      {canUpload ? (
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture={upload?.capture ? 'environment' : undefined}
          className="hidden"
          data-testid={`${testId}-photo-input`}
          onChange={(event) => {
            send(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      ) : null}
    </div>
  );
}

export function RecordItem({
  title,
  titleAccessory,
  count,
  current = false,
  photo,
  sku,
  skuActions,
  item,
  left = [],
  right = [],
  children,
  testId = 'record-item',
}: {
  title: string;
  /** Beside the title (an auto-assign rule, a badge). */
  titleAccessory?: ReactNode;
  /** Top right: received / expected, or the unit count. */
  count?: ReactNode;
  /** The line the record was opened on — raised panel fill. */
  current?: boolean;
  photo: { src: string | null; onOpen?: () => void; upload?: RecordItemPhotoUpload | null };
  sku: string | null;
  /** Defaults to the SKU's links out. */
  skuActions?: ReactNode;
  /** The Item # row — value and its actions (listing ↗, documents, editor). */
  item: { value: ReactNode; actions?: ReactNode; testId?: string; label?: string };
  /** Rows under SKU: condition, serials. */
  left?: readonly RecordItemFact[];
  /** Rows under Item #: qty, cost. */
  right?: readonly RecordItemFact[];
  /** Below the ruler: notes, photo strips, item facts. */
  children?: ReactNode;
  /** Root test id; `-photo`, `-ids`, `-count` derive from it. */
  testId?: string;
}) {
  const row = (fact: RecordItemFact) => (
    <ItemIdentityRow key={fact.label} label={fact.label} actions={fact.actions ?? null} testId={fact.testId} wrap={fact.wrap}>
      {fact.value}
    </ItemIdentityRow>
  );
  return (
    <article
      data-testid={testId}
      data-current={current ? '' : undefined}
      aria-label={title}
      className={cn('border-b border-mode-fact', current ? 'bg-mode-panel' : 'bg-mode-bar')}
    >
      <div className="flex gap-3 px-4 py-3">
        <RecordItemPhoto src={photo.src} title={title} onOpen={photo.onOpen} upload={photo.upload ?? null} testId={testId} />
        {/* Its own container: the ruler goes two-column on the ITEM's width, not the page's (phones stack it). */}
        <div className="@container flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="line-clamp-3 min-w-0 flex-1 text-role-body font-bold" title={title}>
              {title}
            </p>
            {titleAccessory}
            {count != null ? (
              <span className={cn(RECORD_ID_CLASS, 'shrink-0')} data-testid={`${testId}-count`}>
                {count}
              </span>
            ) : null}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-x-4 @sm:grid-cols-2" data-testid={`${testId}-ids`}>
            <div className="flex min-w-0 flex-col">
              <ItemIdentityRow label="SKU" actions={skuActions !== undefined ? skuActions : sku ? <SkuOpenInMenu sku={sku} /> : null}>
                <RecordItemValue value={sku} historyKind="SKU" />
              </ItemIdentityRow>
              {left.map(row)}
            </div>
            <div className="flex min-w-0 flex-col">
              <ItemIdentityRow label={item.label ?? 'Item #'} actions={item.actions ?? null} testId={item.testId}>
                {item.value}
              </ItemIdentityRow>
              {right.map(row)}
            </div>
          </div>
          {children}
        </div>
      </div>
    </article>
  );
}
