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
  type DocumentPrintJobRow,
  type DocumentPrintJobStatus,
  type DocumentPrintJobType,
} from '@/lib/documents/document-print-jobs';
import { dispatchPrintNodePdf } from '@/lib/print/dispatchPrintNodePdf';

const BUNDLE_TYPES: OutboundDocumentType[] = ['shipping_label', 'packing_slip'];

export type PrintBundleStatus =
  | 'dispatched'
  | 'fallback_browser'
  | 'missing'
  | 'partial'
  | 'failed'
  | 'idempotent_replay';

export interface PrintableBundleItem {
  kind: 'outbound' | 'manual';
  /** documents.id when kind=outbound, or manual documents row when promoted */
  documentId?: number;
  /** product_manuals.id when kind=manual (bridge / dual-write) */
  productManualId?: number;
  documentType: DocumentPrintJobType;
  isPdf: boolean;
}

export interface ResolvePrintBundleResult {
  documents: OutboundDocument[];
  manuals: PackBundleManual[];
  byType: Partial<Record<OutboundDocumentType, OutboundDocument>>;
  missingTypes: OutboundDocumentType[];
}

export interface DispatchPrintBundleInput {
  orderId: number;
  packerLogId?: number | null;
  shipmentId?: number | null;
  actorStaffId?: number | null;
  reprint?: boolean;
  clientEventIdPrefix?: string;
}

export interface DispatchPrintBundleJobResult {
  documentId?: number;
  productManualId?: number;
  documentType: DocumentPrintJobType;
  status: DocumentPrintJobStatus;
  jobRow: DocumentPrintJobRow | null;
  error?: string;
  isPdf: boolean;
}

export interface DispatchPrintBundleResult {
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
  readOutboundDocumentBytes: typeof readOutboundDocumentBytes;
  readProductManualBytes: typeof readProductManualBytes;
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

const defaultDeps: PrintBundleDeps = {
  listDocumentsForOrder,
  listDocumentsForShipment,
  listAssignedManualsForOrder,
  readOutboundDocumentBytes,
  readProductManualBytes,
  dispatchPrintNodePdf,
  recordDocumentPrintJob,
  getDocumentPrintJobByEventId,
  resolveOutboundPrinter: defaultResolveOutboundPrinter,
  isPrintNodeConfigured: () => Boolean(process.env.PRINTNODE_API_KEY),
};

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

  const byType: Partial<Record<OutboundDocumentType, OutboundDocument>> = {};
  for (const doc of docs) {
    if (!BUNDLE_TYPES.includes(doc.documentType)) continue;
    if (!byType[doc.documentType]) byType[doc.documentType] = doc;
  }

  const manuals = await deps.listAssignedManualsForOrder(orgId, input.orderId);
  const missingTypes = BUNDLE_TYPES.filter((t) => !byType[t]);

  return {
    documents: BUNDLE_TYPES.map((t) => byType[t]).filter(Boolean) as OutboundDocument[],
    manuals,
    byType,
    missingTypes,
  };
}

function eventIdForDoc(prefix: string, documentId: number, reprint: boolean): string {
  if (reprint) return `${prefix}:reprint:${documentId}:${Date.now()}`;
  return `${prefix}:${documentId}`;
}

function eventIdForManual(
  prefix: string,
  manual: PackBundleManual,
  reprint: boolean,
): string {
  const key =
    manual.documentId != null && manual.documentId > 0
      ? `doc:${manual.documentId}`
      : String(manual.id);
  if (reprint) return `${prefix}:manual:reprint:${key}:${Date.now()}`;
  return `${prefix}:manual:${key}`;
}

function pushOutboundFallback(
  list: PrintableBundleItem[],
  doc: OutboundDocument,
  isPdf: boolean,
): void {
  if (list.some((d) => d.kind === 'outbound' && d.documentId === doc.id)) return;
  list.push({
    kind: 'outbound',
    documentId: doc.id,
    documentType: doc.documentType,
    isPdf,
  });
}

function pushManualFallback(
  list: PrintableBundleItem[],
  manual: PackBundleManual,
  isPdf: boolean,
): void {
  const docId = manual.documentId != null && manual.documentId > 0 ? manual.documentId : undefined;
  if (
    list.some(
      (d) =>
        d.kind === 'manual' &&
        ((docId != null && d.documentId === docId) ||
          (docId == null && d.productManualId === manual.id)),
    )
  ) {
    return;
  }
  list.push({
    kind: 'manual',
    documentId: docId,
    productManualId: manual.id,
    documentType: 'manual',
    isPdf,
  });
}

export async function dispatchPrintBundle(
  orgId: OrgId,
  input: DispatchPrintBundleInput,
  deps: PrintBundleDeps = defaultDeps,
): Promise<DispatchPrintBundleResult> {
  const resolved = await resolvePrintBundle(
    orgId,
    { orderId: input.orderId, shipmentId: input.shipmentId },
    deps,
  );

  if (resolved.documents.length === 0 && resolved.manuals.length === 0) {
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
  let anyIdempotent = false;
  let anyDispatched = false;
  let anyFailed = false;
  let anyFallback = false;

  for (const doc of resolved.documents) {
    const clientEventId = eventIdForDoc(prefix, doc.id, reprint);

    if (!reprint) {
      const existing = await deps.getDocumentPrintJobByEventId(orgId, clientEventId);
      if (existing) {
        anyIdempotent = true;
        const st = existing.status as DocumentPrintJobStatus;
        if (st === 'fallback_browser') {
          anyFallback = true;
          pushOutboundFallback(browserFallbackDocs, doc, true);
        }
        if (st === 'dispatched') anyDispatched = true;
        if (st === 'failed') anyFailed = true;
        jobs.push({
          documentId: doc.id,
          documentType: doc.documentType,
          status: st,
          jobRow: existing,
          isPdf: true,
        });
        continue;
      }
    }

    let isPdf = true;
    let status: DocumentPrintJobStatus = 'failed';
    let error: string | undefined;
    let printnodeJobId: number | null = null;

    try {
      const loaded = await deps.readOutboundDocumentBytes(orgId, doc.id);
      if (!loaded) {
        status = 'failed';
        anyFailed = true;
        error = `Document ${doc.id} bytes unavailable`;
      } else {
        const ct = (loaded.contentType || '').toLowerCase();
        isPdf = ct.includes('pdf') || loaded.filename.toLowerCase().endsWith('.pdf');

        if (!isPdf) {
          status = 'fallback_browser';
          anyFallback = true;
          pushOutboundFallback(browserFallbackDocs, doc, false);
        } else if (!profile || profile.vendor !== 'printnode' || !printNodeConfigured) {
          status = 'fallback_browser';
          anyFallback = true;
          pushOutboundFallback(browserFallbackDocs, doc, true);
        } else {
          const pn = await deps.dispatchPrintNodePdf({
            printerExternalId: profile.external_id,
            title: `${doc.documentType} · order ${input.orderId}`,
            pdfBase64: loaded.bytes.toString('base64'),
            source: 'cycleforge.pack-bundle',
          });
          if (pn.ok && pn.dispatched) {
            status = 'dispatched';
            printnodeJobId = pn.jobId ?? null;
            anyDispatched = true;
          } else {
            status = 'fallback_browser';
            error = pn.error;
            anyFallback = true;
            pushOutboundFallback(browserFallbackDocs, doc, true);
          }
        }
      }
    } catch (err) {
      status = 'failed';
      anyFailed = true;
      error = err instanceof Error ? err.message : 'load/dispatch failed';
    }

    const jobRow = await deps.recordDocumentPrintJob(
      {
        orderId: input.orderId,
        packerLogId: input.packerLogId,
        documentId: doc.id,
        documentType: doc.documentType,
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

    jobs.push({
      documentId: doc.id,
      documentType: doc.documentType,
      status,
      jobRow,
      error,
      isPdf,
    });
  }

  for (const manual of resolved.manuals) {
    const clientEventId = eventIdForManual(prefix, manual, reprint);
    const manualDocumentId =
      manual.documentId != null && manual.documentId > 0 ? manual.documentId : undefined;

    if (!reprint) {
      const existing = await deps.getDocumentPrintJobByEventId(orgId, clientEventId);
      if (existing) {
        anyIdempotent = true;
        const st = existing.status as DocumentPrintJobStatus;
        if (st === 'fallback_browser') {
          anyFallback = true;
          pushManualFallback(browserFallbackDocs, manual, true);
        }
        if (st === 'dispatched') anyDispatched = true;
        if (st === 'failed' || st === 'skipped') anyFailed = st === 'failed';
        jobs.push({
          documentId: manualDocumentId,
          productManualId: manual.id,
          documentType: 'manual',
          status: st,
          jobRow: existing,
          isPdf: true,
        });
        continue;
      }
    }

    let isPdf = true;
    let status: DocumentPrintJobStatus = 'failed';
    let error: string | undefined;
    let printnodeJobId: number | null = null;

    try {
      const loaded = await deps.readProductManualBytes(manual);
      if (!loaded) {
        // Google Docs / missing URL — skip rather than fail the whole pack bundle.
        status = 'skipped';
        error = manual.sourceUrl
          ? `Manual ${manual.id} bytes unavailable`
          : `Manual ${manual.id} has no source_url`;
      } else {
        const ct = (loaded.contentType || '').toLowerCase();
        isPdf =
          ct.includes('pdf') ||
          loaded.filename.toLowerCase().endsWith('.pdf') ||
          (manual.sourceUrl || '').toLowerCase().includes('.pdf');

        if (!isPdf) {
          status = 'fallback_browser';
          anyFallback = true;
          pushManualFallback(browserFallbackDocs, manual, false);
        } else if (!profile || profile.vendor !== 'printnode' || !printNodeConfigured) {
          status = 'fallback_browser';
          anyFallback = true;
          pushManualFallback(browserFallbackDocs, manual, true);
        } else {
          const pn = await deps.dispatchPrintNodePdf({
            printerExternalId: profile.external_id,
            title: `manual · ${manual.displayName}`,
            pdfBase64: loaded.bytes.toString('base64'),
            source: 'cycleforge.pack-bundle.manual',
          });
          if (pn.ok && pn.dispatched) {
            status = 'dispatched';
            printnodeJobId = pn.jobId ?? null;
            anyDispatched = true;
          } else {
            status = 'fallback_browser';
            error = pn.error;
            anyFallback = true;
            pushManualFallback(browserFallbackDocs, manual, true);
          }
        }
      }
    } catch (err) {
      status = 'failed';
      anyFailed = true;
      error = err instanceof Error ? err.message : 'manual load/dispatch failed';
    }

    if (status === 'failed') anyFailed = true;

    const jobRow = await deps.recordDocumentPrintJob(
      {
        orderId: input.orderId,
        packerLogId: input.packerLogId,
        documentId: manualDocumentId ?? null,
        productManualId: manual.id,
        documentType: 'manual',
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

    jobs.push({
      documentId: manualDocumentId,
      productManualId: manual.id,
      documentType: 'manual',
      status,
      jobRow,
      error,
      isPdf,
    });
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
    status = resolved.documents.length === 0 ? 'missing' : 'partial';
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
