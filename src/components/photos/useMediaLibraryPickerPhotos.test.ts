import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMediaLibraryPickerFilters } from '@/components/photos/useMediaLibraryPickerPhotos';

test('buildMediaLibraryPickerFilters: browse root has no artificial date window', () => {
  const filters = buildMediaLibraryPickerFilters({
    mediaType: { scope: 'unboxing' },
    ticketTab: false,
    cartonTab: false,
    dateNav: {},
  });
  assert.ok(filters);
  assert.equal(filters!.sourceScope, 'unboxing');
  assert.equal(filters!.dateFrom, undefined);
  assert.equal(filters!.dateTo, undefined);
});

test('buildMediaLibraryPickerFilters: browse drill keeps date path', () => {
  const filters = buildMediaLibraryPickerFilters({
    mediaType: { scope: 'unboxing' },
    ticketTab: false,
    cartonTab: false,
    dateNav: { dateFrom: '2026-07-01', dateTo: '2026-07-31', poRef: '14-1' },
  });
  assert.deepEqual(filters, {
    sourceScope: 'unboxing',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
    poRef: '14-1',
  });
});

test('buildMediaLibraryPickerFilters: search without dates gets a bounded window', () => {
  const filters = buildMediaLibraryPickerFilters({
    mediaType: { scope: 'unboxing' },
    ticketTab: false,
    cartonTab: false,
    dateNav: {},
    search: 'serial',
  });
  assert.ok(filters);
  assert.equal(filters!.q, 'serial');
  assert.ok(filters!.dateFrom);
  assert.ok(filters!.dateTo);
});

test('buildMediaLibraryPickerFilters: ticket tab is claims + ticketId', () => {
  const filters = buildMediaLibraryPickerFilters({
    mediaType: null,
    ticketTab: true,
    cartonTab: false,
    ticketId: 4821,
    dateNav: {},
  });
  assert.deepEqual(filters, {
    sourceScope: 'claims',
    ticketId: '4821',
  });
});

test('buildMediaLibraryPickerFilters: carton tab scopes receivingId', () => {
  const filters = buildMediaLibraryPickerFilters({
    mediaType: null,
    ticketTab: false,
    cartonTab: true,
    receivingId: 99,
    dateNav: { poRef: 'PO-1' },
  });
  assert.deepEqual(filters, {
    receivingId: '99',
    poRef: 'PO-1',
  });
});
