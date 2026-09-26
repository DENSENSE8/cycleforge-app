/** DB-free unit test for the aspect-classification waist. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PhotoAspectError,
  setPhotoAspect,
  type PhotoAspectScope,
  type SetPhotoAspectDeps,
} from './set-photo-aspect';

const ORG = '00000000-0000-0000-0000-000000000001';

interface Calls {
  updates: Array<{ photoId: number; aspect: string | null }>;
}

function fakes(scope: PhotoAspectScope | null): { deps: SetPhotoAspectDeps; calls: Calls } {
  const calls: Calls = { updates: [] };
  return {
    calls,
    deps: {
      loadScope: async () => scope,
      updateAspect: async ({ photoId, aspect }) => {
        calls.updates.push({ photoId, aspect });
      },
    },
  };
}

/** A bench carton shot — `unbox_carton`, currently unclassified. */
const UNCLASSIFIED_CARTON: PhotoAspectScope = {
  entityType: 'RECEIVING',
  receivingId: 4242,
  receivingLineId: null,
  photoType: 'receiving_unbox_carton',
  rawAspect: null,
};

/** A door shot — `arrival_package`, the stage the receive gate counts. */
const ARRIVAL: PhotoAspectScope = {
  entityType: 'RECEIVING',
  receivingId: 4242,
  receivingLineId: null,
  photoType: 'receiving_package',
  rawAspect: null,
};

test('classifies an unclassified carton shot', async () => {
  const { deps, calls } = fakes(UNCLASSIFIED_CARTON);
  const result = await setPhotoAspect(
    { organizationId: ORG, photoId: 7, aspect: 'packing_material' },
    deps,
  );

  assert.equal(result.idempotent, false);
  assert.equal(result.stage, 'unbox_carton');
  assert.equal(result.from, null);
  assert.equal(result.to, 'packing_material');
  assert.equal(result.receivingId, 4242);
  assert.deepEqual(calls.updates, [{ photoId: 7, aspect: 'packing_material' }]);
});

test('re-classifying overwrites and reports the previous claim', async () => {
  const { deps, calls } = fakes({ ...UNCLASSIFIED_CARTON, rawAspect: 'box_exterior' });
  const result = await setPhotoAspect(
    { organizationId: ORG, photoId: 7, aspect: 'shipping_label' },
    deps,
  );

  assert.equal(result.from, 'box_exterior');
  assert.equal(result.to, 'shipping_label');
  assert.deepEqual(calls.updates, [{ photoId: 7, aspect: 'shipping_label' }]);
});

test('clearing writes null — it is a retraction, not a no-op', async () => {
  const { deps, calls } = fakes({ ...UNCLASSIFIED_CARTON, rawAspect: 'box_exterior' });
  const result = await setPhotoAspect({ organizationId: ORG, photoId: 7, aspect: null }, deps);

  assert.equal(result.idempotent, false);
  assert.equal(result.to, null);
  assert.deepEqual(calls.updates, [{ photoId: 7, aspect: null }]);
});

test('an unrecognised stored aspect is still clearable', async () => {
  // Comparing the PARSED form would read this row's aspect as null, call the
  // clear idempotent, and leave the value in the column forever.
  const { deps, calls } = fakes({ ...UNCLASSIFIED_CARTON, rawAspect: 'from_a_future_build' });
  const result = await setPhotoAspect({ organizationId: ORG, photoId: 7, aspect: null }, deps);

  assert.equal(result.idempotent, false);
  assert.deepEqual(calls.updates, [{ photoId: 7, aspect: null }]);
});

test('setting the aspect it already carries writes nothing', async () => {
  const { deps, calls } = fakes({ ...UNCLASSIFIED_CARTON, rawAspect: 'box_exterior' });
  const result = await setPhotoAspect(
    { organizationId: ORG, photoId: 7, aspect: 'box_exterior' },
    deps,
  );

  assert.equal(result.idempotent, true);
  assert.deepEqual(calls.updates, [], 'an idempotent call must not audit a claim nobody made');
});

test('clearing an already-unclassified photo writes nothing', async () => {
  const { deps, calls } = fakes(UNCLASSIFIED_CARTON);
  const result = await setPhotoAspect({ organizationId: ORG, photoId: 7, aspect: null }, deps);

  assert.equal(result.idempotent, true);
  assert.deepEqual(calls.updates, []);
});

test('a bench aspect on an arrival photo is rejected, not written', async () => {
  // `arrival_package` is the ONLY stage the `require_one` receive gate counts,
  // and it carries only the two pre-opening shots. Letting `packing_material`
  // land there would describe a photo taken after the box was open.
  const { deps, calls } = fakes(ARRIVAL);
  await assert.rejects(
    () => setPhotoAspect({ organizationId: ORG, photoId: 7, aspect: 'packing_material' }, deps),
    (err: unknown) => err instanceof PhotoAspectError && err.status === 400,
  );
  assert.deepEqual(calls.updates, []);
});

test('an item aspect on a carton photo is rejected', async () => {
  const { deps, calls } = fakes(UNCLASSIFIED_CARTON);
  await assert.rejects(
    () => setPhotoAspect({ organizationId: ORG, photoId: 7, aspect: 'serial' }, deps),
    (err: unknown) => err instanceof PhotoAspectError && err.status === 400,
  );
  assert.deepEqual(calls.updates, []);
});

test('the two pre-opening aspects ARE legal on an arrival photo', async () => {
  for (const aspect of ['shipping_label', 'box_exterior'] as const) {
    const { deps, calls } = fakes(ARRIVAL);
    const result = await setPhotoAspect({ organizationId: ORG, photoId: 7, aspect }, deps);
    assert.equal(result.stage, 'arrival_package');
    assert.deepEqual(calls.updates, [{ photoId: 7, aspect }]);
  }
});

test('item evidence classifies against the item vocabulary', async () => {
  const { deps, calls } = fakes({
    entityType: 'RECEIVING_LINE',
    receivingId: 4242,
    receivingLineId: 99,
    photoType: 'receiving_item',
    rawAspect: null,
  });
  const result = await setPhotoAspect({ organizationId: ORG, photoId: 7, aspect: 'serial' }, deps);

  assert.equal(result.stage, 'unbox_item');
  assert.equal(result.receivingLineId, 99);
  assert.deepEqual(calls.updates, [{ photoId: 7, aspect: 'serial' }]);
});

test('a photo with no classifiable stage is a 400, never a guess', async () => {
  // `receiving_item` stamped on a CARTON is the pre-SoT desktop mis-stamp;
  // `receivingStageFromPhotoType` deliberately returns null for it.
  const { deps, calls } = fakes({ ...UNCLASSIFIED_CARTON, photoType: 'receiving_item' });
  await assert.rejects(
    () => setPhotoAspect({ organizationId: ORG, photoId: 7, aspect: 'box_exterior' }, deps),
    (err: unknown) => err instanceof PhotoAspectError && err.status === 400,
  );
  assert.deepEqual(calls.updates, []);
});

test('a photo outside receiving is a 404', async () => {
  const { deps, calls } = fakes(null);
  await assert.rejects(
    () => setPhotoAspect({ organizationId: ORG, photoId: 7, aspect: 'box_exterior' }, deps),
    (err: unknown) => err instanceof PhotoAspectError && err.status === 404,
  );
  assert.deepEqual(calls.updates, []);
});
