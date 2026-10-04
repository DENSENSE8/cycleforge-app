import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutRuns, readShipToName, readTrackingFromRuns, readTrackingValue, type LabelTextItem } from './label-text-layout';

type Fixture = Array<[string, number[], number]>;
const items = (fixture: Fixture): LabelTextItem[] => fixture.map(([str, transform, width]) => ({ str, transform, width }));

/** ShipStation USPS label on file (2026-09-24): "SHIP"/"TO:" left of the recipient; tracking printed BELOW its caption, in a separate item. */
const SHIPSTATION_USPS: Fixture = [
  ['063S0001442592', [6.6, 0, 0, 6.6, 231.9, 415.3], 52.2],
  ['FROM 92647', [6.6, 0, 0, 6.6, 244.6, 400.4], 39.5],
  ['US POSTAGE & FEES PAID IMI', [8.9, 0, 0, 8.9, 77.3, 423.2], 129.1],
  ['USPS GROUND ADVANTAGE™', [18.6, 0, 0, 18.6, 6.3, 338.9], 275.5],
  ['KATHARINE K. DORAN', [13.3, 0, 0, 13.3, 46.8, 244.4], 141.9],
  ['39 LINDSAY DR', [13.3, 0, 0, 13.3, 46.8, 231.1], 97.1],
  ['TROY NY 12180-6566', [13.3, 0, 0, 13.3, 46.8, 217.8], 132.8],
  ['SHIP', [8.8, 0, 0, 8.8, 9, 247.9], 20.5],
  ['TO:', [8.8, 0, 0, 8.8, 9, 239.1], 14.8],
  ['USAV Solutions', [10.9, 0, 0, 10.9, 9.1, 318.3], 76.4],
  ['USAV Solutions', [10.9, 0, 0, 10.9, 9.1, 308.5], 76.4],
  ['16161 Gothard Street', [10.9, 0, 0, 10.9, 9.1, 298.6], 104.3],
  ['Suite A', [10.9, 0, 0, 10.9, 9.1, 288.8], 35],
  ['HUNTINGTN BCH CA 92647-3603', [10.9, 0, 0, 10.9, 9.1, 278.9], 168.8],
  ['USPS TRACKING #', [13.3, 0, 0, 13.3, 86.5, 137.6], 119.5],
  ['9400 1502 0621 7932 8307 94', [13.3, 0, 0, 13.3, 55.5, 53.2], 181.4],
];

/** Pitney Bowes label on file: page rotated a quarter turn, no SHIP TO marker, origin printed as "From 92647", tracking BEFORE its caption. */
const PITNEY_ROTATED: Fixture = [
  ['From 92647', [0, -8, 8, 0, 459.4, 664.9], 43.1],
  ['028W0002311384', [0, -8, 8, 0, 453.8, 523.6], 65.4],
  ['FireBall 190', [0, -8, 8, 0, 394.7, 721.7], 46.9],
  ['6241 Warner Ave', [0, -8, 8, 0, 385.6, 721.7], 68.8],
  ['Spc 121', [0, -8, 8, 0, 376.5, 721.7], 32.3],
  ['Huntington Beach CA 92647-8011', [0, -8, 8, 0, 367.5, 721.7], 136.8],
  ['MANUEL DE JESÚS RAMOS', [0, -8.8, 8.8, 0, 295.8, 681.3], 115.4],
  ['HC 64 BUZÓN 8469', [0, -8.8, 8.8, 0, 285.6, 681.3], 86.6],
  ['CALLE LAS ROSAS PROVIDENCIA', [0, -8.8, 8.8, 0, 275.4, 681.3], 143.4],
  ['PATILLAS PR 00723-9720', [0, -8.8, 8.8, 0, 265.2, 681.3], 110.2],
  ['9400 1081 0624 5331 4763 76', [0, -9.5, 9.5, 0, 145, 655.3], 129.4],
  ['USPS TRACKING #', [0, -9.5, 9.5, 0, 225.7, 633.8], 86.5],
];

test('ShipStation USPS: the ship-to beside the SHIP TO marker, never the return address', () => {
  const runs = layoutRuns(items(SHIPSTATION_USPS));
  assert.equal(readShipToName(runs), 'KATHARINE K. DORAN');
  assert.equal(readTrackingFromRuns(runs)?.normalized, '9400150206217932830794');
});

test('rotated label without a marker: the block that is not the printed origin ZIP is the recipient', () => {
  const runs = layoutRuns(items(PITNEY_ROTATED));
  assert.equal(readShipToName(runs), 'MANUEL DE JESÚS RAMOS');
  assert.equal(readTrackingFromRuns(runs)?.carrier, 'USPS');
});

test('only the return address is readable → no ship-to name (never the shipper)', () => {
  const senderOnly = SHIPSTATION_USPS.filter(([str]) => !['KATHARINE K. DORAN', '39 LINDSAY DR', 'TROY NY 12180-6566'].includes(str));
  assert.equal(readShipToName(layoutRuns(items(senderOnly))), null);
});

test('away from a TRACKING caption, a 12-digit order or meter number is not taken for FedEx tracking', () => {
  assert.equal(readTrackingFromRuns(layoutRuns(items([['Order 021412587766', [10, 0, 0, 10, 10, 100], 120]]))), null);
  assert.equal(readTrackingValue('021412587766', false)?.carrier, 'FEDEX');
});

test('barcode values: UPS 1Z and a USPS IMpb with its 420+ZIP envelope; the bare routing barcode is not tracking', () => {
  assert.equal(readTrackingValue('1ZJ22B100311214572', true)?.carrier, 'UPS');
  assert.equal(readTrackingValue('420121809400150206217932830794', true)?.normalized, '9400150206217932830794');
  assert.equal(readTrackingValue('420750781971', true), null);
});
