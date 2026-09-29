'use client';

/**
 * Paperwork — an open order failing release gate G2 Documents and/or G3
 * Shipping label. G2 clears by pairing a library document, uploading one, or
 * the explicit "docs not required" exemption; G3 clears by linking the order's
 * ShipStation label. The record returns to the list only when the write that
 * clears the LAST missing gate lands; a partial fix toasts and stays.
 */

import { useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileText, Link2, Upload } from '@/components/Icons';
import { DetailFact, DetailFacts, DetailNavRow, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { ConfirmSheet } from '@/components/ui/BottomSheet';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { Button, SearchField } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { usePaperworkExceptionActions, useResolvePaperworkException } from '@/hooks/exceptions';
import type { PaperworkExceptionFacts } from '@/lib/exceptions/facts';
import type { PaperworkSource } from '@/lib/manuals/paperwork-pairing';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { useOrderManuals } from '@/lib/orders/order-paperwork-client';
import { toast } from '@/lib/toast';
import type { PhoneResolverProps } from './resolver-props';
import { ShipStationLabelSheet, type ShipStationLabelLink } from './ShipStationLabelSheet';

type PaperworkGate = PaperworkExceptionFacts['missing'][number];
type PaperworkVerb = 'upload' | 'not-required' | 'link-label';

const GATE_NAME: Record<PaperworkGate, string> = { documents: 'Documents', label: 'Shipping label' };

type LibraryManual = {
  id: number;
  display_name: string | null;
  product_title: string | null;
  item_number: string | null;
  file_name: string | null;
};

async function searchLibrary(query: string): Promise<LibraryManual[]> {
  const params = new URLSearchParams({ q: query, limit: '30' });
  const res = await fetch(`/api/product-manuals/search?${params}`, { credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as {
    manuals?: Array<LibraryManual & { id: number | string }>;
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'Could not search paperwork');
  return (body.manuals ?? []).map((manual) => ({ ...manual, id: Number(manual.id) }));
}

export function PaperworkResolver({ facts, onResolved }: PhoneResolverProps<PaperworkExceptionFacts>) {
  const { has } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const order = facts.order;
  const orderRef = order.orderNumber || `#${order.id}`;
  const here = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;
  const resolve = useResolvePaperworkException();
  const { upload } = usePaperworkExceptionActions(order.id, orderRef);
  const fileInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [confirmExempt, setConfirmExempt] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  const docsMissing = facts.missing.includes('documents');
  const labelMissing = facts.missing.includes('label');
  const canManageDocs = has('product_manuals.manage');
  const canExempt = has('orders.create');
  const canLink = has('shipping.buy_label');
  // The same key the server defaults a pairing to: item number, else SKU, else the order.
  const pairTo: PaperworkSource = order.itemNumber?.trim() ? 'item_number' : order.sku?.trim() ? 'sku' : 'order';
  const pairToLabel =
    pairTo === 'item_number' ? `item # ${order.itemNumber}` : pairTo === 'sku' ? `SKU ${order.sku}` : `order ${orderRef}`;

  const trimmedQuery = query.trim();
  const manuals = useOrderManuals(docsMissing ? order.id : 0);
  const library = useQuery({
    queryKey: ['paperwork-manual-library', trimmedQuery],
    queryFn: () => searchLibrary(trimmedQuery),
    enabled: docsMissing && canManageDocs && trimmedQuery.length > 0,
    staleTime: 60_000,
  });
  const pairedIds = new Set(manuals.data?.manuals.map((manual) => manual.id) ?? []);
  const libraryHits = (library.data ?? []).filter((manual) => !pairedIds.has(manual.id));

  /**
   * One gate just cleared: the last one returns to the list; otherwise say
   * what still blocks release and stay. `announced` — the write already
   * toasted its own success (the paperwork upload does).
   */
  const gateCleared = (gate: PaperworkGate, message: string, announced = false) => {
    const remaining = facts.missing.filter((missing) => missing !== gate);
    if (remaining.length === 0) {
      onResolved(message);
      return;
    }
    const still = `${remaining.map((missing) => GATE_NAME[missing]).join(' · ')} still missing.`;
    toast.success(announced ? still : `${message} ${still}`);
  };

  const pairManual = (manual: LibraryManual) =>
    resolve
      .mutateAsync({ action: 'pair-manual', orderId: order.id, manualId: manual.id, pairTo })
      .then(() => gateCleared('documents', `Paired ${manual.display_name || manual.file_name || `manual #${manual.id}`} to ${orderRef}.`))
      .catch((error: Error) => toast.error(error.message || 'Could not pair it.'));

  const uploadFile = (file: File) =>
    upload.mutate(
      { kind: 'manual', file, pairTo },
      // The upload hook toasts success and failure itself.
      { onSuccess: () => gateCleared('documents', `Uploaded ${file.name} to ${orderRef}.`, true) },
    );

  const exemptDocs = () =>
    resolve
      .mutateAsync({ action: 'docs-not-required', orderId: order.id, value: true })
      .then(() => {
        setConfirmExempt(false);
        gateCleared('documents', `${orderRef} ships without documents.`);
      })
      .catch((error: Error) => toast.error(error.message || 'Could not mark documents not required.'));

  const linkLabel = (link: ShipStationLabelLink) =>
    resolve
      .mutateAsync({ action: 'link-label', orderId: order.id, ...link })
      .then(() => {
        setLabelOpen(false);
        gateCleared('label', `Label linked to ${orderRef}.`);
      })
      .catch((error: Error) => toast.error(error.message || 'Could not link the label.'));

  const pendingAction = resolve.isPending ? resolve.variables?.action : null;
  const verbs: DetailDockVerb<PaperworkVerb>[] = [];
  if (docsMissing) {
    verbs.push(
      {
        id: 'upload',
        label: 'Upload document',
        icon: <Upload />,
        primary: true,
        disabled: !canManageDocs || resolve.isPending,
        loading: upload.isPending,
      },
      {
        id: 'not-required',
        label: 'Docs not required',
        icon: <FileText />,
        disabled: !canExempt || upload.isPending,
        loading: pendingAction === 'docs-not-required',
      },
    );
  }
  if (labelMissing) {
    verbs.push({
      id: 'link-label',
      label: 'Link label',
      icon: <Link2 />,
      primary: !docsMissing,
      disabled: !canLink || upload.isPending,
      loading: pendingAction === 'link-label',
    });
  }

  const onVerb = (verb: PaperworkVerb) => {
    if (verb === 'upload') fileInput.current?.click();
    else if (verb === 'not-required') setConfirmExempt(true);
    else setLabelOpen(true);
  };

  const blocked = [
    docsMissing && !canManageDocs ? 'pairing or uploading documents needs manual-library access' : null,
    docsMissing && !canExempt ? 'waiving documents needs order-edit access' : null,
    labelMissing && !canLink ? 'linking a label needs label-buying access' : null,
  ].filter(Boolean);

  return (
    <>
      <DetailFacts label="Release gates">
        <DetailFact
          label="G2 Documents"
          value={docsMissing ? 'Missing' : facts.hasDocuments ? 'Present' : 'Not required'}
          hint={facts.hasDocuments ? 'A document is linked to the order or its SKU' : 'No document linked to the order or its SKU'}
        />
        <DetailFact
          label="G3 Shipping label"
          value={labelMissing ? 'Missing' : 'Linked'}
          hint={facts.hasShippingLabelDocument ? 'Label document on the order' : 'No label document on the order'}
        />
      </DetailFacts>
      <DetailFacts label="Order">
        <DetailFact label="Order" value={orderRef} mono copy={order.orderNumber} />
        <DetailFact label="Item #" value={order.itemNumber} mono copy={order.itemNumber} />
        <DetailFact label="SKU" value={order.sku} mono copy={order.sku} />
        <DetailFact label="Tracking" value={order.trackingNumber} mono copy={order.trackingNumber} />
      </DetailFacts>

      {docsMissing && canManageDocs ? (
        <section aria-labelledby="paperwork-pair-heading" className="divide-y divide-mode-rule">
          <DetailSectionHeading id="paperwork-pair-heading">Pair from the library · to {pairToLabel}</DetailSectionHeading>
          <div className="bg-mode-panel px-mode-page py-2.5">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search manuals by name or item #"
              tone="neutral"
              isSearching={library.isFetching}
            />
          </div>
          {library.isError ? (
            <p role="alert" className="bg-mode-panel px-mode-page py-2.5 text-role-caption text-text-danger">
              Could not search the manual library.
            </p>
          ) : trimmedQuery && library.isSuccess && libraryHits.length === 0 ? (
            <p className="bg-mode-panel px-mode-page py-2.5 text-role-caption text-mode-muted">No matching paperwork.</p>
          ) : null}
          {libraryHits.map((manual) => (
            <div key={manual.id} className="flex items-center justify-between gap-3 bg-mode-panel px-mode-page py-2">
              <div className="min-w-0">
                <p className="truncate text-mode-body font-semibold text-mode-ink">
                  {manual.display_name || manual.product_title || manual.file_name || `Manual #${manual.id}`}
                </p>
                <p className="truncate font-mono text-role-caption text-mode-muted">
                  {manual.item_number ? `Item # ${manual.item_number}` : 'Unpaired item'}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={resolve.isPending || upload.isPending}
                loading={
                  resolve.isPending && resolve.variables?.action === 'pair-manual' && resolve.variables.manualId === manual.id
                }
                onClick={() => void pairManual(manual)}
              >
                Pair
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      {blocked.length > 0 ? (
        <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-text-muted">
          Your role cannot finish this here: {blocked.join('; ')}.
        </p>
      ) : null}
      <nav aria-label="Order record">
        <DetailNavRow
          href={withJobReturn(`/m/orders/${order.id}?by=id`, here)}
          title="Order"
          meta={`${orderRef} · customer, label, units, activity`}
          icon={<ClipboardList />}
        />
      </nav>
      <div className="flex-1 bg-mode-panel" />
      {verbs.length > 0 ? <DetailDock label="Paperwork exception actions" verbs={verbs} onVerb={onVerb} /> : null}

      {/* The OS file chooser behind the dock's Upload verb — never painted, not a text field. */}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) uploadFile(file);
        }}
      />
      <ConfirmSheet
        open={confirmExempt}
        onClose={() => setConfirmExempt(false)}
        title="Docs not required?"
        message={`${orderRef} will pass G2 Documents without any paperwork in the box.`}
        confirmLabel="Docs not required"
        onConfirm={() => void exemptDocs()}
      />
      {labelOpen ? (
        <ShipStationLabelSheet
          open
          onClose={() => setLabelOpen(false)}
          orderId={order.id}
          orderRef={orderRef}
          initialQuery={order.trackingNumber ?? ''}
          pending={pendingAction === 'link-label'}
          onLink={(link) => void linkLabel(link)}
        />
      ) : null}
    </>
  );
}
