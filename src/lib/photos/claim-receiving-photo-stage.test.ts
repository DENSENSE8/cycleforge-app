/**
 * DB-free unit test for same-carton stage claim (bench → door).
 *
 * Run: `npx tsx --test src/lib/photos/claim-receiving-photo-stage.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PhotoStageClaimError,
  claimReceivingPhotoStage,
  type ClaimReceivingPhotoStageDeps,
  type PhotoStageClaimScope,
} from './claim-receiving-photo-stage';

const ORG = '00000000-0000-0000-0000-000000000001';

interface Calls {
  updates: Array<{ photoId: number; photoType: string; aspect: string }>;
}

function fakes(scope: PhotoStageClaimScope | null): {
  deps: ClaimReceivingPhotoStageDeps;
  calls: Calls;
} {
  const calls: Calls = { updates: [] };
  return {
    calls,
    deps: {
      loadScope: async () => scope,
      updateStageClaim: async ({ photoId, photoType, aspect }) => {
        calls.updates.push({ photoId, photoType, aspect });
      },
    },
  };
}

const BENCH: PhotoStageClaimScope = {
  entityType: 'RECEIVING',
  receivingId: 4242,
  receivingLineId: null,
  photoType: 'receiving_unbox_carton',
  rawAspect: null,
};

const DOOR: PhotoStageClaimScope = {
  entityType: 'RECEIVING',
  receivingId: 4242,
  receivingLineId: null,
  photoType: 'receiving_package',
  rawAspect: 'shipping_label',
};

const LEGACY_DOOR: PhotoStageClaimScope = {
  entityType: 'RECEIVING',
  receivingId: 4242,
  receivingLineId: null,
  photoType: 'receiving',
  rawAspect: null,
};

test('claims a bench shot as door evidence — type + aspect in one write', async () => {
  const { deps, calls } = fakes(BENCH);
  const result = await claimReceivingPhotoStage(
    {
      organizationId: ORG,
      photoId: 7,
      stage: 'arrival_package',
      aspect: 'box_exterior',
    },
    deps,
  );

  assert.equal(result.idempotent, false);
  assert.equal(result.fromStage, 'unbox_carton');
  assert.equal(result.toStage, 'arrival_package');
  assert.equal(result.fromPhotoType, 'receiving_unbox_carton');
  assert.equal(result.toPhotoType, 'receiving_package');
  assert.equal(result.toAspect, 'box_exterior');
  assert.deepEqual(calls.updates, [
    { photoId: 7, photoType: 'receiving_package', aspect: 'box_exterior' },
  ]);
});

test('already door with matching aspect writes nothing', async () => {
  const { deps, calls } = fakes(DOOR);
  const result = await claimReceivingPhotoStage(
    {
      organizationId: ORG,
      photoId: 7,
      stage: 'arrival_package',
      aspect: 'shipping_label',
    },
    deps,
  );

  assert.equal(result.idempotent, true);
  assert.deepEqual(calls.updates, []);
});

test('already door can rename aspect via claim write', async () => {
  const { deps, calls } = fakes(DOOR);
  const result = await claimReceivingPhotoStage(
    {
      organizationId: ORG,
      photoId: 7,
      stage: 'arrival_package',
      aspect: 'box_exterior',
    },
    deps,
  );

  assert.equal(result.idempotent, false);
  assert.equal(result.toPhotoType, 'receiving_package');
  assert.deepEqual(calls.updates, [
    { photoId: 7, photoType: 'receiving_package', aspect: 'box_exterior' },
  ]);
});

test('legacy package stamp normalizes to receiving_package on claim', async () => {
  const { deps, calls } = fakes(LEGACY_DOOR);
  const result = await claimReceivingPhotoStage(
    {
      organizationId: ORG,
      photoId: 7,
      stage: 'arrival_package',
      aspect: 'shipping_label',
    },
    deps,
  );

  assert.equal(result.idempotent, false);
  assert.equal(result.fromStage, 'arrival_package');
  assert.deepEqual(calls.updates, [
    { photoId: 7, photoType: 'receiving_package', aspect: 'shipping_label' },
  ]);
});

test('illegal door aspect is rejected', async () => {
  const { deps, calls } = fakes(BENCH);
  await assert.rejects(
    () =>
      claimReceivingPhotoStage(
        {
          organizationId: ORG,
          photoId: 7,
          stage: 'arrival_package',
          aspect: 'packing_material',
        },
        deps,
      ),
    (err: unknown) => err instanceof PhotoStageClaimError && err.status === 400,
  );
  assert.deepEqual(calls.updates, []);
});

test('line-scoped photos are refused — not a same-carton claim', async () => {
  const { deps, calls } = fakes({
    entityType: 'RECEIVING_LINE',
    receivingId: 4242,
    receivingLineId: 99,
    photoType: 'receiving_item',
    rawAspect: null,
  });
  await assert.rejects(
    () =>
      claimReceivingPhotoStage(
        {
          organizationId: ORG,
          photoId: 7,
          stage: 'arrival_package',
          aspect: 'shipping_label',
        },
        deps,
      ),
    (err: unknown) => err instanceof PhotoStageClaimError && err.status === 400,
  );
  assert.deepEqual(calls.updates, []);
});

test('unclassifiable carton mis-stamp is refused', async () => {
  const { deps, calls } = fakes({ ...BENCH, photoType: 'receiving_item' });
  await assert.rejects(
    () =>
      claimReceivingPhotoStage(
        {
          organizationId: ORG,
          photoId: 7,
          stage: 'arrival_package',
          aspect: 'shipping_label',
        },
        deps,
      ),
    (err: unknown) => err instanceof PhotoStageClaimError && err.status === 400,
  );
  assert.deepEqual(calls.updates, []);
});

test('missing photo is 404', async () => {
  const { deps, calls } = fakes(null);
  await assert.rejects(
    () =>
      claimReceivingPhotoStage(
        {
          organizationId: ORG,
          photoId: 7,
          stage: 'arrival_package',
          aspect: 'shipping_label',
        },
        deps,
      ),
    (err: unknown) => err instanceof PhotoStageClaimError && err.status === 404,
  );
  assert.deepEqual(calls.updates, []);
});
