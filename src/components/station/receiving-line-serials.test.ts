import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReceivingLineSerialsCsv, parseReturnSerialTitle, formatReturnSerialProductTitle, resolveReceivingLinePrimarySerial } from './receiving-line-serials';

test('uses persisted serial units for the table serial column', () => {
  assert.equal(
    resolveReceivingLineSerialsCsv({
      item_name: 'Return serial ignored',
      serials: [
        { id: 1, serial_number: 'SN-001' },
        { id: 2, serial_number: 'SN-002' },
      ],
    }),
    'SN-001, SN-002',
  );
});

test('falls back to a generated return title when serial projection is empty', () => {
  assert.equal(
    resolveReceivingLineSerialsCsv({
      item_name: 'Return serial 069234P72522519AE',
      serials: [],
    }),
    '069234P72522519AE',
  );
});

test('does not infer serials from ordinary product titles', () => {
  assert.equal(
    resolveReceivingLineSerialsCsv({
      item_name: 'Serialized return laptop',
      serials: [],
    }),
    '',
  );
});

test('parseReturnSerialTitle extracts the scanned serial', () => {
  assert.equal(parseReturnSerialTitle('Return serial 017817834247'), '017817834247');
  assert.equal(parseReturnSerialTitle('Bose speaker'), null);
});

test('formatReturnSerialProductTitle paints last-8 only', () => {
  assert.equal(
    formatReturnSerialProductTitle('Return serial 017817834247'),
    'Return serial 17834247',
  );
  assert.equal(
    formatReturnSerialProductTitle('Return serial ABC'),
    'Return serial ABC',
  );
  assert.equal(
    formatReturnSerialProductTitle('Bose Companion Speakers'),
    'Bose Companion Speakers',
  );
});

test('formatReturnSerialProductTitle prefers live serial over stale title', () => {
  assert.equal(
    formatReturnSerialProductTitle(
      'Return serial 017817834247',
      '083424j32000020ae',
    ),
    'Return serial 000020ae',
  );
});

test('resolveReceivingLinePrimarySerial prefers persisted units', () => {
  assert.equal(
    resolveReceivingLinePrimarySerial({
      item_name: 'Return serial 017817834247',
      serials: [{ id: 1, serial_number: '083424j32000020ae' }],
    }),
    '083424j32000020ae',
  );
});
