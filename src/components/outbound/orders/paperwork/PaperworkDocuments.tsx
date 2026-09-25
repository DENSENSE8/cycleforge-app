'use client';

/**
 * The order's paperwork, inline — shipping labels, packing slips and every
 * paired paperwork row (manual, packing list, PL + M…), viewed and managed in
 * place. No slide-over, no motion. Triage face (sentence case, soft panels,
 * h-9 controls) and container-responsive: on a phone sheet the file list sits
 * above the document; on a desk pane wider than ~48rem they sit side by side.
 *
 *   kinds     — Label · Slip · Manuals & docs · All, with counts; Download all
 *               is one ZIP of every document and paired row.
 *   list      — every file of the kind, grouped by where it is paired (this
 *               order · item # X · SKU Y, most specific first), with download ·
 *               replace · delete, and for paired rows rename · re-pair (order /
 *               item # / SKU / type) · unpair. Drop files on the list, or
 *               Upload; Label / Slip can also be fetched from the platform;
 *               paired rows can come from the library.
 *   preview   — the selected file with print · download · open; All stacks
 *               every file so the whole packet reads top to bottom.
 *
 * Pairing is the resolution pack print uses (lib/manuals/paperwork-pairing):
 * pinned to this order only, to the item number (every recurring order of it)
 * or to the SKU. The item-number view ({@link ItemPaperworkDialog}) is this
 * same component narrowed to what is paired to the order's item number.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  Download,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
  Unlink,
  Upload,
} from '@/components/Icons';
import { TYPE_OPTIONS } from '@/components/manuals/manual-crud/manual-crud-shared';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/design-system/components/Dialog';
import { FetchedPdfFrame } from '@/design-system/components/FetchedPdfFrame';
import { requestConfirm } from '@/design-system/components/confirm';
import { resolveDocumentPreviewMime } from '@/design-system/components/document-preview-mime';
import { Button, IconButton } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import {
  TRIAGE_PANEL_INNER_CORNER,
  TRIAGE_PANEL_SEGMENT_ENDS,
  triagePanelControl,
} from '@/design-system/tokens/triage-panel';
import {
  outboundDocumentContentSrc,
  outboundDocumentMimeHint,
} from '@/lib/documents/outbound-document-display';
import type { OutboundDocument } from '@/lib/documents/types';
import type { PaperworkSource } from '@/lib/manuals/paperwork-pairing';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';
import {
  downloadAllHref,
  downloadHref,
  printDocument,
  useOrderDocuments,
  useOrderManuals,
  useOrderPaperworkActions,
  type OrderManual,
  type PaperworkKind,
} from '@/lib/orders/order-paperwork-client';
import {
  CAPTION,
  FIELD_CLASS,
  GroupHeader,
  PairingControls,
  RepairForm,
  type PaperworkPatch,
} from './PaperworkPairingControls';

export type PaperworkTab = PaperworkKind | 'all';

const KIND_LABEL: Record<PaperworkKind, string> = {
  shipping_label: 'Shipping label',
  packing_slip: 'Packing slip',
  manual: 'Paired paperwork',
};

const TAB_FACE: Record<PaperworkTab, string> = {
  shipping_label: 'Label',
  packing_slip: 'Slip',
  manual: 'Manuals & docs',
  all: 'All',
};

const UPLOAD_FACE: Record<PaperworkKind, string> = {
  shipping_label: 'Upload label',
  packing_slip: 'Upload slip',
  manual: 'Upload paperwork',
};

const ACCEPT: Record<PaperworkKind, string> = {
  shipping_label: 'application/pdf,image/png,image/jpeg',
  packing_slip: 'application/pdf,image/png,image/jpeg',
  manual: 'application/pdf,image/png,image/jpeg,.doc,.docx',
};

/** One file the list and the preview agree on, whatever table it lives in. */
interface PaperworkFile {
  key: string;
  kind: PaperworkKind;
  /** Kind face: Shipping label / Packing slip, or the paperwork type. */
  kindLabel: string;
  name: string;
  meta: string;
  /** Paired rows: every key it is pinned to. */
  pins: string | null;
  src: string | null;
  mime: 'pdf' | 'image';
  externalUrl: string | null;
  printable: boolean;
  doc?: OutboundDocument;
  manual?: OrderManual;
}

function docName(doc: OutboundDocument): string {
  if (doc.data.filename) return doc.data.filename;
  try {
    return decodeURIComponent(doc.data.url.split('/').pop() || '') || `Document ${doc.id}`;
  } catch {
    return `Document ${doc.id}`;
  }
}

function docMeta(doc: OutboundDocument): string {
  const source =
    doc.data.source === 'marketplace_api'
      ? `From ${doc.data.platform ?? 'platform'}`
      : doc.data.source === 'generated'
        ? 'Generated'
        : 'Uploaded';
  const at = formatMonthDayTimePST(doc.createdAt);
  return [source, at !== '—' ? at : null].filter(Boolean).join(' · ');
}

function toFiles(
  documents: readonly OutboundDocument[],
  manuals: readonly OrderManual[],
  orderId: number,
): PaperworkFile[] {
  const docs = documents.map((doc): PaperworkFile => {
    const src = outboundDocumentContentSrc(doc);
    return {
      key: `doc:${doc.id}`,
      kind: doc.documentType,
      kindLabel: KIND_LABEL[doc.documentType],
      name: docName(doc),
      meta: docMeta(doc),
      pins: null,
      src,
      mime: outboundDocumentMimeHint(doc),
      externalUrl: src,
      printable: true,
      doc,
    };
  });
  const paired = manuals.map((manual): PaperworkFile => {
    const at = formatMonthDayTimePST(manual.updatedAt);
    const typeLabel = TYPE_OPTIONS.find((option) => option.value && option.value === manual.type)?.label ?? manual.type ?? 'Manual';
    const { pairing } = manual;
    const pins = [
      pairing.orderId === orderId ? 'This order' : pairing.orderId != null ? 'Another order' : null,
      pairing.itemNumber ? `Item # ${pairing.itemNumber}` : null,
      pairing.sku ? `SKU ${pairing.sku}` : null,
    ].filter(Boolean).join(' · ');
    return {
      key: `manual:${manual.id}`,
      kind: 'manual',
      kindLabel: typeLabel,
      name: manual.displayName,
      meta: at !== '—' ? at : 'Paired',
      pins: pins ? `Paired to ${pins}` : null,
      src: manual.contentUrl,
      mime: resolveDocumentPreviewMime(manual.fileName, undefined) === 'image' ? 'image' : 'pdf',
      externalUrl: manual.contentUrl ?? manual.externalUrl,
      printable: Boolean(manual.contentUrl),
      manual,
    };
  });
  const order: PaperworkKind[] = ['shipping_label', 'packing_slip', 'manual'];
  // Stable: paired rows keep the server's precedence order (order > item # > SKU).
  return [...docs, ...paired].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function PaperworkDocuments({
  orderId,
  orderRef,
  tab: requestedTab,
  onTabChange,
  onChanged,
  itemView = false,
}: {
  orderId: number;
  orderRef: string;
  tab: PaperworkTab;
  onTabChange: (tab: PaperworkTab) => void;
  /** Any write landed — the host re-reads the facts it owns. */
  onChanged: () => void;
  /**
   * The item-number view: only the paperwork paired to this order's item
   * number — what every order of that item number resolves. Paired rows only;
   * uploads and library pairs pin the item number.
   */
  itemView?: boolean;
}) {
  const tab: PaperworkTab = itemView ? 'manual' : requestedTab;
  // The item view never lists the order's own label / slip (0 = query off).
  const documentsQuery = useOrderDocuments(itemView ? 0 : orderId);
  const manualsQuery = useOrderManuals(orderId);
  const actions = useOrderPaperworkActions(orderId, orderRef, onChanged);

  const resolved = manualsQuery.data ?? null;
  const documents = documentsQuery.data?.documents ?? [];
  const allManuals = resolved?.manuals ?? [];
  const manuals = itemView ? allManuals.filter((m) => m.pairedBy.includes('item_number')) : allManuals;
  const files = useMemo(() => toFiles(documents, manuals, orderId), [documents, manuals, orderId]);
  const visible = tab === 'all' ? files : files.filter((f) => f.kind === tab);
  const count = (kind: PaperworkTab) => (kind === 'all' ? files.length : files.filter((f) => f.kind === kind).length);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = visible.find((f) => f.key === selectedKey) ?? visible[0] ?? null;
  useEffect(() => {
    setSelectedKey(null);
  }, [tab, orderId]);

  // New paired paperwork: which key it pins, and its type.
  const [pairTo, setPairTo] = useState<PaperworkSource | null>(null);
  const [paperType, setPaperType] = useState('manual');
  useEffect(() => {
    setPairTo(null);
  }, [orderId]);
  const scope: PaperworkSource = itemView ? 'item_number' : (pairTo ?? resolved?.defaultPairTo ?? 'item_number');
  const [itemViewOpen, setItemViewOpen] = useState(false);

  const uploadRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<PaperworkFile | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const uploadKind: PaperworkKind | null = tab === 'all' ? null : tab;
  const busy =
    actions.upload.isPending ||
    actions.replaceDocument.isPending ||
    actions.replaceManual.isPending;

  const uploadFiles = (list: FileList | null) => {
    if (!uploadKind || !list) return;
    for (const file of Array.from(list)) {
      actions.upload.mutate(
        uploadKind === 'manual' ? { kind: uploadKind, file, pairTo: scope, type: paperType } : { kind: uploadKind, file },
      );
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    uploadFiles(event.dataTransfer.files);
  };

  const startReplace = (file: PaperworkFile) => {
    setReplaceTarget(file);
    replaceRef.current?.click();
  };

  const onReplaceFile = (list: FileList | null) => {
    const next = list?.[0];
    const target = replaceTarget;
    setReplaceTarget(null);
    if (!next || !target) return;
    if (target.doc) actions.replaceDocument.mutate({ doc: target.doc, file: next });
    else if (target.manual) actions.replaceManual.mutate({ manualId: target.manual.id, file: next });
  };

  const onDelete = async (file: PaperworkFile) => {
    if (file.doc) {
      const ok = await requestConfirm({
        title: `Delete this ${KIND_LABEL[file.kind].toLowerCase()}?`,
        description: `${file.name} is unlinked from order ${orderRef} and pack print stops using it.`,
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (ok) actions.removeDocument.mutate(file.doc);
      return;
    }
    if (file.manual) {
      const ok = await requestConfirm({
        title: `Delete this ${file.kindLabel.toLowerCase()} from the library?`,
        description: `${file.name} stops printing for every order, item number and SKU it is paired to. To take it off one key only, use Re-pair; to keep it in the library unpaired, use Unpair.`,
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (ok) actions.removeManual.mutate({ manualId: file.manual.id, mode: 'delete' });
    }
  };

  const onUnpair = async (file: PaperworkFile) => {
    if (!file.manual) return;
    const ok = await requestConfirm({
      title: 'Unpair it everywhere?',
      description: `${file.name} comes off every order, item number and SKU and goes back to the library unassigned. To drop one key only, use Re-pair.`,
      confirmLabel: 'Unpair',
    });
    if (ok) actions.removeManual.mutate({ manualId: file.manual.id, mode: 'unpair' });
  };

  const zipHref = downloadAllHref({
    documentIds: documents.map((d) => d.id),
    manualIds: manuals.filter((m) => m.contentUrl || m.externalUrl).map((m) => m.id),
    title: itemView ? `item-${resolved?.itemNumber ?? orderRef}-paperwork` : `order-${orderRef}-paperwork`,
  });

  // Print all — label · slip · paired paperwork in pack order, one dialog. The
  // door for when the packer print station is down; the server ledgers each
  // page as `fallback_browser` so pack history stays true.
  const [printingAll, setPrintingAll] = useState(false);
  const onPrintAll = async () => {
    setPrintingAll(true);
    try {
      const { printPaperworkPackets, describePaperworkPrint } = await import('@/lib/print/printPaperworkPackets');
      const verdict = describePaperworkPrint(await printPaperworkPackets([orderId]));
      if (verdict.ok) toast.success(verdict.message);
      else toast.error(verdict.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not print the paperwork');
    } finally {
      setPrintingAll(false);
    }
  };

  const loading = documentsQuery.isLoading || manualsQuery.isLoading;
  const slipIngest = documentsQuery.data?.packingSlipIngest ?? null;
  const openItemView = !itemView && resolved?.itemNumber ? () => setItemViewOpen(true) : undefined;

  // Grouped by where each row is paired — most specific first (server order).
  const grouped = !itemView && (tab === 'manual' || tab === 'all');
  const groups = new Map<PaperworkSource, PaperworkFile[]>();
  for (const file of visible) {
    const source = file.manual?.source ?? 'order';
    groups.set(source, [...(groups.get(source) ?? []), file]);
  }

  const renderRow = (file: PaperworkFile) => (
    <FileRow
      key={file.key}
      file={file}
      showKind={tab === 'all'}
      active={selected?.key === file.key}
      orderId={orderId}
      orderRef={orderRef}
      onSelect={() => {
        setSelectedKey(file.key);
        // All stacks every file: jump the stack to this one (no smooth scroll).
        if (tab === 'all') {
          previewRef.current
            ?.querySelector(`[data-file-key="${file.key}"]`)
            ?.scrollIntoView({ block: 'start' });
        }
      }}
      onReplace={() => startReplace(file)}
      onDelete={() => void onDelete(file)}
      onUnpair={file.manual ? () => void onUnpair(file) : undefined}
      onUpdate={file.manual ? (patch) => actions.updateManual.mutate({ manualId: file.manual!.id, ...patch }) : undefined}
    />
  );

  return (
    <section
      data-testid={itemView ? 'item-paperwork' : 'paperwork-docs'}
      aria-label={itemView ? 'Item number paperwork' : 'Order paperwork'}
      className="@container flex min-w-0 flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        {itemView ? (
          <p className={CAPTION}>
            <span className="font-semibold text-text-default">{files.length}</span> paired to item #{' '}
            <span className="font-mono font-semibold text-text-default">{resolved?.itemNumber ?? '—'}</span> — every order of
            this item number shows and packs them.
          </p>
        ) : (
          <div role="tablist" aria-label="Paperwork kind" className={cn('inline-flex border border-border-soft', TRIAGE_PANEL_SEGMENT_ENDS)}>
            {(['shipping_label', 'packing_slip', 'manual', 'all'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={tab === kind}
                data-testid={`paperwork-tab-${kind}`}
                onClick={() => onTabChange(kind)}
                className={cn(
                  'ds-raw-button inline-flex h-9 items-center gap-1.5 border-l border-border-soft px-3 text-role-caption font-semibold first:border-l-0',
                  tab === kind ? 'bg-surface-inverse text-text-inverse' : 'bg-surface-card text-text-default hover:bg-surface-sunken',
                  focusRing('control'),
                )}
              >
                {TAB_FACE[kind]}
                <span className={cn('tabular-nums', tab === kind ? 'opacity-80' : 'text-text-muted')}>{count(kind)}</span>
              </button>
            ))}
          </div>
        )}
        <span className="min-w-0 flex-1" />
        {itemView ? null : (
          <Button
            variant="secondary"
            size="md"
            className={triagePanelControl()}
            icon={<Printer />}
            disabled={files.length === 0 || printingAll}
            data-testid="paperwork-print-all"
            onClick={() => void onPrintAll()}
          >
            {printingAll ? 'Preparing…' : 'Print all'}
          </Button>
        )}
        {zipHref ? (
          <a
            href={zipHref}
            download
            data-testid="paperwork-download-all"
            className={cn(
              'inline-flex items-center gap-1.5 border border-border-soft bg-surface-card px-3 text-role-caption font-semibold text-text-default hover:bg-surface-sunken',
              triagePanelControl(),
              focusRing('control'),
            )}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download all
          </a>
        ) : (
          <Button variant="secondary" size="md" disabled className={triagePanelControl()} icon={<Download />}>
            Download all
          </Button>
        )}
      </div>

      {tab === 'manual' ? (
        <PairingControls
          resolved={resolved}
          scope={scope}
          onScope={itemView ? undefined : setPairTo}
          type={paperType}
          onType={setPaperType}
          pairedIds={manuals.map((m) => m.id)}
          pending={actions.pairManual.isPending}
          onPair={itemView ? undefined : (manualId) => actions.pairManual.mutate({ manualId, pairTo: scope })}
          onOpenItemView={openItemView}
        />
      ) : null}

      {uploadKind ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            className={triagePanelControl()}
            icon={<Upload />}
            loading={busy}
            data-testid="paperwork-upload"
            onClick={() => uploadRef.current?.click()}
          >
            {UPLOAD_FACE[uploadKind]}
          </Button>
          {uploadKind !== 'manual' ? (
            <Button
              variant="ghost"
              size="md"
              className={triagePanelControl()}
              icon={<RefreshCw />}
              loading={actions.fetchFromPlatform.isPending}
              data-testid="paperwork-fetch"
              title="Ask the sales platform for this document"
              onClick={() => actions.fetchFromPlatform.mutate([uploadKind])}
            >
              Fetch from platform
            </Button>
          ) : null}
          {tab === 'packing_slip' && slipIngest && slipIngest.status !== 'available' ? (
            <p
              data-testid="paperwork-slip-ingest"
              className={cn('text-role-caption', slipIngest.status === 'failed' ? 'text-text-danger' : 'text-text-muted')}
            >
              {slipIngest.status === 'processing' ? 'The import worker is fetching this slip…' : slipIngest.label}
              {slipIngest.lastError ? ` — ${slipIngest.lastError}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 @3xl:flex-row">
        {/* The list: what is on file, and every verb on it. Drop files here. */}
        <div
          data-testid="paperwork-docs-list"
          className={cn(
            'flex shrink-0 flex-col gap-2 @3xl:w-72',
            dragOver && 'outline outline-2 outline-offset-2 outline-border-strong',
            TRIAGE_PANEL_INNER_CORNER,
          )}
          onDragOver={(event) => {
            if (!uploadKind) return;
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {loading ? (
            <p className={CAPTION}>Loading paperwork…</p>
          ) : visible.length === 0 ? (
            <EmptyList tab={tab} onUpload={uploadKind ? () => uploadRef.current?.click() : undefined} />
          ) : grouped ? (
            <ul className="flex flex-col gap-3">
              {[...groups.entries()].map(([source, list]) => (
                <li key={source} className="flex flex-col gap-2" data-testid={`paperwork-group-${source}`}>
                  <GroupHeader
                    source={source}
                    orderRef={orderRef}
                    itemNumber={resolved?.itemNumber ?? null}
                    sku={resolved?.sku ?? null}
                    onOpenItemView={openItemView}
                  />
                  <ul className="flex flex-col gap-2">{list.map(renderRow)}</ul>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-2">{visible.map(renderRow)}</ul>
          )}
        </div>

        {/* The document itself — one file, or the whole packet stacked. */}
        <div ref={previewRef} data-testid="paperwork-preview" className="flex min-w-0 flex-1 flex-col gap-3">
          {tab === 'all' ? (
            visible.length === 0 ? (
              <PreviewEmpty title="Nothing on file for this order yet" hint="Upload or fetch a label, slip or manual." />
            ) : (
              visible.map((file) => (
                <PreviewCard key={file.key} file={file} />
              ))
            )
          ) : selected ? (
            <PreviewCard file={selected} />
          ) : (
            <PreviewEmpty
              title={
                loading
                  ? 'Loading…'
                  : itemView
                    ? `Nothing paired to item # ${resolved?.itemNumber ?? '—'} yet`
                    : `No ${KIND_LABEL[tab].toLowerCase()} on this order`
              }
              hint={
                tab === 'manual'
                  ? 'Upload one, or pair one already in the library.'
                  : 'Drop a PDF or image on the list, upload one, or fetch it from the platform.'
              }
            />
          )}
        </div>
      </div>

      <input
        ref={uploadRef}
        type="file"
        multiple
        accept={uploadKind ? ACCEPT[uploadKind] : undefined}
        className="hidden"
        data-testid="paperwork-upload-input"
        onChange={(event) => {
          uploadFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={replaceRef}
        type="file"
        accept={replaceTarget ? ACCEPT[replaceTarget.kind] : undefined}
        className="hidden"
        data-testid="paperwork-replace-input"
        onChange={(event) => {
          onReplaceFile(event.target.files);
          event.target.value = '';
        }}
      />
      {openItemView && resolved?.itemNumber ? (
        <ItemPaperworkDialog
          open={itemViewOpen}
          onOpenChange={setItemViewOpen}
          orderId={orderId}
          orderRef={orderRef}
          itemNumber={resolved.itemNumber}
          onChanged={onChanged}
        />
      ) : null}
    </section>
  );
}

function FileRow({
  file,
  showKind,
  active,
  orderId,
  orderRef,
  onSelect,
  onReplace,
  onDelete,
  onUnpair,
  onUpdate,
}: {
  file: PaperworkFile;
  showKind: boolean;
  active: boolean;
  orderId: number;
  orderRef: string;
  onSelect: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onUnpair?: () => void;
  /** Paired rows: rename / retype / re-pair. */
  onUpdate?: (patch: PaperworkPatch) => void;
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'repair'>('view');
  const [draft, setDraft] = useState(file.name);

  return (
    <li
      data-testid="paperwork-file"
      data-kind={file.kind}
      data-source={file.manual?.source ?? undefined}
      className={cn(
        'flex flex-col border bg-surface-card',
        TRIAGE_PANEL_INNER_CORNER,
        active ? 'border-text-default ring-1 ring-text-default' : 'border-border-soft',
      )}
    >
      {mode === 'rename' && onUpdate ? (
        <form
          className="flex items-center gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim();
            if (next && next !== file.name) onUpdate({ displayName: next });
            setMode('view');
          }}
        >
          <input
            autoFocus
            aria-label="Name"
            data-testid="paperwork-rename-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setMode('view');
              }
            }}
            className={FIELD_CLASS}
          />
          <Button type="submit" size="md" className={triagePanelControl()}>
            Save
          </Button>
        </form>
      ) : mode === 'repair' && onUpdate && file.manual ? (
        <RepairForm
          manual={file.manual}
          orderId={orderId}
          orderRef={orderRef}
          onCancel={() => setMode('view')}
          onSave={(patch) => {
            onUpdate(patch);
            setMode('view');
          }}
        />
      ) : (
        <button
          type="button"
          aria-pressed={active}
          onClick={onSelect}
          className={cn(
            'ds-raw-button flex min-w-0 items-start gap-2 px-3 pb-1 pt-2.5 text-left',
            TRIAGE_PANEL_INNER_CORNER,
            focusRing('control'),
          )}
        >
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />
          <span className="flex min-w-0 flex-col">
            {showKind || file.manual ? (
              <span className="text-role-caption font-semibold text-text-muted">{file.kindLabel}</span>
            ) : null}
            <span className="break-words text-role-data font-semibold text-text-default">{file.name}</span>
            <span className={CAPTION}>{file.meta}</span>
            {file.pins ? (
              <span className={CAPTION} data-testid="paperwork-file-pins">
                {file.pins}
              </span>
            ) : null}
          </span>
        </button>
      )}
      <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1.5">
        {file.src ? (
          <a
            href={downloadHref(file.src)}
            download
            aria-label={`Download ${file.name}`}
            title="Download"
            data-testid="paperwork-file-download"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center text-text-soft hover:bg-surface-sunken hover:text-text-default',
              TRIAGE_PANEL_INNER_CORNER,
              focusRing('control'),
            )}
          >
            <Download className="h-4 w-4" aria-hidden />
          </a>
        ) : null}
        {onUpdate ? (
          <IconButton
            size="md"
            className={TRIAGE_PANEL_INNER_CORNER}
            ariaLabel={`Rename ${file.name}`}
            title="Rename"
            data-testid="paperwork-file-rename"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => {
              setDraft(file.name);
              setMode('rename');
            }}
          />
        ) : null}
        {onUpdate ? (
          <IconButton
            size="md"
            className={TRIAGE_PANEL_INNER_CORNER}
            ariaLabel={`Re-pair ${file.name}`}
            title="Re-pair: order, item number, SKU, type"
            data-testid="paperwork-file-repair"
            icon={<Link2 className="h-4 w-4" />}
            onClick={() => setMode('repair')}
          />
        ) : null}
        <IconButton
          size="md"
          className={TRIAGE_PANEL_INNER_CORNER}
          ariaLabel={`Replace ${file.name}`}
          title="Replace file"
          data-testid="paperwork-file-replace"
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={onReplace}
        />
        {onUnpair ? (
          <IconButton
            size="md"
            className={TRIAGE_PANEL_INNER_CORNER}
            ariaLabel={`Unpair ${file.name}`}
            title="Unpair everywhere (keeps it in the library)"
            data-testid="paperwork-file-unpair"
            icon={<Unlink className="h-4 w-4" />}
            onClick={onUnpair}
          />
        ) : null}
        <IconButton
          size="md"
          ariaLabel={`Delete ${file.name}`}
          title="Delete"
          data-testid="paperwork-file-delete"
          className={cn('hover:text-text-danger', TRIAGE_PANEL_INNER_CORNER)}
          icon={<Trash2 className="h-4 w-4" />}
          onClick={onDelete}
        />
      </div>
    </li>
  );
}

function EmptyList({ tab, onUpload }: { tab: PaperworkTab; onUpload?: () => void }) {
  const label = tab === 'all' ? 'paperwork' : KIND_LABEL[tab].toLowerCase();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-role-caption font-semibold text-text-warning">No {label} on file</p>
      {onUpload ? (
        <button
          type="button"
          onClick={onUpload}
          className={cn(
            'ds-raw-button flex flex-col items-center justify-center gap-1 border border-dashed border-border-default px-3 py-6 text-center text-role-caption text-text-muted hover:bg-surface-sunken hover:text-text-default',
            TRIAGE_PANEL_INNER_CORNER,
            focusRing('control'),
          )}
        >
          <Upload className="h-4 w-4" aria-hidden />
          Drop a file here, or tap to choose
        </button>
      ) : null}
    </div>
  );
}

/** One document: its name + print / download / open, then the file itself. */
function PreviewCard({ file }: { file: PaperworkFile }) {
  return (
    <div
      data-file-key={file.key}
      className={cn('flex min-w-0 flex-col overflow-hidden border border-border-soft bg-surface-card', TRIAGE_PANEL_INNER_CORNER)}
    >
      <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border-hairline pl-3 pr-1.5">
        <span className="flex min-w-0 flex-1 flex-col py-1.5">
          <span className="text-role-caption text-text-muted">{file.kindLabel}</span>
          <span className="truncate text-role-data font-semibold text-text-default" title={file.name}>
            {file.name}
          </span>
        </span>
        {file.printable && file.src ? (
          <Button
            variant="secondary"
            size="sm"
            className={TRIAGE_PANEL_INNER_CORNER}
            icon={<Printer />}
            data-testid="paperwork-preview-print"
            onClick={() => printDocument(file.src!)}
          >
            Print
          </Button>
        ) : null}
        {file.src ? (
          <a
            href={downloadHref(file.src)}
            download
            aria-label={`Download ${file.name}`}
            title="Download"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center text-text-soft hover:bg-surface-sunken hover:text-text-default',
              TRIAGE_PANEL_INNER_CORNER,
              focusRing('control'),
            )}
          >
            <Download className="h-4 w-4" aria-hidden />
          </a>
        ) : null}
        {file.externalUrl ? (
          <a
            href={file.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${file.name} in a new tab`}
            title="Open in a new tab"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center text-text-soft hover:bg-surface-sunken hover:text-text-default',
              TRIAGE_PANEL_INNER_CORNER,
              focusRing('control'),
            )}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        ) : null}
      </div>
      <PreviewBody file={file} />
    </div>
  );
}

function PreviewBody({ file }: { file: PaperworkFile }) {
  if (!file.src) {
    return (
      <PreviewEmpty
        title="No stored file to preview"
        hint={file.externalUrl ? 'This manual lives in Google Drive — open it in a new tab.' : 'Replace it with a PDF or image.'}
        bare
      />
    );
  }
  return (
    <div className="flex h-[70dvh] min-h-0 bg-surface-sunken @3xl:h-[44rem]" data-testid="paperwork-preview-frame">
      {file.mime === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary document bytes, not a Next-optimizable asset
        <img src={file.src} alt={file.name} className="m-auto max-h-full max-w-full object-contain" />
      ) : (
        <FetchedPdfFrame key={file.src} src={file.src} title={file.name} />
      )}
    </div>
  );
}

function PreviewEmpty({ title, hint, bare = false }: { title: string; hint: ReactNode; bare?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        !bare && cn('border border-dashed border-border-soft', TRIAGE_PANEL_INNER_CORNER),
      )}
    >
      <FileText className="h-7 w-7 text-text-faint" aria-hidden />
      <p className="text-role-data font-semibold text-text-default">{title}</p>
      <p className={CAPTION}>{hint}</p>
    </div>
  );
}

/**
 * The item-number view: everything paired to this order's item number — what
 * every order of it resolves and packs — with the same CRUD. Anchored on the
 * order it was opened from (the routes are order-scoped; an item-number row
 * resolves for every order of that item number).
 */
export function ItemPaperworkDialog({
  open,
  onOpenChange,
  orderId,
  orderRef,
  itemNumber,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  orderRef: string;
  itemNumber: string;
  onChanged?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-5xl flex-col overflow-y-auto" data-testid="item-paperwork-dialog">
        <DialogHeader>
          <DialogTitle>
            Item # <span className="font-mono">{itemNumber}</span> paperwork
          </DialogTitle>
          <DialogDescription>Opened from order {orderRef}. Changes apply to every order of this item number.</DialogDescription>
        </DialogHeader>
        {open ? (
          <PaperworkDocuments
            orderId={orderId}
            orderRef={orderRef}
            tab="manual"
            onTabChange={() => undefined}
            onChanged={onChanged ?? (() => undefined)}
            itemView
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
