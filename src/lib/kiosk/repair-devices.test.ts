/** The kiosk repair DEVICE list, as behaviour. */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { KioskCartLine } from './cart-line';
import {
  repairDeviceBlockReason,
  repairDeviceGaps,
  repairDevicesComplete,
  repairDevicesFromLines,
  repairDevicesTotalCents,
  summarizeProductTitles,
} from './repair-devices';

function repairLine(
  id: string,
  productModel: string,
  serialNumber: string,
  price: string,
  cents: number,
): KioskCartLine {
  return {
    id,
    type: 'REPAIR',
    title: productModel,
    quantity: 1,
    unitAmountCents: cents,
    payload: { productModel, sourceSku: `${id}-RS`, serialNumber, price },
  };
}

const retailLine: KioskCartLine = {
  id: 'r1',
  type: 'RETAIL',
  title: 'Carry case',
  quantity: 1,
  unitAmountCents: 2999,
  payload: { variationId: 'v1', sku: 'CASE-1' },
};

test('every repair line is its own device, in cart order', () => {
  const devices = repairDevicesFromLines([
    repairLine('a', 'Wave Radio II', '0483221', '168.00', 16800),
    retailLine,
    repairLine('b', 'Acoustimass 6', '', '170.00', 17000),
  ]);

  assert.deepEqual(
    devices.map((d) => [d.lineId, d.title, d.serialNumber]),
    [
      ['a', 'Wave Radio II', '0483221'],
      ['b', 'Acoustimass 6', ''],
    ],
  );
});

test('retail and buyback lines are not devices', () => {
  assert.deepEqual(repairDevicesFromLines([retailLine]), []);
});

test('a device short of a serial blocks the step, and is NAMED', () => {
  // The old gate passed the whole visit on device one's serial; device two was
  // written blank. The refusal has to say which unit is short.
  const devices = repairDevicesFromLines([
    repairLine('a', 'Wave Radio II', '0483221', '168.00', 16800),
    repairLine('b', 'Acoustimass 6', '', '170.00', 17000),
  ]);

  assert.equal(repairDevicesComplete(devices), false);
  assert.deepEqual(repairDeviceGaps(devices), [
    { lineId: 'b', title: 'Acoustimass 6', missing: ['Serial #'] },
  ]);
  assert.equal(repairDeviceBlockReason(devices), 'Acoustimass 6 still needs its Serial #');
});

test('a single device keeps the plain refusal', () => {
  const devices = repairDevicesFromLines([repairLine('a', 'Wave Radio II', '', '', 0)]);
  assert.equal(repairDeviceBlockReason(devices), 'Enter the Serial # and Price');
});

test('a visit with no device on it is not submittable', () => {
  assert.equal(repairDevicesComplete([]), false);
  assert.equal(repairDeviceBlockReason([]), 'Add the device being dropped off');
});

test('every device serialised and quoted opens the step', () => {
  const devices = repairDevicesFromLines([
    repairLine('a', 'Wave Radio II', '0483221', '168.00', 16800),
    repairLine('b', 'Acoustimass 6', '9912', '170.00', 17000),
  ]);
  assert.equal(repairDevicesComplete(devices), true);
  assert.equal(repairDeviceBlockReason(devices), undefined);
  // The money the cart already computed — never a second parse of the quote.
  assert.equal(repairDevicesTotalCents(devices), 33800);
});

test('a visit is summarized, never concatenated', () => {
  // `A, B, C, D` at text-3xl leaves the customer display. One product plus a
  // count answers the same question at any width.
  assert.equal(summarizeProductTitles([]), '');
  assert.equal(summarizeProductTitles(['Wave Radio II']), 'Wave Radio II');
  assert.equal(
    summarizeProductTitles(['Wave Radio II', 'Acoustimass 6', 'SoundDock']),
    'Wave Radio II + 2 more',
  );
  assert.equal(summarizeProductTitles(['  ', 'Acoustimass 6']), 'Acoustimass 6');
});
