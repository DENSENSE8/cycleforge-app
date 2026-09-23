import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { projectEcwidPackingSlipJob } from './ecwid-packing-slip-lifecycle';

const migration = readFileSync(
  join(process.cwd(), 'src/lib/migrations/2026-09-17a_ecwid_packing_slip_ingest_jobs.sql'),
  'utf8',
);

test('projects durable lifecycle rows into the three operator states', () => {
  const base = {
    id: 1,
    order_id: 42,
    attempt_count: 2,
    next_attempt_at: null,
    document_id: null,
    last_error: null,
  } as const;

  assert.equal(projectEcwidPackingSlipJob({ ...base, status: 'pending' }).label, 'Processing');
  assert.equal(projectEcwidPackingSlipJob({ ...base, status: 'processing' }).label, 'Processing');
  assert.equal(projectEcwidPackingSlipJob({ ...base, status: 'failed' }).label, 'Import failed');
  assert.equal(
    projectEcwidPackingSlipJob({ ...base, status: 'available', document_id: 9 }).label,
    'Available',
  );
});

test('schema enforces one job per order and byte-level document deduplication', () => {
  assert.match(migration, /UNIQUE \(organization_id, provider, order_id, document_type\)/);
  assert.match(migration, /ux_documents_outbound_order_content_hash/);
  assert.match(migration, /document_data->>'sha256Hex'/);
});

