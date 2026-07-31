import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolvePrintBundle,
  dispatchPrintBundle,
  type PrintBundleDeps,
} from './print-bundle';
import type { OrgId } from '@/lib/tenancy/constants';
import type { OutboundDocument } from './types';
import type { DocumentPrintJobRow } from './document-print-jobs';
import type { PackBundleManual } from './pack-bundle-manuals';

const ORG = '11111111-1111-1111-1111-111111111111' as OrgId;

function doc(
  id: number,
  documentType: 'shipping_label' | 'packing_slip',
  createdAt = '2026-07-30T12:00:00Z',
): OutboundDocument {
  return {
    id,
    documentType,
    data: {
      url: `https://nas.example/doc-${id}.pdf`,
      source: 'manual_upload',
      platform: null,
      mimeType: 'application/pdf',
    },
    links: [{ entityType: 'ORDER', entityId: 42, linkRole: 'primary' }],
    createdAt,
    updatedAt: createdAt,
  };
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
  recorded: unknown[];
}

function fakes(opts: {
  orderDocs?: OutboundDocument[];
  shipmentDocs?: OutboundDocument[];
  manuals?: PackBundleManual[];
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
    readOutboundDocumentBytes: async () =>
      opts.bytesNull
        ? null
        : {
            bytes: Buffer.from('%PDF-1.4'),
            contentType: 'application/pdf',
            filename: 'label.pdf',
          },
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

test('resolvePrintBundle: newest per type; reports missing slip', async () => {
  const { deps } = fakes({
    orderDocs: [
      doc(2, 'shipping_label', '2026-07-30T13:00:00Z'),
      doc(1, 'shipping_label', '2026-07-30T12:00:00Z'),
    ],
  });
  const out = await resolvePrintBundle(ORG, { orderId: 42 }, deps);
  assert.equal(out.byType.shipping_label?.id, 2);
  assert.deepEqual(out.missingTypes, ['packing_slip']);
  assert.equal(out.documents.length, 1);
  assert.equal(out.manuals.length, 0);
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

test('dispatchPrintBundle: promoted manual ledgers documentId + productManualId', async () => {
  const { deps, cap } = fakes({
    orderDocs: [],
    manuals: [{ ...manual(5), documentId: 99 }],
  });
  const out = await dispatchPrintBundle(ORG, { orderId: 42, packerLogId: 9 }, deps);
  assert.equal(out.status, 'dispatched');
  const recorded = cap.recorded.find(
    (r) => (r as { documentType: string }).documentType === 'manual',
  ) as { documentId: number; productManualId: number; clientEventId: string };
  assert.equal(recorded.documentId, 99);
  assert.equal(recorded.productManualId, 5);
  assert.equal(recorded.clientEventId, 'pack:9:manual:doc:99');
  assert.ok(
    out.browserFallbackDocs.length === 0 ||
      out.browserFallbackDocs.every((d) => d.kind !== 'manual' || d.documentId === 99),
  );
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
