/**
 * Print-on-Pack-Confirm bundle resolver + dispatcher (JIT pack documents Phase 1–3).
 *
 * Phase 1: shipping_label + packing_slip via documents hub.
 * Phase 2–3: manuals via documents SoT (SKU links) with product_manuals fallback.
 *
 * Dispatches via NAS media agent (`vendor=agent`) or PrintNode pdf_base64 when
 * an `outbound` printer profile exists; otherwise returns browser-fallback ids
 * for the Station iframe path.
 * Never re-buys postage. Idempotent via client_event_id.
 */

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
import {
  dispatchAgentPdf,
  isPrintAgentConfigured,
} from '@/lib/print/dispatchAgentPdf';

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
  dispatchAgentPdf: typeof dispatchAgentPdf;
  recordDocumentPrintJob: typeof recordDocumentPrintJob;
  getDocumentPrintJobByEventId: typeof getDocumentPrintJobByEventId;
  resolveOutboundPrinter: (orgId: OrgId) => Promise<PrinterProfileRow | null>;
  isPrintNodeConfigured: () => boolean;
  isPrintAgentConfigured: () => boolean;
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
  dispatchAgentPdf,
  recordDocumentPrintJob,
  getDocumentPrintJobByEventId,
  resolveOutboundPrinter: defaultResolveOutboundPrinter,
  isPrintNodeConfigured: () => Boolean(process.env.PRINTNODE_API_KEY),
  isPrintAgentConfigured,
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

type DispatchAttempt = {
  status: DocumentPrintJobStatus;
  error?: string;
  printnodeJobId: number | null;
  fallback: boolean;
};

async function attemptPdfDispatch(input: {
  profile: PrinterProfileRow | null;
  printNodeConfigured: boolean;
  agentConfigured: boolean;
  documentType: DocumentPrintJobType;
  title: string;
  pdfBase64: string;
  source: string;
  deps: PrintBundleDeps;
}): Promise<DispatchAttempt> {
  const { profile, deps } = input;
  if (profile?.vendor === 'agent' && input.agentConfigured) {
    const ag = await deps.dispatchAgentPdf({
      title: input.title,
      pdfBase64: input.pdfBase64,
      documentType: input.documentType,
      source: input.source,
    });
    if (ag.ok && ag.dispatched) {
      return { status: 'dispatched', printnodeJobId: null, fallback: false };
    }
    return {
      status: 'fallback_browser',
      error: ag.error,
      printnodeJobId: null,
      fallback: true,
    };
  }

  if (profile?.vendor === 'printnode' && input.printNodeConfigured) {
    const pn = await deps.dispatchPrintNodePdf({
      printerExternalId: profile.external_id,
      title: input.title,
      pdfBase64: input.pdfBase64,
      source: input.source,
    });
    if (pn.ok && pn.dispatched) {
      return {
        status: 'dispatched',
        printnodeJobId: pn.jobId ?? null,
        fallback: false,
      };
    }
    return {
      status: 'fallback_browser',
      error: pn.error,
      printnodeJobId: null,
      fallback: true,
    };
  }

  // Prefer an explicit reason so ops can see "agent profile but Next has no
  // NAS_AGENT_URL" instead of a silent browser dialog with error=null.
  const reason =
    profile?.vendor === 'agent' && !input.agentConfigured
      ? 'NAS_AGENT_URL / NAS_AGENT_TOKEN not loaded in this Next process'
      : profile?.vendor === 'printnode' && !input.printNodeConfigured
        ? 'PRINTNODE_API_KEY not configured'
        : profile
          ? `no dispatch path for vendor=${profile.vendor}`
          : 'no active outbound printer_profiles row';

  return {
    status: 'fallback_browser',
    error: reason,
    printnodeJobId: null,
    fallback: true,
  };
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
  const agentConfigured = deps.isPrintAgentConfigured();

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
        const st = existing.status as DocumentPrintJobStatus;
        // Sticky browser-fallback after a prior miss (e.g. Next missing
        // NAS_AGENT_*) must not block a later silent dispatch once the agent
        // is configured — re-attempt instead of replaying the dialog.
        const canRetrySilent =
          st === 'fallback_browser' &&
          ((profile?.vendor === 'agent' && agentConfigured) ||
            (profile?.vendor === 'printnode' && printNodeConfigured));
        if (!canRetrySilent) {
          anyIdempotent = true;
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
        } else {
          const attempt = await attemptPdfDispatch({
            profile,
            printNodeConfigured,
            agentConfigured,
            documentType: doc.documentType,
            title: `${doc.documentType} · order ${input.orderId}`,
            pdfBase64: loaded.bytes.toString('base64'),
            source: 'cycleforge.pack-bundle',
            deps,
          });
          status = attempt.status;
          error = attempt.error;
          printnodeJobId = attempt.printnodeJobId;
          if (attempt.fallback) {
            anyFallback = true;
            pushOutboundFallback(browserFallbackDocs, doc, true);
          } else {
            anyDispatched = true;
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
        const st = existing.status as DocumentPrintJobStatus;
        const canRetrySilent =
          st === 'fallback_browser' &&
          ((profile?.vendor === 'agent' && agentConfigured) ||
            (profile?.vendor === 'printnode' && printNodeConfigured));
        if (!canRetrySilent) {
          anyIdempotent = true;
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
        } else {
          const attempt = await attemptPdfDispatch({
            profile,
            printNodeConfigured,
            agentConfigured,
            documentType: 'manual',
            title: `manual · ${manual.displayName}`,
            pdfBase64: loaded.bytes.toString('base64'),
            source: 'cycleforge.pack-bundle.manual',
            deps,
          });
          status = attempt.status;
          error = attempt.error;
          printnodeJobId = attempt.printnodeJobId;
          if (attempt.fallback) {
            anyFallback = true;
            pushManualFallback(browserFallbackDocs, manual, true);
          } else {
            anyDispatched = true;
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
