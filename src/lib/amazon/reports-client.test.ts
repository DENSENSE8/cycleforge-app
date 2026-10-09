import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { detectPoPreset, identifyColumns, PO_PRESETS } from '@/lib/inbound/po-columns';
import {
  AmazonReportFatalError,
  AmazonReportTimeoutError,
  createReportsClient,
  decodeReportDocument,
  mergeFlatFileTables,
  parseFlatFileReport,
  splitReportWindow,
  type ReportsClientDeps,
  type SpApiCall,
} from './reports-client';

// GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE — header row as documented (report-type-values-returns).
const MFN_HEADERS = [
  'Order ID', 'Order date', 'Return request date', 'Return request status', 'Amazon RMA ID', 'Merchant RMA ID',
  'Label type', 'Label cost', 'Currency code', 'Return carrier', 'Tracking ID', 'Label to be paid by', 'A-to-Z Claim',
  'Is prime', 'ASIN', 'Merchant SKU', 'Item Name', 'Return quantity', 'Return Reason', 'In policy', 'Return type',
  'Resolution', 'Invoice number', 'Return delivery date', 'Order Amount', 'Order quantity', 'SafeT Action reason',
  'SafeT claim id', 'SafeT claim state', 'SafeT claim creation time', 'SafeT claim reimbursement amount',
  'Refunded Amount', 'Order Item ID',
];
const MFN_ROW = [
  '111-2222222-3333333', '2026-09-01', '2026-09-10', 'Approved', 'DZbcd123RMA', '', 'AmazonPrePaidLabel', '7.50', 'USD',
  'UPS', '1Z999AA10123456784', 'Seller', 'N', 'N', 'B0ABCDEF12', 'SKU-1', 'Shimano 105 Rear Derailleur', '1',
  'Defective/Does not work properly', 'Y', 'C-Returns', 'StandardRefund', '', '', '89.99', '1', '', '', '', '', '', '', '123',
];
const MFN_TSV = `${MFN_HEADERS.join('\t')}\r\n${MFN_ROW.join('\t')}\r\n\r\n`;

// GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA — header row as documented (report-type-values-fba).
const FBA_HEADERS = [
  'return-date', 'order-id', 'sku', 'asin', 'fnsku', 'product-name', 'quantity', 'fulfillment-center-id',
  'detailed-disposition', 'reason', 'status', 'license-plate-number', 'customer-comments',
];
const FBA_ROW = [
  '2026-09-12T08:15:00+00:00', '114-1111111-2222222', 'SKU-2', 'B0FEDCBA98', 'X00ABCD123', 'Chain checker', '1', 'PHX7',
  'CUSTOMER_DAMAGED', 'UNWANTED_ITEM', 'Unit returned to inventory', 'LPNRR123456789', 'did not fit',
];
const FBA_TSV = `${FBA_HEADERS.join('\t')}\n${FBA_ROW.join('\t')}\n`;

test('parseFlatFileReport: MFN returns report identifies as amazon_returns with its reason column', () => {
  const { headers, rows } = parseFlatFileReport(MFN_TSV);
  assert.deepEqual(headers, MFN_HEADERS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!['Return Reason'], 'Defective/Does not work properly');
  assert.equal(detectPoPreset(headers, rows), 'amazon_returns');
  const { mapping } = identifyColumns(headers, rows, { preset: PO_PRESETS.amazon_returns });
  assert.equal(mapping.order_number, 'Order ID');
  assert.equal(mapping.return_reason, 'Return Reason');
  assert.equal(mapping.rma, 'Amazon RMA ID');
  assert.equal(mapping.item_id, 'ASIN');
});

test('parseFlatFileReport: FBA customer returns report identifies as amazon_fba_returns', () => {
  const { headers, rows } = parseFlatFileReport(FBA_TSV);
  assert.deepEqual(headers, FBA_HEADERS);
  assert.equal(rows[0]!['reason'], 'UNWANTED_ITEM');
  assert.equal(detectPoPreset(headers, rows), 'amazon_fba_returns');
  const { mapping } = identifyColumns(headers, rows, { preset: PO_PRESETS.amazon_fba_returns });
  assert.equal(mapping.order_number, 'order-id');
  assert.equal(mapping.return_reason, 'reason');
  assert.equal(mapping.license_plate, 'license-plate-number');
  assert.equal(mapping.disposition, 'detailed-disposition');
});

test('parseFlatFileReport: header-only, empty, short and long lines', () => {
  assert.deepEqual(parseFlatFileReport(''), { headers: [], rows: [] });
  assert.deepEqual(parseFlatFileReport('a\tb\n'), { headers: ['a', 'b'], rows: [] });
  assert.deepEqual(parseFlatFileReport('\uFEFFa\tb\t\nx\ny\tz\textra\n'), {
    headers: ['a', 'b'],
    rows: [{ a: 'x', b: '' }, { a: 'y', b: 'z' }],
  });
});

test('decodeReportDocument: gunzips GZIP documents and honours a Cp1252 charset', () => {
  assert.equal(decodeReportDocument(gzipSync(Buffer.from(FBA_TSV, 'utf8')), 'GZIP'), FBA_TSV);
  assert.equal(decodeReportDocument(new Uint8Array(Buffer.from('\uFEFFok', 'utf8'))), 'ok');
  // 0xE9 is "é" in windows-1252.
  assert.equal(decodeReportDocument(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), undefined, 'text/plain; charset=Cp1252'), 'café');
});

test('splitReportWindow: 60-day slices covering [since, until)', () => {
  const since = new Date('2026-01-01T00:00:00Z');
  const until = new Date('2026-05-01T00:00:00Z'); // 120 days
  const slices = splitReportWindow(since, until, 60);
  assert.equal(slices.length, 2);
  assert.equal(slices[0]!.since.toISOString(), since.toISOString());
  assert.equal(slices[0]!.until.toISOString(), '2026-03-02T00:00:00.000Z');
  assert.equal(slices[1]!.until.toISOString(), until.toISOString());
  assert.deepEqual(splitReportWindow(until, since, 60), []);
});

test('mergeFlatFileTables: header union, overlapping rows kept once', () => {
  const merged = mergeFlatFileTables([
    { headers: ['a', 'b'], rows: [{ a: '1', b: '2' }] },
    { headers: ['a', 'c'], rows: [{ a: '1', c: '3' }] },
    { headers: ['a', 'b'], rows: [{ a: '1', b: '2' }] },
  ]);
  assert.deepEqual(merged.headers, ['a', 'b', 'c']);
  assert.deepEqual(merged.rows, [{ a: '1', b: '2', c: '' }, { a: '1', b: '', c: '3' }]);
});

// ── polling / download with injected SP-API call + fetch ──────────────────────

interface Harness {
  deps: ReportsClientDeps;
  calls: string[];
  sleeps: number[];
  downloads: string[];
}

function harness(script: (op: string, path: string, body: unknown) => unknown, document?: Response): Harness {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const downloads: string[] = [];
  let clock = 0;
  const call = (async (opts: { operation: string; path: string; body?: unknown }) => {
    calls.push(opts.operation);
    return script(opts.operation, opts.path, opts.body);
  }) as SpApiCall;
  return {
    calls,
    sleeps,
    downloads,
    deps: {
      call,
      download: async (url) => {
        downloads.push(url);
        return document ?? new Response('');
      },
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
    },
  };
}

const SPEC = {
  reportType: 'GET_FLAT_FILE_RETURNS_DATA_BY_RETURN_DATE',
  marketplaceIds: ['ATVPDKIKX0DER'],
  dataStartTime: new Date('2026-09-01T00:00:00Z'),
  dataEndTime: new Date('2026-10-01T00:00:00Z'),
};

test('runReport: polls IN_QUEUE → IN_PROGRESS → DONE with growing backoff, downloads and gunzips', async () => {
  const statuses = ['IN_QUEUE', 'IN_PROGRESS', 'DONE'];
  let createBody: unknown = null;
  const h = harness(
    (op, path, body) => {
      if (op === 'createReport') {
        assert.equal(path, '/reports/2021-06-30/reports');
        createBody = body;
        return { reportId: 'R1' };
      }
      if (op === 'getReport') {
        assert.equal(path, '/reports/2021-06-30/reports/R1');
        const status = statuses.shift()!;
        return { reportId: 'R1', reportType: SPEC.reportType, processingStatus: status, reportDocumentId: status === 'DONE' ? 'D1' : undefined };
      }
      assert.equal(path, '/reports/2021-06-30/documents/D1');
      return { reportDocumentId: 'D1', url: 'https://s3.example/doc', compressionAlgorithm: 'GZIP' };
    },
    new Response(gzipSync(Buffer.from(MFN_TSV, 'utf8'))),
  );
  const client = createReportsClient(h.deps, { pollInitialMs: 1000, pollMaxMs: 1800 });
  const text = await client.runReport(SPEC);
  assert.equal(text, MFN_TSV);
  assert.deepEqual(createBody, {
    reportType: SPEC.reportType,
    marketplaceIds: ['ATVPDKIKX0DER'],
    dataStartTime: '2026-09-01T00:00:00.000Z',
    dataEndTime: '2026-10-01T00:00:00.000Z',
  });
  assert.deepEqual(h.calls, ['createReport', 'getReport', 'getReport', 'getReport', 'getReportDocument']);
  assert.deepEqual(h.sleeps, [1000, 1500]);
  assert.deepEqual(h.downloads, ['https://s3.example/doc']);
});

test('runReport: CANCELLED (no data) → null without a download', async () => {
  const h = harness((op) =>
    op === 'createReport' ? { reportId: 'R2' } : { reportId: 'R2', reportType: SPEC.reportType, processingStatus: 'CANCELLED' },
  );
  assert.equal(await createReportsClient(h.deps).runReport(SPEC), null);
  assert.deepEqual(h.downloads, []);
});

test('runReport: FATAL throws with the error document text', async () => {
  const h = harness(
    (op) => {
      if (op === 'createReport') return { reportId: 'R3' };
      if (op === 'getReport') return { reportId: 'R3', reportType: SPEC.reportType, processingStatus: 'FATAL', reportDocumentId: 'E3' };
      return { reportDocumentId: 'E3', url: 'https://s3.example/err' };
    },
    new Response('{"errorDetails":"Report not available for this marketplace"}'),
  );
  await assert.rejects(createReportsClient(h.deps).runReport(SPEC), (err: unknown) => {
    assert.ok(err instanceof AmazonReportFatalError);
    assert.match(err.message, /not available for this marketplace/);
    return true;
  });
});

test('runReport: still processing past the overall timeout → AmazonReportTimeoutError', async () => {
  const h = harness((op) =>
    op === 'createReport' ? { reportId: 'R4' } : { reportId: 'R4', reportType: SPEC.reportType, processingStatus: 'IN_PROGRESS' },
  );
  const client = createReportsClient(h.deps, { pollInitialMs: 1000, pollMaxMs: 4000, timeoutMs: 10_000 });
  await assert.rejects(client.runReport(SPEC), AmazonReportTimeoutError);
  assert.ok(h.sleeps.reduce((a, b) => a + b, 0) <= 10_000);
});

test('createReport: a 429 past callSpApi retries waits and retries; other errors surface at once', async () => {
  let attempts = 0;
  const h = harness(() => {
    attempts += 1;
    if (attempts <= 2) throw new Error('SP-API createReport failed: HTTP 429 QuotaExceeded');
    return { reportId: 'R5' };
  });
  const client = createReportsClient(h.deps, { throttleInitialMs: 15_000, throttleMaxMs: 60_000 });
  assert.equal(await client.createReport(SPEC), 'R5');
  assert.deepEqual(h.sleeps, [15_000, 30_000]);

  const failing = harness(() => {
    throw new Error('SP-API createReport failed: HTTP 403 Unauthorized');
  });
  await assert.rejects(createReportsClient(failing.deps).createReport(SPEC), /HTTP 403/);
  assert.deepEqual(failing.sleeps, []);
});
