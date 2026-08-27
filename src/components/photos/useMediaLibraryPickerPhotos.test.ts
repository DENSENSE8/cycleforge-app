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
  assert.equal(filters!.poFinder, 'serial');
  assert.equal(filters!.poFinderKind, 'any');
  assert.equal(filters!.q, undefined);
  assert.ok(filters!.dateFrom);
  assert.ok(filters!.dateTo);
});

test('buildMediaLibraryPickerFilters: claims search uses ticket finder kind', () => {
  const filters = buildMediaLibraryPickerFilters({
    mediaType: { scope: 'claims' },
    ticketTab: false,
    cartonTab: false,
    dateNav: {},
    search: '9599',
  });
  assert.ok(filters);
  assert.equal(filters!.sourceScope, 'claims');
  assert.equal(filters!.poFinder, '9599');
  assert.equal(filters!.poFinderKind, 'ticket');
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
