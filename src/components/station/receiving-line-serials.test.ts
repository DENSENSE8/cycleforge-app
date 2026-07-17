import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReceivingLineSerialsCsv } from './receiving-line-serials';

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
