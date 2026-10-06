import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assemblePrintBundle,
  resolvePrintBundle,
  dispatchPrintBundle,
  type PairedLabelIngestion,
  type PrintBundleDeps,
} from './print-bundle';
import type { OrgId } from '@/lib/tenancy/constants';
import type { OutboundDocument } from './types';
import type { DocumentPrintJobInput, DocumentPrintJobRow } from './document-print-jobs';
import type { PackBundleManual } from './pack-bundle-manuals';

const ORG = '11111111-1111-1111-1111-111111111111' as OrgId;

function doc(
  id: number,
  documentType: 'shipping_label' | 'packing_slip',
  createdAt = '2026-07-30T12:00:00Z',
  tracking: string | null = null,
): OutboundDocument {
  return {
    id,
    documentType,
    data: {
      url: `https://nas.example/doc-${id}.pdf`,
      source: 'manual_upload',
      platform: null,
      mimeType: 'application/pdf',
      tracking,
    },
    links: [{ entityType: 'ORDER', entityId: 42, linkRole: 'primary' }],
    createdAt,
    updatedAt: createdAt,
  };
}

function ingestion(id: number, tracking: string | null = null): PairedLabelIngestion {
  return { id, fileBasename: `label-${id}.pdf`, trackingNumberNormalized: tracking };
}

function manual(id: number, sourceUrl: string | null = 'https://blob.example/m.pdf'): PackBundleManual {
  return {
    id,
    displayName: `Manual ${id}`,
    sourceUrl,
    fileName: `manual-${id}.pdf`,
    sku: 'ABC',
    itemNumber: 'ABC',
  };
}

function fakeJob(
  partial: Partial<DocumentPrintJobRow> & Pick<DocumentPrintJobRow, 'status'>,
): DocumentPrintJobRow {
  return {
    id: partial.id ?? 1,
    order_id: partial.order_id ?? 42,
    packer_log_id: partial.packer_log_id ?? 9,
    document_id: partial.document_id ?? null,
    product_manual_id: partial.product_manual_id ?? null,
    label_ingestion_id: partial.label_ingestion_id ?? null,
    document_type: partial.document_type ?? 'shipping_label',
    status: partial.status,
    printer_profile_id: partial.printer_profile_id ?? null,
    printnode_job_id: partial.printnode_job_id ?? null,
    is_reprint: partial.is_reprint ?? false,
    reprint_of_id: partial.reprint_of_id ?? null,
    actor_staff_id: partial.actor_staff_id ?? 1,
    client_event_id: partial.client_event_id ?? null,
    error: partial.error ?? null,
    created_at: partial.created_at ?? '2026-07-30T12:00:00Z',
  };
}

interface Captured {
  printCalls: unknown[];
  recorded: DocumentPrintJobInput[];
}

function fakes(opts: {
  orderDocs?: OutboundDocument[];
  shipmentDocs?: OutboundDocument[];
  manuals?: PackBundleManual[];
  ingestions?: PairedLabelIngestion[];
  existingByEvent?: Record<string, DocumentPrintJobRow>;
  printer?: { id: number; name: string; external_id: string; vendor: string } | null;
  printNodeOk?: boolean;
  bytesNull?: boolean;
  manualBytesNull?: boolean;
  printNodeConfigured?: boolean;
}) {
  const cap: Captured = { printCalls: [], recorded: [] };
  const existing = { ...(opts.existingByEvent ?? {}) };
  const deps: PrintBundleDeps = {
    listDocumentsForOrder: async () => opts.orderDocs ?? [],
    listDocumentsForShipment: async () => opts.shipmentDocs ?? [],
    listAssignedManualsForOrder: async () => opts.manuals ?? [],
    listPairedLabelIngestionsForOrder: async () => opts.ingestions ?? [],
    readOutboundDocumentBytes: async () =>
      opts.bytesNull
        ? null
        : {
            bytes: Buffer.from('%PDF-1.4'),
            contentType: 'application/pdf',
            filename: 'label.pdf',
          },
    readLabelIngestionPdf: async (_org, id) => ({ bytes: Buffer.from('%PDF-ingestion'), fileBasename: `label-${id}.pdf` }),
    readProductManualBytes: async () =>
      opts.manualBytesNull
        ? null
        : {
            bytes: Buffer.from('%PDF-manual'),
            contentType: 'application/pdf',
            filename: 'manual.pdf',
          },
    dispatchPrintNodePdf: async (input) => {
      cap.printCalls.push(input);
      if (opts.printNodeOk === false) {
        return { ok: false, dispatched: false, error: 'boom' };
      }
      return { ok: true, dispatched: true, jobId: 777 };
    },
    recordDocumentPrintJob: async (input) => {
      cap.recorded.push(input);
      const row = fakeJob({
        document_id: input.documentId ?? null,
        product_manual_id: input.productManualId ?? null,
        label_ingestion_id: input.labelIngestionId ?? null,
        document_type: input.documentType,
        status: input.status,
        client_event_id: input.clientEventId ?? null,
        printnode_job_id: input.printnodeJobId ?? null,
        is_reprint: input.isReprint ?? false,
      });
      if (input.clientEventId) existing[input.clientEventId] = row;
      return row;
    },
    getDocumentPrintJobByEventId: async (_org, eventId) => existing[eventId] ?? null,
    resolveOutboundPrinter: async () =>
      opts.printer === undefined
        ? { id: 3, name: 'Bench laser', external_id: '55', vendor: 'printnode' }
        : opts.printer,
    isPrintNodeConfigured: () => opts.printNodeConfigured !== false,
  };
  return { deps, cap };
}

test('resolvePrintBundle: every shipping label, newest first; reports missing slip', async () => {
  const { deps } = fakes({
    orderDocs: [
      doc(2, 'shipping_label', '2026-07-30T13:00:00Z'),
      doc(1, 'shipping_label', '2026-07-30T12:00:00Z'),
    ],
  });
  const out = await resolvePrintBundle(ORG, { orderId: 42 }, deps);
  assert.equal(out.byType.shipping_label?.id, 2);
  assert.deepEqual(out.missingTypes, ['packing_slip']);
  assert.deepEqual(out.documents.map((d) => d.id), [2, 1]);
  assert.equal(out.manuals.length, 0);
});

test('assemblePrintBundle: every label, then the newest slip only', () => {
  const out = assemblePrintBundle(
    [doc(5, 'packing_slip'), doc(4, 'shipping_label'), doc(3, 'packing_slip'), doc(2, 'shipping_label')],
    [],
    [],
  );
  assert.deepEqual(out.documents.map((d) => d.id), [4, 2, 5]);
  assert.deepEqual(out.missingTypes, []);
});

test('assemblePrintBundle: a paired label counts as the label; one already on file is not printed twice', () => {
  const onlyPaired = assemblePrintBundle([doc(5, 'packing_slip')], [ingestion(7, '9400111')], []);
  assert.deepEqual(onlyPaired.labelIngestions.map((li) => li.id), [7]);
  assert.deepEqual(onlyPaired.missingTypes, []);

  const both = assemblePrintBundle(
    [doc(4, 'shipping_label', undefined, '9400 111')],
    [ingestion(7, '9400111'), ingestion(8, '1Z999'), ingestion(9, null)],
    [],
  );
  assert.deepEqual(both.labelIngestions.map((li) => li.id), [8, 9]);
  assert.deepEqual(both.missingTypes, ['packing_slip']);
});

test('dispatchPrintBundle: paired label ledgers by ingestion; browser fallback carries its src', async () => {
  const { deps, cap } = fakes({
    orderDocs: [doc(10, 'shipping_label'), doc(11, 'packing_slip')],
    ingestions: [ingestion(7)],
    printNodeConfigured: false,
  });
  const out = await dispatchPrintBundle(ORG, { orderId: 42, packerLogId: 9 }, deps);
  assert.equal(out.status, 'fallback_browser');
  assert.equal(out.jobs.length, 3);
  const recorded = cap.recorded.find((r) => r.labelIngestionId === 7);
  assert.equal(recorded?.documentType, 'shipping_label');
  assert.equal(recorded?.documentId, null);
  assert.equal(recorded?.clientEventId, 'pack:9:ingestion:7');
  assert.deepEqual(
    out.browserFallbackDocs.find((d) => d.kind === 'label_ingestion'),
    {
      kind: 'label_ingestion',
      labelIngestionId: 7,
      src: '/api/orders/42/documents/label-ingestions/7',
      documentType: 'shipping_label',
      isPdf: true,
    },
  );
});

test('dispatchPrintBundle: PrintNode prints a paired label; a slip-only request leaves it out', async () => {
  const { deps, cap } = fakes({ orderDocs: [doc(11, 'packing_slip')], ingestions: [ingestion(7)] });
  const all = await dispatchPrintBundle(ORG, { orderId: 42, packerLogId: 9 }, deps);
  assert.equal(all.status, 'dispatched');
  assert.equal(cap.printCalls.length, 2);

  const slip = fakes({ orderDocs: [doc(11, 'packing_slip')], ingestions: [ingestion(7)] });
  const out = await dispatchPrintBundle(
    ORG,
    { orderId: 42, packerLogId: 9, documentTypes: ['packing_slip'] },
    slip.deps,
  );
  assert.equal(out.jobs.length, 1);
  assert.deepEqual(slip.cap.recorded.map((r) => r.documentId), [11]);
});

test('dispatchPrintBundle: missing when no docs and no manuals', async () => {
  const { deps, cap } = fakes({ orderDocs: [], manuals: [] });
  const out = await dispatchPrintBundle(ORG, { orderId: 42, packerLogId: 9 }, deps);
  assert.equal(out.status, 'missing');
  assert.equal(cap.printCalls.length, 0);
});

test('dispatchPrintBundle: PrintNode happy path dispatches label + manual', async () => {
  const { deps, cap } = fakes({
    orderDocs: [doc(10, 'shipping_label'), doc(11, 'packing_slip')],
    manuals: [manual(5)],
  });
  const out = await dispatchPrintBundle(
    ORG,
    { orderId: 42, packerLogId: 9, actorStaffId: 1 },
    deps,
  );
  assert.equal(out.status, 'dispatched');
  assert.equal(cap.printCalls.length, 3);
  assert.equal(out.manualsResolved, 1);
  assert.equal(
    (cap.recorded.find((r) => (r as { documentType: string }).documentType === 'manual') as {
      productManualId: number;
    }).productManualId,
    5,
  );
});

test('dispatchPrintBundle: manuals-only still prints when labels missing', async () => {
  const { deps, cap } = fakes({
    orderDocs: [],
    manuals: [manual(5)],
  });
  const out = await dispatchPrintBundle(ORG, { orderId: 42, packerLogId: 9 }, deps);
  assert.equal(out.status, 'dispatched');
  assert.equal(cap.printCalls.length, 1);
  assert.deepEqual(out.missingTypes, ['shipping_label', 'packing_slip']);
});

test('dispatchPrintBundle: no PrintNode → browser fallback includes manuals', async () => {
  const { deps, cap } = fakes({
    orderDocs: [doc(10, 'shipping_label')],
    manuals: [manual(5)],
    printNodeConfigured: false,
  });
  const out = await dispatchPrintBundle(ORG, { orderId: 42, packerLogId: 9 }, deps);
  assert.equal(out.status, 'fallback_browser');
  assert.equal(cap.printCalls.length, 0);
  assert.ok(out.browserFallbackDocs.some((d) => d.kind === 'outbound' && d.documentId === 10));
  assert.ok(out.browserFallbackDocs.some((d) => d.kind === 'manual' && d.productManualId === 5));
});

test('dispatchPrintBundle: manual without bytes is skipped not failed', async () => {
  const { deps } = fakes({
    orderDocs: [doc(10, 'shipping_label')],
    manuals: [manual(5, null)],
    manualBytesNull: true,
  });
  const out = await dispatchPrintBundle(ORG, { orderId: 42, packerLogId: 9 }, deps);
  assert.equal(out.status, 'dispatched');
  const manualJob = out.jobs.find((j) => j.documentType === 'manual');
  assert.equal(manualJob?.status, 'skipped');
});

test('dispatchPrintBundle: idempotent replay skips PrintNode', async () => {
  const { deps, cap } = fakes({
    orderDocs: [doc(10, 'shipping_label')],
    existingByEvent: {
      'pack:9:10': fakeJob({
        document_id: 10,
        status: 'dispatched',
        client_event_id: 'pack:9:10',
        printnode_job_id: 100,
      }),
    },
  });
  const out = await dispatchPrintBundle(ORG, { orderId: 42, packerLogId: 9 }, deps);
  assert.equal(out.status, 'idempotent_replay');
  assert.equal(out.idempotent, true);
  assert.equal(cap.printCalls.length, 0);
});
