'use client';

/**
 * The order's paperwork, inline — shipping labels, packing slips and the
 * manuals paired to the item, viewed and managed in place. No slide-over, no
 * motion. Triage face (sentence case, soft panels, h-9 controls) and
 * container-responsive: on a phone sheet the file list sits above the
 * document; on a desk pane wider than ~48rem they sit side by side.
 *
 *   kinds     — Label · Slip · Manuals · All, with counts; Download all is one
 *               ZIP of every document and paired manual.
 *   list      — every file of the kind with download · replace · delete (and,
 *               for manuals, rename · unpair). Drop files on the list, or
 *               Upload; Label / Slip can also be fetched from the platform;
 *               Manuals can pair an existing library manual.
 *   preview   — the selected file with print · download · open; All stacks
 *               every file so the whole packet reads top to bottom.
 *
 * Manuals pair to the order's item number AND SKU (and the catalog row they
 * resolve to) — exactly what pack print resolves, so a manual paired here is
 * the one the packer's insert prints.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download,
  ExternalLink,
  FileText,
  Pencil,
  Printer,
  RefreshCw,
  Trash2,
  Unlink,
  Upload,
} from '@/components/Icons';
import { FetchedPdfFrame } from '@/design-system/components/FetchedPdfFrame';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
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
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import {
  downloadAllHref,
  downloadHref,
  printDocument,
  useOrderDocuments,
  useOrderManuals,
  useOrderPaperworkActions,
  type OrderManual,
  type PaperworkKind,
} from './order-paperwork-client';

export type PaperworkTab = PaperworkKind | 'all';

const KIND_LABEL: Record<PaperworkKind, string> = {
  shipping_label: 'Shipping label',
  packing_slip: 'Packing slip',
  manual: 'Manual',
};

const TAB_FACE: Record<PaperworkTab, string> = {
  shipping_label: 'Label',
  packing_slip: 'Slip',
  manual: 'Manuals',
  all: 'All',
};

const UPLOAD_FACE: Record<PaperworkKind, string> = {
  shipping_label: 'Upload label',
  packing_slip: 'Upload slip',
  manual: 'Upload manual',
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
  name: string;
  meta: string;
  src: string | null;
  mime: 'pdf' | 'image';
  externalUrl: string | null;
  printable: boolean;
  doc?: OutboundDocument;
  manual?: OrderManual;
}

const CAPTION = 'text-role-caption text-text-muted';

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

function toFiles(documents: readonly OutboundDocument[], manuals: readonly OrderManual[]): PaperworkFile[] {
  const docs = documents.map((doc): PaperworkFile => {
    const src = outboundDocumentContentSrc(doc);
    return {
      key: `doc:${doc.id}`,
      kind: doc.documentType,
      name: docName(doc),
      meta: docMeta(doc),
      src,
      mime: outboundDocumentMimeHint(doc),
      externalUrl: src,
      printable: true,
      doc,
    };
  });
  const paired = manuals.map((manual): PaperworkFile => {
    const at = formatMonthDayTimePST(manual.updatedAt);
    return {
      key: `manual:${manual.id}`,
      kind: 'manual',
      name: manual.displayName,
      meta: [manual.type, at !== '—' ? at : null].filter(Boolean).join(' · ') || 'Manual',
      src: manual.contentUrl,
      mime: resolveDocumentPreviewMime(manual.fileName, undefined) === 'image' ? 'image' : 'pdf',
      externalUrl: manual.contentUrl ?? manual.externalUrl,
      // Pack prints inserts from the packet; the manual itself is view-only here.
      printable: false,
      manual,
    };
  });
  const order: PaperworkKind[] = ['shipping_label', 'packing_slip', 'manual'];
  return [...docs, ...paired].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function PaperworkDocuments({
  orderId,
  orderRef,
  tab,
  onTabChange,
  onChanged,
}: {
  orderId: number;
  orderRef: string;
  tab: PaperworkTab;
  onTabChange: (tab: PaperworkTab) => void;
  /** Any write landed — the host re-reads the facts it owns. */
  onChanged: () => void;
}) {
  const documentsQuery = useOrderDocuments(orderId);
  const manualsQuery = useOrderManuals(orderId);
  const actions = useOrderPaperworkActions(orderId, orderRef, onChanged);

  const documents = documentsQuery.data?.documents ?? [];
  const manuals = manualsQuery.data?.manuals ?? [];
  const files = useMemo(() => toFiles(documents, manuals), [documents, manuals]);
  const visible = tab === 'all' ? files : files.filter((f) => f.kind === tab);
  const count = (kind: PaperworkTab) => (kind === 'all' ? files.length : files.filter((f) => f.kind === kind).length);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = visible.find((f) => f.key === selectedKey) ?? visible[0] ?? null;
  useEffect(() => {
    setSelectedKey(null);
  }, [tab, orderId]);

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
    for (const file of Array.from(list)) actions.upload.mutate({ kind: uploadKind, file });
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
        title: 'Delete this manual from the library?',
        description: `${file.name} is removed for every item it is paired to. To take it off this item only, use Unpair.`,
        confirmLabel: 'Delete manual',
        tone: 'danger',
      });
      if (ok) actions.removeManual.mutate({ manualId: file.manual.id, mode: 'delete' });
    }
  };

  const onUnpair = (file: PaperworkFile) => {
    if (file.manual) actions.removeManual.mutate({ manualId: file.manual.id, mode: 'unpair' });
  };

  const zipHref = downloadAllHref({
    documentIds: documents.map((d) => d.id),
    manualIds: manuals.filter((m) => m.contentUrl || m.externalUrl).map((m) => m.id),
    title: `order-${orderRef}-paperwork`,
  });

  const loading = documentsQuery.isLoading || manualsQuery.isLoading;
  const slipIngest = documentsQuery.data?.packingSlipIngest ?? null;
  const pairing = manualsQuery.data ?? null;

  return (
    <section data-testid="paperwork-docs" aria-label="Order paperwork" className="@container flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
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
        <span className="min-w-0 flex-1" />
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

      {tab === 'manual' ? (
        <ManualPairing
          itemNumber={pairing?.itemNumber ?? null}
          sku={pairing?.sku ?? null}
          pairedIds={manuals.map((m) => m.id)}
          pending={actions.pairManual.isPending}
          onPair={(manualId) => actions.pairManual.mutate(manualId)}
        />
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
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((file) => (
                <FileRow
                  key={file.key}
                  file={file}
                  showKind={tab === 'all'}
                  active={selected?.key === file.key}
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
                  onUnpair={file.manual ? () => onUnpair(file) : undefined}
                  onRename={
                    file.manual
                      ? (displayName) => actions.renameManual.mutate({ manualId: file.manual!.id, displayName })
                      : undefined
                  }
                />
              ))}
            </ul>
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
              title={loading ? 'Loading…' : `No ${KIND_LABEL[tab].toLowerCase()} on this order`}
              hint={
                tab === 'manual'
                  ? 'Upload one, or pair a manual already in the library.'
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
    </section>
  );
}

function FileRow({
  file,
  showKind,
  active,
  onSelect,
  onReplace,
  onDelete,
  onUnpair,
  onRename,
}: {
  file: PaperworkFile;
  showKind: boolean;
  active: boolean;
  onSelect: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onUnpair?: () => void;
  onRename?: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(file.name);

  return (
    <li
      data-testid="paperwork-file"
      data-kind={file.kind}
      className={cn(
        'flex flex-col border bg-surface-card',
        TRIAGE_PANEL_INNER_CORNER,
        active ? 'border-text-default ring-1 ring-text-default' : 'border-border-soft',
      )}
    >
      {renaming && onRename ? (
        <form
          className="flex items-center gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim();
            if (next && next !== file.name) onRename(next);
            setRenaming(false);
          }}
        >
          <input
            autoFocus
            aria-label="Manual name"
            data-testid="paperwork-rename-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            className={cn(
              'min-w-0 flex-1 border border-border-default bg-surface-card px-3 text-role-data text-text-default',
              triagePanelControl(),
              focusRing('control'),
            )}
          />
          <Button type="submit" size="md" className={triagePanelControl()}>
            Save
          </Button>
        </form>
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
            {showKind ? <span className="text-role-caption font-semibold text-text-muted">{KIND_LABEL[file.kind]}</span> : null}
            <span className="break-words text-role-data font-semibold text-text-default">{file.name}</span>
            <span className={CAPTION}>{file.meta}</span>
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
        {onRename ? (
          <IconButton
            size="md"
            className={TRIAGE_PANEL_INNER_CORNER}
            ariaLabel={`Rename ${file.name}`}
            title="Rename"
            data-testid="paperwork-file-rename"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => {
              setDraft(file.name);
              setRenaming(true);
            }}
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
            ariaLabel={`Unpair ${file.name} from this item`}
            title="Unpair from this item (keeps it in the library)"
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

/** Manuals pair at item + SKU grain: say which keys, and pair from the library. */
function ManualPairing({
  itemNumber,
  sku,
  pairedIds,
  pending,
  onPair,
}: {
  itemNumber: string | null;
  sku: string | null;
  pairedIds: readonly number[];
  pending: boolean;
  onPair: (manualId: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const library = useQuery({
    queryKey: ['paperwork-manual-library', debounced],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debounced, limit: '30' });
      const res = await fetch(`/api/product-manuals/search?${params}`, { credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as {
        manuals?: Array<{ id: number; display_name: string | null; product_title: string | null; item_number: string | null; type: string | null }>;
      };
      return body.manuals ?? [];
    },
    staleTime: 60_000,
  });

  const options = (library.data ?? [])
    .filter((m) => !pairedIds.includes(m.id))
    .map((m) => ({
      value: m.id,
      label: m.display_name || m.product_title || `Manual #${m.id}`,
      meta: [m.item_number ? `Item ${m.item_number}` : null, m.type].filter(Boolean).join(' · ') || undefined,
    }));

  const keyed = Boolean(itemNumber || sku);

  return (
    <div className="flex flex-col gap-2" data-testid="paperwork-manual-pairing">
      <p className={CAPTION}>
        Manuals pair to item <span className="font-mono font-semibold text-text-default">{itemNumber || '—'}</span>
        {' '}and SKU <span className="font-mono font-semibold text-text-default">{sku || '—'}</span>, so pack prints them for every order of this item.
      </p>
      <div className={cn('border border-border-default bg-surface-card', triagePanelControl())}>
        <SearchableSelectField
          value={null}
          onChange={(next) => {
            if (next == null) return;
            onPair(Number(next));
          }}
          options={options}
          onSearchChange={setQuery}
          loading={library.isFetching}
          disabled={!keyed || pending}
          appearance="flush"
          placeholder={keyed ? (pending ? 'Pairing…' : 'Pair a manual from the library…') : 'This order has no item # or SKU'}
          searchPlaceholder="Manual name or item #…"
          emptyMessage="No matching manual"
          ariaLabel="Pair a manual from the library"
          testId="paperwork-manual-pair"
          className="h-full w-full"
        />
      </div>
    </div>
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
          <span className="text-role-caption text-text-muted">{KIND_LABEL[file.kind]}</span>
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
