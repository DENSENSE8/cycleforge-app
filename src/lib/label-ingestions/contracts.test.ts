import assert from 'node:assert/strict';
import test from 'node:test';
import { buildV1OpenApi } from '@/lib/api/v1-openapi';
import { labelIngestionApplyBodySchema, labelIngestionUploadFieldsSchema } from './contracts';
test('upload contract rejects client tenancy and device authority', () => {
  assert.equal(labelIngestionUploadFieldsSchema.safeParse({ clientEventId: '00000000-0000-4000-8000-000000000001', observedAt: '2026-09-18T12:00:00.000Z', organizationId: '00000000-0000-4000-8000-000000000002' }).success, false);
});
test('upload checksum hint must be lower-case SHA-256 when supplied', () => {
  assert.equal(labelIngestionUploadFieldsSchema.safeParse({ clientEventId: '00000000-0000-4000-8000-000000000001', observedAt: '2026-09-18T12:00:00.000Z', sha256: 'A'.repeat(64) }).success, false);
});
test('apply contract permits only an optimistic row version', () => {
  assert.equal(labelIngestionApplyBodySchema.safeParse({ expectedRowVersion: 4 }).success, true);
  assert.equal(labelIngestionApplyBodySchema.safeParse({ expectedRowVersion: 4, actorStaffId: 99 }).success, false);
});
test('openapi contract has no organization, staff, or device inputs', () => {
  const document = JSON.stringify(buildV1OpenApi());
  assert.equal(document.includes('organizationId'), false); assert.equal(document.includes('actorStaffId'), false); assert.equal(document.includes('deviceId'), false);
});
