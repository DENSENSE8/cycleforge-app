import test from 'node:test';
import assert from 'node:assert/strict';
import { QA_PREVIEW_ROLES } from './role-preview-roles';

test('preview roles are the named QA personas, not arbitrary staff ids', () => {
  assert.deepEqual(
    QA_PREVIEW_ROLES.map((r) => r.key),
    ['admin', 'receiver', 'technician', 'packer', 'shipper'],
  );
  assert.ok(QA_PREVIEW_ROLES.every((r) => r.label.startsWith('QA ')));
});
