import assert from 'node:assert/strict';
import test from 'node:test';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { marryByCardOrder, planPress, type PressStation } from './desk-press';

const doc = (key: string, stock: 'label' | 'paper', orderId: number | null): DeskDocument => ({
  key,
  kind: stock === 'label' ? 'label' : 'packing_slip',
  title: key,
  src: `/x/${key}`,
  stock,
  ingestionId: stock === 'label' ? Number(key.split(':')[1]) : null,
  orderId,
  documentId: stock === 'paper' ? Number(key.split(':')[1]) : null,
  manualId: null,
});

const here: PressStation = { stationId: 'ps_here', stationName: 'This desk', thisComputer: true };
const bench: PressStation = { stationId: 'ps_bench', stationName: 'Packing bench', thisComputer: false };
const thermal: PressStation = { stationId: 'ps_thermal', stationName: 'Thermal bench', thisComputer: false };

const mixed = [doc('label:1', 'label', 10), doc('doc:7', 'paper', 10), doc('label:2', 'label', 20), doc('doc:8', 'paper', 20)];

test('a mixed press sends exactly one batch per stock to that stock’s station, card order kept', () => {
  const plan = planPress(mixed, { label: thermal, paper: bench }, () => null, 200);
  assert.deepEqual(plan.local, []);
  assert.deepEqual(
    plan.remote.map((job) => [job.stock, job.station.stationId, job.documents.map((d) => d.key)]),
    [
      ['label', 'ps_thermal', ['label:1', 'label:2']],
      ['paper', 'ps_bench', ['doc:7', 'doc:8']],
    ],
  );
});

test('this computer prints its stocks locally in the order given; a blocked remote stock sends nothing', () => {
  const plan = planPress(mixed, { label: here, paper: bench }, (stock) => (stock === 'paper' ? 'Packing bench is offline.' : null), 200);
  assert.deepEqual(plan.local.map((d) => d.key), ['label:1', 'label:2']);
  assert.deepEqual(plan.remote, []);
  assert.deepEqual(plan.blocked, [{ stock: 'paper', count: 2, reason: 'Packing bench is offline.' }]);
});

test('no station at all falls back to this computer for both stocks, interleaved as given', () => {
  const plan = planPress(mixed, { label: null, paper: null }, () => 'never asked', 200);
  assert.deepEqual(plan.local.map((d) => d.key), ['label:1', 'doc:7', 'label:2', 'doc:8']);
});

test('a stock past the wire cap goes out as several jobs to the same station, order kept', () => {
  const labels = [1, 2, 3, 4, 5].map((id) => doc(`label:${id}`, 'label', id));
  const plan = planPress(labels, { label: thermal, paper: bench }, () => null, 2);
  assert.deepEqual(plan.remote.map((job) => [job.station.stationId, job.documents.map((d) => d.key)]), [
    ['ps_thermal', ['label:1', 'label:2']],
    ['ps_thermal', ['label:3', 'label:4']],
    ['ps_thermal', ['label:5']],
  ]);
});

test('paperwork follows the label card order; orders without a label card trail in queue order', () => {
  const labels = [doc('label:2', 'label', 20), doc('label:1', 'label', 10)];
  const paper = [doc('doc:5', 'paper', 30), doc('doc:7', 'paper', 10), doc('doc:8', 'paper', 20), doc('doc:9', 'paper', 10)];
  assert.deepEqual(marryByCardOrder(labels, paper).map((d) => d.key), ['label:2', 'label:1', 'doc:8', 'doc:7', 'doc:9', 'doc:5']);
});
