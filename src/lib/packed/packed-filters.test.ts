import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  packedAllDatesActive,
  packedCurrentWeekKeys,
  packedDateExactLabel,
  packedDateWindowLabel,
  packedFiltersHot,
  packedFiltersHotLabel,
  packedShouldSeedCurrentWeek,
  packedStaffFilterOptions,
} from './packed-filters';

const TODAY = '2026-08-27'; // Thursday → week Sun 23 – Sat 29

test('packedDateWindowLabel names picker presets', () => {
  assert.equal(packedDateWindowLabel(TODAY, TODAY, TODAY), 'Today');
  assert.equal(packedDateWindowLabel('2026-08-26', '2026-08-26', TODAY), 'Yesterday');
  assert.equal(packedDateWindowLabel('2026-08-23', '2026-08-29', TODAY), 'This week');
  assert.equal(packedDateWindowLabel('2026-08-21', TODAY, TODAY), 'Last 7 days');
  assert.equal(packedDateWindowLabel('2026-07-29', TODAY, TODAY), 'Last 30 days');
  assert.equal(packedDateWindowLabel('2026-08-01', TODAY, TODAY), 'This month');
});

test('packedDateWindowLabel falls back to short civil labels', () => {
  assert.equal(packedDateWindowLabel('2026-08-15', '2026-08-15', TODAY), 'Aug 15');
  assert.equal(packedDateWindowLabel('2026-08-01', '2026-08-10', TODAY), 'Aug 1–Aug 10');
  assert.equal(packedDateWindowLabel(null, null, TODAY), null);
});

test('packedDateExactLabel uses week-pill civil numbers', () => {
  assert.equal(packedDateExactLabel('2026-08-23', '2026-08-29'), 'AUG 23rd - 29th');
  assert.equal(packedDateExactLabel(TODAY, TODAY), 'AUG 27th');
  assert.equal(packedDateExactLabel(null, null), null);
});

test('packedCurrentWeekKeys and seed gate', () => {
  assert.deepEqual(packedCurrentWeekKeys(TODAY), {
    dateFrom: '2026-08-23',
    dateTo: '2026-08-29',
  });
  assert.equal(
    packedShouldSeedCurrentWeek({ dateFrom: null, dateTo: null, allDates: false }),
    true,
  );
  assert.equal(
    packedShouldSeedCurrentWeek({ dateFrom: null, dateTo: null, allDates: true }),
    false,
  );
  assert.equal(
    packedShouldSeedCurrentWeek({
      dateFrom: '2026-08-23',
      dateTo: '2026-08-29',
      allDates: false,
    }),
    false,
  );
});

test('packedAllDatesActive accepts the flag spellings hygiene keeps', () => {
  assert.equal(packedAllDatesActive('1'), true);
  assert.equal(packedAllDatesActive('true'), true);
  assert.equal(packedAllDatesActive(null), false);
  assert.equal(packedAllDatesActive('0'), false);
});

test('packedFiltersHotLabel joins staff and the window', () => {
  assert.equal(
    packedFiltersHotLabel({
      staffName: 'Tuan',
      dateFrom: TODAY,
      dateTo: TODAY,
      todayKey: TODAY,
    }),
    'Tuan · Today',
  );
  assert.equal(
    packedFiltersHotLabel({
      staffName: null,
      dateFrom: '2026-08-21',
      dateTo: TODAY,
      todayKey: TODAY,
    }),
    'Last 7 days',
  );
  assert.equal(
    packedFiltersHotLabel({
      staffName: 'Koh',
      dateFrom: '2026-08-23',
      dateTo: '2026-08-29',
      exactDates: true,
    }),
    'Koh · AUG 23rd - 29th',
  );
  assert.equal(
    packedFiltersHotLabel({
      staffName: 'Koh',
      dateFrom: null,
      dateTo: null,
      todayKey: TODAY,
    }),
    'Koh',
  );
  assert.equal(
    packedFiltersHot({ staffId: null, dateFrom: null, dateTo: null }),
    false,
  );
});

test('packedStaffFilterOptions lists only staff who packed at least one package', () => {
  const options = packedStaffFilterOptions([
    { id: 1, shipment_id: 10, packed_by: 3, packed_by_name: 'Ada' },
    { id: 2, shipment_id: 10, packed_by: 3, packed_by_name: 'Ada' },
    { id: 3, shipment_id: 11, packed_by: 4, packed_by_name: 'Ben' },
    { id: 4, shipment_id: null, packed_by: null },
  ]);
  assert.deepEqual(
    options.map((o) => o.label),
    ['Ada', 'Ben'],
  );
  assert.equal(packedStaffFilterOptions([{ id: 1, packed_by: null }]).length, 0);
});
