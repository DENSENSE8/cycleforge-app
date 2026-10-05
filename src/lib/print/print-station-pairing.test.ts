import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePrintStationPairCode,
  PRINT_STATION_PAIR_CODE_LENGTH,
  printStationDevicePairBodySchema,
  printStationRePairBodySchema,
} from './print-station-registry-contracts';

test('print station pairing input keeps exactly four digits', () => {
  assert.equal(PRINT_STATION_PAIR_CODE_LENGTH, 4);
  assert.equal(normalizePrintStationPairCode(' 12-34 '), '1234');
  assert.equal(normalizePrintStationPairCode('ab5C2-x9Z7'), '5297');
  assert.equal(normalizePrintStationPairCode('00127'), '0012');
});

test('re-pair targets one existing station', () => {
  assert.equal(printStationRePairBodySchema.safeParse({ stationId: 'ps_1234' }).success, true);
  assert.equal(printStationRePairBodySchema.safeParse({ stationId: '' }).success, false);
  assert.equal(printStationRePairBodySchema.safeParse({ stationId: 'ps_1234', code: '1234' }).success, false);
});

test('print station pairing API accepts only a complete four-digit code', () => {
  assert.equal(printStationDevicePairBodySchema.safeParse({ code: '0427' }).success, true);
  assert.equal(printStationDevicePairBodySchema.safeParse({ code: '427' }).success, false);
  assert.equal(printStationDevicePairBodySchema.safeParse({ code: '42A7' }).success, false);
  assert.equal(printStationDevicePairBodySchema.safeParse({ code: '04278' }).success, false);
});
