import test from 'node:test';
import assert from 'node:assert/strict';
import { compareImportCell, importCheckColumns, importCheckCounts, normalizeImportValue, type ImportCheckRow } from './import-check';

test('a date, a price and a tracking # compare after one normalization each', () => {
  assert.equal(compareImportCell('When', 'order_date', '9/14/2026', '2026-09-14', true).state, 'equal');
  assert.equal(compareImportCell('Paid', 'unit_cost', '$12.50', '12.50', true).state, 'equal');
  assert.equal(compareImportCell('Ship Track', 'tracking', '1Z 999 AA1 0123 456 784', '1Z999AA10123456784', true).state, 'equal');
  assert.equal(normalizeImportValue('order_date', '9/14/2026'), '2026-09-14');
  assert.equal(normalizeImportValue('unit_cost', '$12.50'), '1250');
});

test('values that differ after normalization are marked different', () => {
  assert.equal(compareImportCell('When', 'order_date', '9/14/2026', '2026-09-15', true).state, 'different');
  assert.equal(compareImportCell('Paid', 'unit_cost', '$12.50', '12.05', true).state, 'different');
  assert.equal(compareImportCell('Title', 'item_title', 'Walkman', 'Discman', true).state, 'different');
});

test('a column bound to no field is not saved; a blank one is blank', () => {
  const cell = compareImportCell('S/H', null, '$9.95', '9.95', true);
  assert.equal(cell.state, 'not_saved');
  assert.equal(cell.saved, null);
  assert.equal(compareImportCell('S/H', null, '  ', null, true).state, 'blank');
  assert.equal(compareImportCell('Paid', 'unit_cost', '$12.50', null, false).state, 'not_saved', 'a held row saved nothing');
});

test('a return reason code is shown decoded', () => {
  const cell = compareImportCell('Return Reason', 'return_reason', 'CR-DEFECTIVE', 'CR-DEFECTIVE', true);
  assert.equal(cell.state, 'equal');
  assert.equal(cell.decoded, "Defective / doesn't work");
  assert.equal(compareImportCell('Title', 'item_title', 'CR-DEFECTIVE', 'CR-DEFECTIVE', true).decoded, null);
});

test('columns name their field and DB column; counts tally rows by status and cells by state', () => {
  const columns = importCheckColumns(['Paid', 'S/H'], { unit_cost: 'Paid' });
  assert.deepEqual(
    columns.map((c) => [c.header, c.field, c.column]),
    [['Paid', 'unit_cost', 'receiving_line.unit_cost_cents'], ['S/H', null, null]],
  );

  const row = (status: ImportCheckRow['status'], cells: ImportCheckRow['cells']): ImportCheckRow => ({
    rowNumber: 1, status, problem: null, orderNumber: null, inboundOrderId: null, receivingLineId: null, cells,
  });
  const equal = compareImportCell('Paid', 'unit_cost', '$12.50', '12.50', true);
  const different = compareImportCell('Paid', 'unit_cost', '$12.50', '1.00', true);
  const notSaved = compareImportCell('S/H', null, '$9.95', null, true);
  assert.deepEqual(
    importCheckCounts([row('landed', [equal, notSaved]), row('landed', [different]), row('unchanged', [equal]), row('held', [notSaved]), row('failed', [])]),
    { rows: 5, landed: 2, unchanged: 1, held: 1, failed: 1, cellsMatching: 2, cellsDiffering: 1 },
  );
});
