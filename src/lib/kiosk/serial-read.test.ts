import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifySerialRead, findDuplicateSerial, unitHasSerial } from './serial-read';

describe('classifySerialRead', () => {
  it('a plain barcode serial is written as read', () => {
    assert.deepEqual(classifySerialRead('  PF3ABC12\r\n'), { kind: 'serial', serial: 'PF3ABC12', from: 'plain' });
  });

  it('the label caption printed into the code is stripped, but only with a separator', () => {
    assert.deepEqual(classifySerialRead('S/N: C02XK1ZJJG5J'), { kind: 'serial', serial: 'C02XK1ZJJG5J', from: 'labelled' });
    assert.deepEqual(classifySerialRead('Serial No. 5CG1234XYZ'), { kind: 'serial', serial: '5CG1234XYZ', from: 'labelled' });
    assert.deepEqual(classifySerialRead('SN778899'), { kind: 'serial', serial: 'SN778899', from: 'plain' });
  });

  it('a product-page QR yields the serial in its query param, whatever its case', () => {
    assert.deepEqual(classifySerialRead('https://example.com/p?model=X1&SN=ABC123'), {
      kind: 'url-serial',
      serial: 'ABC123',
      url: 'https://example.com/p?model=X1&SN=ABC123',
      from: 'sn',
    });
  });

  it('a GS1 Digital Link yields AI 21, but a shop path with a bare /21/ does not', () => {
    const dl = classifySerialRead('https://id.gs1.org/01/09506000134352/21/UNIT0042');
    assert.equal(dl.kind === 'url-serial' && dl.serial, 'UNIT0042');
    assert.equal(classifySerialRead('https://shop.example/products/21/red-widget').kind, 'url');
  });

  it('a link with no serial in it is a link to open, never a serial', () => {
    assert.deepEqual(classifySerialRead('https://support.example.com/register'), {
      kind: 'url',
      url: 'https://support.example.com/register',
    });
  });

  it('a GS1 element string from a box DataMatrix yields its serial', () => {
    assert.deepEqual(classifySerialRead('(01)09506000134352(21)SN778899'), { kind: 'serial', serial: 'SN778899', from: 'gs1' });
  });

  it('payloads and prose are refused', () => {
    assert.deepEqual(classifySerialRead('WIFI:S:Shop;T:WPA;P:hunter22;;'), { kind: 'reject', reason: 'not-a-serial' });
    assert.deepEqual(classifySerialRead('Thank you for your purchase'), { kind: 'reject', reason: 'not-a-serial' });
    assert.deepEqual(classifySerialRead('X1'), { kind: 'reject', reason: 'too-short' });
    assert.deepEqual(classifySerialRead('A'.repeat(65)), { kind: 'reject', reason: 'too-long' });
  });
});

describe('findDuplicateSerial', () => {
  const units = [
    { lineId: 'a', serialNumber: 'ABC123' },
    { lineId: 'b', serialNumber: '' },
    { lineId: 'c', serialNumber: 'WAVE01, CDX-778, REMOTE9' },
  ];

  it('finds the other unit already carrying the serial, case-blind', () => {
    assert.equal(findDuplicateSerial(units, 'b', ' abc123 ')?.lineId, 'a');
  });

  it('finds a serial held anywhere in another unit\'s list, not only a whole-value match', () => {
    assert.equal(findDuplicateSerial(units, 'a', 'cdx-778')?.lineId, 'c');
    assert.equal(findDuplicateSerial(units, 'a', 'CDX'), null);
  });

  it('a repeat onto the same unit, or a blank, is not a duplicate', () => {
    assert.equal(findDuplicateSerial(units, 'a', 'ABC123'), null);
    assert.equal(findDuplicateSerial(units, 'c', 'remote9'), null);
    assert.equal(findDuplicateSerial(units, 'a', ''), null);
  });
});

describe('unitHasSerial', () => {
  it('a serial already in the unit\'s list is a repeat, case-blind; a prefix of one is not', () => {
    assert.equal(unitHasSerial('WAVE01, CDX-778', ' cdx-778 '), true);
    assert.equal(unitHasSerial('WAVE01, CDX-778', 'CDX-77'), false);
    assert.equal(unitHasSerial('', 'WAVE01'), false);
  });
});
