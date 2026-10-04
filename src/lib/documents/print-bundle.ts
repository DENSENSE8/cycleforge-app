/** Print-on-Pack-Confirm bundle resolver + dispatcher (JIT pack documents Phase 1–3). */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  listDocumentsForOrder,
  listDocumentsForShipment,
} from '@/lib/documents/outbound-documents';
import type { OutboundDocument, OutboundDocumentType } from '@/lib/documents/types';
import { readOutboundDocumentBytes } from '@/lib/documents/read-bytes';
import {
  listAssignedManualsForOrder,
  readProductManualBytes,
  type PackBundleManual,
} from '@/lib/documents/pack-bundle-manuals';
import {
  recordDocumentPrintJob,
  getDocumentPrintJobByEventId,
  type DocumentPrintJobInput,
  type DocumentPrintJobRow,
  type DocumentPrintJobStatus,
  type DocumentPrintJobType,
} from '@/lib/documents/document-print-jobs';
import { dispatchPrintNodePdf } from '@/lib/print/dispatchPrintNodePdf';
import { readLabelIngestionPdf } from '@/lib/label-ingestions/ingestion-service';
import { normalizeTrackingNumber } from '@/lib/tracking-format';

const BUNDLE_TYPES: OutboundDocumentType[] = ['shipping_label', 'packing_slip'];

type PrintBundleStatus =
  | 'dispatched'
  | 'fallback_browser'
  | 'missing'
  | 'partial'
  | 'failed'
  | 'idempotent_replay';

/**
 * A bulk-uploaded label already paired to the order (label_ingestions
 * MATCHED / LINKED with a staged PDF) that has no `documents` row until it is
 * applied. It prints as a shipping label.
 */
export interface PairedLabelIngestion {
  id: number;
  fileBasename: string;
  trackingNumberNormalized: string | null;
}

interface PrintableBundleItem {
  kind: 'outbound' | 'manual' | 'label_ingestion';
  /** documents.id when kind=outbound, or manual documents row when promoted */
  documentId?: number;
  /** product_manuals.id when kind=manual (bridge / dual-write) */
  productManualId?: number;
  /** label_ingestions.id when kind=label_ingestion */
  labelIngestionId?: number;
  /** Same-origin content URL when the item has no documents row (label_ingestion). */
  src?: string;
  documentType: DocumentPrintJobType;
  isPdf: boolean;
}

interface ResolvePrintBundleResult {
  /** Every shipping label (newest first), then the newest packing slip. */
  documents: OutboundDocument[];
  manuals: PackBundleManual[];
  /** Paired labels with no documents row yet — printed with the labels. */
  labelIngestions: PairedLabelIngestion[];
  byType: Partial<Record<OutboundDocumentType, OutboundDocument>>;
  missingTypes: OutboundDocumentType[];
}

interface DispatchPrintBundleInput {
  orderId: number;
  packerLogId?: number | null;
  shipmentId?: number | null;
  actorStaffId?: number | null;
  reprint?: boolean;
  clientEventIdPrefix?: string;
  /** Print only these papers; absent = the whole bundle (labels + slip + manuals). */
  documentTypes?: readonly DocumentPrintJobType[];
}

interface DispatchPrintBundleJobResult {
  documentId?: number;
  productManualId?: number;
  labelIngestionId?: number;
  documentType: DocumentPrintJobType;
  status: DocumentPrintJobStatus;
  jobRow: DocumentPrintJobRow | null;
  error?: string;
  isPdf: boolean;
}

interface DispatchPrintBundleResult {
  status: PrintBundleStatus;
  missingTypes: OutboundDocumentType[];
  manualsResolved: number;
  jobs: DispatchPrintBundleJobResult[];
  browserFallbackDocs: PrintableBundleItem[];
  idempotent: boolean;
}

interface PrinterProfileRow {
  id: number;
  name: string;
  external_id: string;
  vendor: string;
}

export interface PrintBundleDeps {
  listDocumentsForOrder: typeof listDocumentsForOrder;
  listDocumentsForShipment: typeof listDocumentsForShipment;
  listAssignedManualsForOrder: typeof listAssignedManualsForOrder;
  listPairedLabelIngestionsForOrder: typeof listPairedLabelIngestionsForOrder;
  readOutboundDocumentBytes: typeof readOutboundDocumentBytes;
  readProductManualBytes: typeof readProductManualBytes;
  readLabelIngestionPdf: (orgId: OrgId, ingestionId: number) => Promise<{ bytes: Buffer; fileBasename: string }>;
  dispatchPrintNodePdf: typeof dispatchPrintNodePdf;
  recordDocumentPrintJob: typeof recordDocumentPrintJob;
  getDocumentPrintJobByEventId: typeof getDocumentPrintJobByEventId;
  resolveOutboundPrinter: (orgId: OrgId) => Promise<PrinterProfileRow | null>;
  isPrintNodeConfigured: () => boolean;
}

async function defaultResolveOutboundPrinter(orgId: OrgId): Promise<PrinterProfileRow | null> {
  const r = await tenantQuery<PrinterProfileRow>(
    orgId,
    `SELECT id, name, external_id, vendor
       FROM printer_profiles
      WHERE is_active = true
        AND organization_id = $1
        AND default_for = 'outbound'
      ORDER BY id ASC
      LIMIT 1`,
    [orgId],
  );
  return r.rows[0] ?? null;
}

/**
 * Paired labels of the order's logical order (every `orders` row sharing
 * account_source + order_id) that are not applied yet: MATCHED / LINKED, a
 * staged PDF, no documents row. Applied labels are documents rows already.
 */
export async function listPairedLabelIngestionsForOrder(
  orgId: OrgId,
  orderId: number,
): Promise<PairedLabelIngestion[]> {
  const r = await tenantQuery<{
    id: string | number;
    file_basename: string;
    tracking_number_normalized: string | null;
  }>(
    orgId,
    `SELECT li.id, li.file_basename, li.tracking_number_normalized
       FROM orders base
       JOIN orders sibling
         ON sibling.organization_id = base.organization_id
        AND (
              sibling.id = base.id
              OR (
                base.order_id IS NOT NULL
                AND sibling.order_id = base.order_id
                AND sibling.account_source IS NOT DISTINCT FROM base.account_source
              )
            )
       JOIN label_ingestions li
         ON li.organization_id = base.organization_id
        AND li.matched_order_id = sibling.id
      WHERE base.organization_id = $1
        AND base.id = $2
        AND li.state IN ('MATCHED', 'LINKED')
        AND li.staged_object_key IS NOT NULL
        AND li.document_id IS NULL
      ORDER BY li.observed_at DESC, li.id DESC`,
    [orgId, orderId],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    fileBasename: row.file_basename,
    trackingNumberNormalized: row.tracking_number_normalized,
  }));
}

/** Where the browser fallback reads a paired label's PDF (order-scoped, `orders.view`). */
export function labelIngestionContentPath(orderId: number, ingestionId: number): string {
  return `/api/orders/${orderId}/documents/label-ingestions/${ingestionId}`;
}

const defaultDeps: PrintBundleDeps = {
  listDocumentsForOrder,
  listDocumentsForShipment,
  listAssignedManualsForOrder,
  listPairedLabelIngestionsForOrder,
  readOutboundDocumentBytes,
  readProductManualBytes,
  readLabelIngestionPdf: (orgId, ingestionId) => readLabelIngestionPdf(orgId, ingestionId),
  dispatchPrintNodePdf,
  recordDocumentPrintJob,
  getDocumentPrintJobByEventId,
  resolveOutboundPrinter: defaultResolveOutboundPrinter,
  isPrintNodeConfigured: () => Boolean(process.env.PRINTNODE_API_KEY),
};

function trackingKey(value: string | null | undefined): string | null {
  const key = value ? normalizeTrackingNumber(value) : '';
  return key || null;
}

/**
 * The pack bundle from what is on file: EVERY shipping label (a multi-box
 * order has several), the newest packing slip, the manuals, and every paired
 * label that has no documents row yet. A paired label whose tracking already
 * prints from a documents row is not printed twice. `docs` is newest first.
 */
export function assemblePrintBundle(
  docs: readonly OutboundDocument[],
  labelIngestions: readonly PairedLabelIngestion[],
  manuals: PackBundleManual[],
): ResolvePrintBundleResult {
  const byType: Partial<Record<OutboundDocumentType, OutboundDocument>> = {};
  for (const doc of docs) {
    if (!BUNDLE_TYPES.includes(doc.documentType)) continue;
    if (!byType[doc.documentType]) byType[doc.documentType] = doc;
  }
  const labels = docs.filter((d) => d.documentType === 'shipping_label');
  const printedTracking = new Set(
    labels.map((d) => trackingKey(d.data.tracking)).filter((k): k is string => k != null),
  );
  const paired = labelIngestions.filter((li) => {
    const key = trackingKey(li.trackingNumberNormalized);
    return key == null || !printedTracking.has(key);
  });
  const missingTypes = BUNDLE_TYPES.filter(
    (t) => !byType[t] && !(t === 'shipping_label' && paired.length > 0),
  );
  return {
    documents: byType.packing_slip ? [...labels, byType.packing_slip] : labels,
    manuals,
    labelIngestions: paired,
    byType,
    missingTypes,
  };
}

export async function resolvePrintBundle(
  orgId: OrgId,
  input: { orderId: number; shipmentId?: number | null },
  deps: PrintBundleDeps = defaultDeps,
): Promise<ResolvePrintBundleResult> {
  let docs = await deps.listDocumentsForOrder(orgId, input.orderId);
  if (input.shipmentId) {
    const stnDocs = await deps.listDocumentsForShipment(orgId, input.shipmentId);
    if (stnDocs.length > 0) {
      const byId = new Map(docs.map((d) => [d.id, d]));
      for (const d of stnDocs) byId.set(d.id, d);
      docs = Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
  }

  const [manuals, labelIngestions] = await Promise.all([
    deps.listAssignedManualsForOrder(orgId, input.orderId),
    deps.listPairedLabelIngestionsForOrder(orgId, input.orderId),
  ]);
  return assemblePrintBundle(docs, labelIngestions, manuals);
}

/** The bundle narrowed to the papers the sender asked for; `missingTypes` names only asked-for types. */
function pickBundleTypes(
  bundle: ResolvePrintBundleResult,
  types: readonly DocumentPrintJobType[],
): ResolvePrintBundleResult {
  const wanted = new Set<DocumentPrintJobType>(types);
  return {
    documents: bundle.documents.filter((d) => wanted.has(d.documentType)),
    manuals: wanted.has('manual') ? bundle.manuals : [],
    labelIngestions: wanted.has('shipping_label') ? bundle.labelIngestions : [],
    byType: Object.fromEntries(
      Object.entries(bundle.byType).filter(([t]) => wanted.has(t as DocumentPrintJobType)),
    ),
    missingTypes: bundle.missingTypes.filter((t) => wanted.has(t)),
  };
}

/** One paper of the bundle, whatever it is stored as. */
interface BundlePrintItem {
  /** Ledger key namespace: '' (documents row) | 'manual' | 'ingestion'. */
  ns: '' | 'manual' | 'ingestion';
  key: string;
  title: string;
  printNodeSource: string;
  ledger: Pick<DocumentPrintJobInput, 'documentId' | 'productManualId' | 'labelIngestionId' | 'documentType'>;
  fallback: (isPdf: boolean) => PrintableBundleItem;
  /** `null` → bytes unavailable (`missing` decides failed vs skipped). */
  load: () => Promise<{ bytes: Buffer; isPdf: boolean } | null>;
  missing: { status: 'failed' | 'skipped'; error: string };
}

function eventIdFor(prefix: string, item: BundlePrintItem, reprint: boolean): string {
  const ns = item.ns ? `${item.ns}:` : '';
  if (reprint) return `${prefix}:${ns}reprint:${item.key}:${Date.now()}`;
  return `${prefix}:${ns}${item.key}`;
}

function bundlePrintItems(
  orgId: OrgId,
  orderId: number,
  resolved: ResolvePrintBundleResult,
  deps: PrintBundleDeps,
): BundlePrintItem[] {
  const items: BundlePrintItem[] = [];
  for (const doc of resolved.documents) {
    items.push({
      ns: '',
      key: String(doc.id),
      title: `${doc.documentType} · order ${orderId}`,
      printNodeSource: 'cycleforge.pack-bundle',
      ledger: { documentId: doc.id, documentType: doc.documentType },
      fallback: (isPdf) => ({ kind: 'outbound', documentId: doc.id, documentType: doc.documentType, isPdf }),
      load: async () => {
        const loaded = await deps.readOutboundDocumentBytes(orgId, doc.id);
        if (!loaded) return null;
        const ct = (loaded.contentType || '').toLowerCase();
        return {
          bytes: loaded.bytes,
          isPdf: ct.includes('pdf') || loaded.filename.toLowerCase().endsWith('.pdf'),
        };
      },
      missing: { status: 'failed', error: `Document ${doc.id} bytes unavailable` },
    });
  }
  for (const li of resolved.labelIngestions) {
    items.push({
      ns: 'ingestion',
      key: String(li.id),
      title: `shipping_label · order ${orderId}`,
      printNodeSource: 'cycleforge.pack-bundle',
      ledger: { labelIngestionId: li.id, documentType: 'shipping_label' },
      fallback: () => ({
        kind: 'label_ingestion',
        labelIngestionId: li.id,
        src: labelIngestionContentPath(orderId, li.id),
        documentType: 'shipping_label',
        isPdf: true,
      }),
      load: async () => ({ bytes: (await deps.readLabelIngestionPdf(orgId, li.id)).bytes, isPdf: true }),
      missing: { status: 'failed', error: `Label ingestion ${li.id} bytes unavailable` },
    });
  }
  for (const manual of resolved.manuals) {
    const documentId = manual.documentId != null && manual.documentId > 0 ? manual.documentId : undefined;
    items.push({
      ns: 'manual',
      key: documentId != null ? `doc:${documentId}` : String(manual.id),
      title: `manual · ${manual.displayName}`,
      printNodeSource: 'cycleforge.pack-bundle.manual',
      ledger: { documentId, productManualId: manual.id, documentType: 'manual' },
      fallback: (isPdf) => ({ kind: 'manual', documentId, productManualId: manual.id, documentType: 'manual', isPdf }),
      load: async () => {
        const loaded = await deps.readProductManualBytes(manual);
        if (!loaded) return null;
        const ct = (loaded.contentType || '').toLowerCase();
        return {
          bytes: loaded.bytes,
          isPdf:
            ct.includes('pdf') ||
            loaded.filename.toLowerCase().endsWith('.pdf') ||
            (manual.sourceUrl || '').toLowerCase().includes('.pdf'),
        };
      },
      // Google Docs / missing URL — skip rather than fail the whole pack bundle.
      missing: {
        status: 'skipped',
        error: manual.sourceUrl ? `Manual ${manual.id} bytes unavailable` : `Manual ${manual.id} has no source_url`,
      },
    });
  }
  return items;
}

export async function dispatchPrintBundle(
  orgId: OrgId,
  input: DispatchPrintBundleInput,
  deps: PrintBundleDeps = defaultDeps,
): Promise<DispatchPrintBundleResult> {
  const bundle = await resolvePrintBundle(
    orgId,
    { orderId: input.orderId, shipmentId: input.shipmentId },
    deps,
  );
  const resolved = input.documentTypes ? pickBundleTypes(bundle, input.documentTypes) : bundle;
  const items = bundlePrintItems(orgId, input.orderId, resolved, deps);

  if (items.length === 0) {
    return {
      status: 'missing',
      missingTypes: resolved.missingTypes,
      manualsResolved: 0,
      jobs: [],
      browserFallbackDocs: [],
      idempotent: false,
    };
  }

  const prefix =
    input.clientEventIdPrefix ?? `pack:${input.packerLogId ?? input.orderId}`;
  const reprint = Boolean(input.reprint);
  const profile = await deps.resolveOutboundPrinter(orgId);
  const printNodeConfigured = deps.isPrintNodeConfigured();

  const jobs: DispatchPrintBundleJobResult[] = [];
  const browserFallbackDocs: PrintableBundleItem[] = [];
  const fallbackKeys = new Set<string>();
  let anyIdempotent = false;
  let anyDispatched = false;
  let anyFailed = false;
  let anyFallback = false;

  const pushFallback = (item: BundlePrintItem, isPdf: boolean) => {
    anyFallback = true;
    const dedupe = `${item.ns}:${item.key}`;
    if (fallbackKeys.has(dedupe)) return;
    fallbackKeys.add(dedupe);
    browserFallbackDocs.push(item.fallback(isPdf));
  };
  const jobIds = (item: BundlePrintItem) => ({
    documentId: item.ledger.documentId ?? undefined,
    productManualId: item.ledger.productManualId ?? undefined,
    labelIngestionId: item.ledger.labelIngestionId ?? undefined,
    documentType: item.ledger.documentType,
  });

  for (const item of items) {
    const clientEventId = eventIdFor(prefix, item, reprint);

    if (!reprint) {
      const existing = await deps.getDocumentPrintJobByEventId(orgId, clientEventId);
      if (existing) {
        anyIdempotent = true;
        const st = existing.status as DocumentPrintJobStatus;
        if (st === 'fallback_browser') pushFallback(item, true);
        if (st === 'dispatched') anyDispatched = true;
        if (st === 'failed') anyFailed = true;
        jobs.push({ ...jobIds(item), status: st, jobRow: existing, isPdf: true });
        continue;
      }
    }

    let isPdf = true;
    let status: DocumentPrintJobStatus = 'failed';
    let error: string | undefined;
    let printnodeJobId: number | null = null;

    try {
      const loaded = await item.load();
      if (!loaded) {
        status = item.missing.status;
        error = item.missing.error;
      } else {
        isPdf = loaded.isPdf;
        if (!isPdf) {
          status = 'fallback_browser';
          pushFallback(item, false);
        } else if (!profile || profile.vendor !== 'printnode' || !printNodeConfigured) {
          status = 'fallback_browser';
          pushFallback(item, true);
        } else {
          const pn = await deps.dispatchPrintNodePdf({
            printerExternalId: profile.external_id,
            title: item.title,
            pdfBase64: loaded.bytes.toString('base64'),
            source: item.printNodeSource,
          });
          if (pn.ok && pn.dispatched) {
            status = 'dispatched';
            printnodeJobId = pn.jobId ?? null;
            anyDispatched = true;
          } else {
            status = 'fallback_browser';
            error = pn.error;
            pushFallback(item, true);
          }
        }
      }
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : 'load/dispatch failed';
    }

    if (status === 'failed') anyFailed = true;

    const jobRow = await deps.recordDocumentPrintJob(
      {
        orderId: input.orderId,
        packerLogId: input.packerLogId,
        documentId: item.ledger.documentId ?? null,
        productManualId: item.ledger.productManualId ?? null,
        labelIngestionId: item.ledger.labelIngestionId ?? null,
        documentType: item.ledger.documentType,
        status,
        printerProfileId: profile?.id ?? null,
        printnodeJobId,
        isReprint: reprint,
        actorStaffId: input.actorStaffId,
        clientEventId,
        error: error ?? null,
      },
      orgId,
    );

    jobs.push({ ...jobIds(item), status, jobRow, error, isPdf });
  }

  let status: PrintBundleStatus;
  if (anyIdempotent && !reprint) {
    status = 'idempotent_replay';
  } else if (anyFailed && (anyDispatched || anyFallback)) {
    status = 'partial';
  } else if (anyFailed && !anyDispatched && !anyFallback) {
    status = 'failed';
  } else if (anyDispatched && !anyFallback) {
    status = 'dispatched';
  } else if (anyFallback) {
    status = 'fallback_browser';
  } else if (jobs.every((j) => j.status === 'skipped')) {
    status = resolved.documents.length + resolved.labelIngestions.length === 0 ? 'missing' : 'partial';
  } else {
    status = 'partial';
  }

  return {
    status,
    missingTypes: resolved.missingTypes,
    manualsResolved: resolved.manuals.length,
    jobs,
    browserFallbackDocs,
    idempotent: anyIdempotent,
  };
}
