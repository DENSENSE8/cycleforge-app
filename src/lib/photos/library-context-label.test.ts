import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describePhotoLibraryContext,
  photoLibraryPoLeafLabel,
  resolvePhotoLibraryFolderLeafLabel,
} from '@/lib/photos/library-context-label';
import { photoStageLabel } from '@/lib/photos/stages';

test('describePhotoLibraryContext prefers the source scope title when no narrower filter is set', () => {
  const { title, subtitle } = describePhotoLibraryContext({ sourceScope: 'claims' });

  assert.equal(title, 'Zendesk Claims');
  assert.equal(subtitle, 'Browse receiving, packing, and unit photos');
});

test('describePhotoLibraryContext prefers PO over receivingId when both are set', () => {
  const { title } = describePhotoLibraryContext({
    sourceScope: 'unboxing',
    receivingId: '88',
    poRef: '14-14825',
  });
  assert.equal(title, 'PO 14-14825');
});

test('photoLibraryPoLeafLabel formats unfound unboxing refs', () => {
  assert.equal(photoLibraryPoLeafLabel('PO_13204', 'unboxing'), 'PO Unfound — 13204');
  assert.equal(photoLibraryPoLeafLabel('14-1', 'packing'), 'Order 14-1');
});

test('resolvePhotoLibraryFolderLeafLabel prefers ticket → PO → carton', () => {
  assert.equal(
    resolvePhotoLibraryFolderLeafLabel({
      scope: 'unboxing',
      ticketId: '4821',
      poRef: '14-1',
      receivingId: '88',
    }),
    '#4821',
  );
  assert.equal(
    resolvePhotoLibraryFolderLeafLabel({
      scope: 'unboxing',
      poRef: '14-14825',
      receivingId: '88',
    }),
    'PO 14-14825',
  );
  assert.equal(
    resolvePhotoLibraryFolderLeafLabel({
      scope: 'unboxing',
      receivingId: '88',
    }),
    'Carton #88',
  );
});

test('unboxing + stage sub-filter titles the header with the stage label (via the SoT)', () => {
  const { title, subtitle } = describePhotoLibraryContext({
    sourceScope: 'unboxing',
    stage: 'unbox_item',
  });

  assert.equal(title, photoStageLabel('unbox_item'));
  assert.equal(title, 'Unbox · item');
  assert.equal(subtitle, 'Unboxing evidence at this stage');
});

test('a SKU filter titles the header even under an active scope', () => {
  const skuHeader = describePhotoLibraryContext({ sourceScope: 'unboxing', sku: 'WM-1023' });
  assert.equal(skuHeader.title, 'SKU WM-1023');

  const bare = describePhotoLibraryContext({ sku: 'WM-1023' });
  assert.equal(bare.title, 'SKU WM-1023');
  assert.equal(bare.subtitle, 'Photos linked to this SKU across intake, testing, and packing');
});

test('a serial filter titles the header with the unit serial', () => {
  const { title, subtitle } = describePhotoLibraryContext({ serial: 'SN0042' });
  assert.equal(title, 'Serial SN0042');
  assert.equal(subtitle, 'Photos linked to this serialized unit');
});

test('narrower entity filters still outrank the stage header', () => {
  const { title } = describePhotoLibraryContext({
    sourceScope: 'unboxing',
    stage: 'unbox_item',
    receivingId: '1987',
  });
  // Carton, not "Receiving" — main renamed this leaf label; the assertion
  // here is that a carton filter outranks the stage header, not the wording.
  assert.equal(title, 'Carton #1987');
});
