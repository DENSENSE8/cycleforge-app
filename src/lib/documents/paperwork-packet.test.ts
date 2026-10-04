import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaperworkPackets, type PaperworkPacketDeps } from './paperwork-packet';
import type { DocumentPrintJobInput } from './document-print-jobs';
import type { OutboundDocument } from './types';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-1111-1111-1111-111111111111' as OrgId;

function doc(id: number, documentType: 'shipping_label' | 'packing_slip'): OutboundDocument {
  return {
    id,
    documentType,
    data: { url: `https://nas.example/${id}.pdf`, source: 'manual_upload', platform: null, mimeType: 'application/pdf', filename: `${documentType}-${id}.pdf` },
    links: [],
    createdAt: '2026-09-24T00:00:00Z',
    updatedAt: '2026-09-24T00:00:00Z',
  } as OutboundDocument;
}

function fakes() {
  const recorded: Array<{ input: DocumentPrintJobInput; orgId: OrgId }> = [];
  const deps: PaperworkPacketDeps = {
    resolve: async (_org, orderId) => {
      if (orderId === 2) {
        return { documents: [doc(21, 'shipping_label')], manuals: [], labelIngestions: [], byType: {}, missingTypes: ['packing_slip'] };
      }
      if (orderId === 3) {
        return {
          documents: [doc(31, 'packing_slip')],
          manuals: [],
          labelIngestions: [{ id: 9, fileBasename: 'paired.pdf', trackingNumberNormalized: '1Z9' }],
          byType: {},
          missingTypes: [],
        };
      }
      return {
        documents: [doc(11, 'shipping_label'), doc(12, 'packing_slip')],
        manuals: [
          { id: 7, documentId: 70, displayName: 'Manual A', sourceUrl: null, fileName: 'a.pdf', sku: null, itemNumber: null },
          { id: 8, documentId: null, displayName: 'Manual B', sourceUrl: null, fileName: 'b.pdf', sku: null, itemNumber: null },
        ],
        labelIngestions: [],
        byType: {},
        missingTypes: [],
      };
    },
    record: async (input, orgId) => {
      recorded.push({ input, orgId });
      return null;
    },
  };
  return { deps, recorded };
}

test('buildPaperworkPackets: pack order — label, slip, then manuals — with content URLs', async () => {
  const { deps } = fakes();
  const [packet] = await buildPaperworkPackets(ORG, { orderIds: [1], batchId: 'b1', actorStaffId: 5 }, deps);
  assert.deepEqual(
    packet.items.map((i) => [i.documentType, i.src]),
    [
      ['shipping_label', '/api/documents/11/content'],
      ['packing_slip', '/api/documents/12/content'],
      ['manual', '/api/documents/70/content'],
      ['manual', '/api/product-manuals/8/content'],
    ],
  );
});

test('buildPaperworkPackets: every page is ledgered fallback_browser, keyed by batch', async () => {
  const { deps, recorded } = fakes();
  await buildPaperworkPackets(ORG, { orderIds: [1, 2], batchId: 'b1', actorStaffId: 5 }, deps);
  assert.equal(recorded.length, 5);
  assert.ok(recorded.every((r) => r.orgId === ORG && r.input.status === 'fallback_browser' && r.input.actorStaffId === 5));
  assert.deepEqual(
    recorded.map((r) => r.input.clientEventId),
    [
      'desk-print:b1:1:doc:11',
      'desk-print:b1:1:doc:12',
      'desk-print:b1:1:doc:70',
      'desk-print:b1:1:manual:8',
      'desk-print:b1:2:doc:21',
    ],
  );
});

test('buildPaperworkPackets: reports missing types; drops bad and duplicate ids', async () => {
  const { deps } = fakes();
  const packets = await buildPaperworkPackets(ORG, { orderIds: [2, 2, -1, 0], batchId: 'b', actorStaffId: null }, deps);
  assert.equal(packets.length, 1);
  assert.deepEqual(packets[0].missingTypes, ['packing_slip']);
});

test('buildPaperworkPackets: a paired label prints from its order-scoped URL and ledgers by ingestion', async () => {
  const { deps, recorded } = fakes();
  const [packet] = await buildPaperworkPackets(ORG, { orderIds: [3], batchId: 'b3', actorStaffId: 5 }, deps);
  assert.deepEqual(
    packet.items.map((i) => [i.kind, i.src]),
    [
      ['outbound', '/api/documents/31/content'],
      ['label_ingestion', '/api/orders/3/documents/label-ingestions/9'],
    ],
  );
  const paired = recorded.find((r) => r.input.labelIngestionId === 9);
  assert.equal(paired?.input.documentType, 'shipping_label');
  assert.equal(paired?.input.documentId, null);
  assert.equal(paired?.input.clientEventId, 'desk-print:b3:3:ingestion:9');
});
