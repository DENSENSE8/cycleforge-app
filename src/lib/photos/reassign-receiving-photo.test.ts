import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PhotoReassignError,
  reassignReceivingPhoto,
  type ReassignReceivingPhotoDeps,
  type ReassignReceivingPhotoScope,
} from './reassign-receiving-photo';

const ORG = 'org-1';

const FROM_RECEIVING: ReassignReceivingPhotoScope = {
  entityType: 'RECEIVING',
  entityId: 10,
  receivingId: 10,
  receivingLineId: null,
};

const TO_RECEIVING: ReassignReceivingPhotoScope = {
  entityType: 'RECEIVING',
  entityId: 20,
  receivingId: 20,
  receivingLineId: null,
};

const TO_LINE: ReassignReceivingPhotoScope = {
  entityType: 'RECEIVING_LINE',
  entityId: 77,
  receivingId: 20,
  receivingLineId: 77,
};

function fakes(opts: {
  current?: ReassignReceivingPhotoScope | null;
  target?: ReassignReceivingPhotoScope | null;
} = {}) {
  const updates: Array<{
    organizationId: string;
    photoId: number;
    targetEntityType: 'RECEIVING' | 'RECEIVING_LINE';
    targetEntityId: number;
    poRef: string | null;
    photoType: string | null;
  }> = [];

  const deps: ReassignReceivingPhotoDeps = {
    loadPrimaryLink: async () => ('current' in opts ? (opts.current ?? null) : FROM_RECEIVING),
    resolveTarget: async () => ('target' in opts ? (opts.target ?? null) : TO_RECEIVING),
    updateAssignment: async (input) => {
      updates.push(input);
    },
    // Keep the happy path DB-free — real resolvePoRef hits Neon via pool.
    resolvePoRef: async () => 'PO_20',
  };

  return { deps, updates };
}

test('reassignReceivingPhoto moves primary link to another receiving carton', async () => {
  const { deps, updates } = fakes();
  const result = await reassignReceivingPhoto(
    {
      organizationId: ORG,
      photoId: 99,
      targetEntityType: 'RECEIVING',
      targetEntityId: 20,
    },
    deps,
  );

  assert.equal(result.idempotent, false);
  assert.equal(result.from.receivingId, 10);
  assert.equal(result.to.receivingId, 20);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].organizationId, ORG);
  assert.equal(updates[0].photoId, 99);
  assert.equal(updates[0].targetEntityType, 'RECEIVING');
  assert.equal(updates[0].targetEntityId, 20);
  assert.equal(updates[0].poRef, 'PO_20');
  // Carton → carton keeps the current stamp.
  assert.equal(updates[0].photoType, null);
});

test('reassignReceivingPhoto remaps photo_type when a carton photo moves onto a line', async () => {
  const { deps, updates } = fakes({
    current: { ...FROM_RECEIVING, photoType: 'receiving_package' },
    target: TO_LINE,
  });
  await reassignReceivingPhoto(
    {
      organizationId: ORG,
      photoId: 99,
      targetEntityType: 'RECEIVING_LINE',
      targetEntityId: 77,
    },
    deps,
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].targetEntityType, 'RECEIVING_LINE');
  assert.equal(updates[0].photoType, 'receiving_item');
});

test('reassignReceivingPhoto remaps a line item photo back to package on carton moves', async () => {
  const { deps, updates } = fakes({
    current: { ...TO_LINE, photoType: 'receiving_item' },
    target: TO_RECEIVING,
  });
  await reassignReceivingPhoto(
    {
      organizationId: ORG,
      photoId: 99,
      targetEntityType: 'RECEIVING',
      targetEntityId: 20,
    },
    deps,
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].targetEntityType, 'RECEIVING');
  assert.equal(updates[0].photoType, 'receiving_package');
});

test('reassignReceivingPhoto is idempotent when target matches current link', async () => {
  const { deps, updates } = fakes({ target: FROM_RECEIVING });
  const result = await reassignReceivingPhoto(
    {
      organizationId: ORG,
      photoId: 99,
      targetEntityType: 'RECEIVING',
      targetEntityId: 10,
    },
    deps,
  );

  assert.equal(result.idempotent, true);
  assert.equal(updates.length, 0);
});

test('reassignReceivingPhoto returns 404 when photo is not a receiving photo', async () => {
  const { deps } = fakes({ current: null });
  await assert.rejects(
    () =>
      reassignReceivingPhoto(
        {
          organizationId: ORG,
          photoId: 99,
          targetEntityType: 'RECEIVING',
          targetEntityId: 20,
        },
        deps,
      ),
    (err: unknown) => {
      assert.ok(err instanceof PhotoReassignError);
      assert.equal(err.status, 404);
      return true;
    },
  );
});

test('reassignReceivingPhoto returns 404 when target entity is missing', async () => {
  const { deps } = fakes({ target: null });
  await assert.rejects(
    () =>
      reassignReceivingPhoto(
        {
          organizationId: ORG,
          photoId: 99,
          targetEntityType: 'RECEIVING',
          targetEntityId: 404,
        },
        deps,
      ),
    (err: unknown) => {
      assert.ok(err instanceof PhotoReassignError);
      assert.equal(err.status, 404);
      return true;
    },
  );
});
