import assert from 'node:assert/strict';
import test from 'node:test';
import type { RecordCardLine, RecordCardModel, RecordCardStatus } from '../record-card/record-card-types';
import { recordRowFace } from './record-row-face';

function line(id: number, patch: Partial<RecordCardLine> = {}): RecordCardLine {
  return {
    id,
    title: `Line ${id}`,
    photoUrl: `https://img/${id}.jpg`,
    facts: {
      qty: { kind: 'qty', value: 2 },
      sku: { kind: 'code', text: `SKU-${id}`, title: `SKU-${id}` },
      condition: { kind: 'grade', label: 'Used', code: 'USED_GOOD' },
      price: null,
    },
    alert: false,
    alertNote: null,
    ...patch,
  };
}

function model(lines: RecordCardLine[], status: RecordCardStatus): RecordCardModel {
  return {
    key: 'k',
    leadId: 1,
    state: { id: 'open', code: 'OPN', label: 'Open', tone: 'info', icon: 'circle' },
    stateIcon: () => null,
    stateMeaning: 'Open',
    alert: null,
    aria: { card: 'Rack C-01, Open', open: 'Open rack C-01', check: 'Select rack C-01' },
    channel: null,
    person: null,
    chips: [],
    notes: { fixed: null, own: null },
    status,
    next: { label: 'Count', tone: 'info', tip: 'Next: count it', blocked: true },
    lines,
    hiddenAlertLabel: (count) => `${count} more`,
  } as RecordCardModel;
}

const FACTS = [
  { id: 'qty', tier: 'always' },
  { id: 'sku', tier: 'always' },
  { id: 'condition', tier: 'always' },
  { id: 'price', tier: 'always' },
] as const;
const VIEW = { facts: FACTS, slots: { identity: 'rack', channel: 'none', person: 'none', quickLook: 'none', photo: 'none' } } as const;
const PHOTO_VIEW = { facts: FACTS, slots: { ...VIEW.slots, photo: 'line' } } as const;

test('the row reads the card: lead title with +N, the view facts in order, then the top-right status', () => {
  const face = recordRowFace(model([line(1), line(2), line(3)], { kind: 'deadline', face: 'Late 2d', tone: 'late', tip: 'Ship by Oct 1' }), VIEW, {
    identity: 'C-01',
  });
  assert.equal(face.title, 'Line 1 +2');
  assert.deepEqual(
    face.facts.map((fact) => [fact.id, fact.width]),
    [['qty', 'num'], ['sku', 'code'], ['condition', 'short'], ['status', 'short']],
  );
  const status = face.facts.at(-1);
  assert.equal(status?.value, 'Late 2d');
  assert.equal(status?.tone, 'warn');
  assert.equal(status?.tip, 'Ship by Oct 1');
  assert.deepEqual(face.next, { label: 'Count', blocked: true });
  assert.deepEqual(face.aria, { row: 'Rack C-01, Open', open: 'Open rack C-01', check: 'Select rack C-01' });
});

test('status none adds no fact; a photo column only where the view declares one; an empty record keeps an empty title', () => {
  const plain = recordRowFace(model([line(1)], { kind: 'none' }), VIEW, { identity: 'R-1' });
  assert.equal(plain.facts.some((fact) => fact.id === 'status'), false);
  assert.equal(plain.photo, undefined);
  assert.equal(plain.title, 'Line 1');

  const withPhotos = recordRowFace(model([line(7)], { kind: 'date', face: 'Moved Sep 30', tip: null, alert: true }), PHOTO_VIEW, { identity: 'R-7' });
  assert.deepEqual(withPhotos.photo, { url: 'https://img/7.jpg' });
  assert.equal(withPhotos.facts.at(-1)?.tone, 'warn');

  const empty = recordRowFace(model([], { kind: 'none' }), PHOTO_VIEW, { identity: 'R-0' });
  assert.equal(empty.title, '');
  assert.deepEqual(empty.photo, { url: null });
});

test('an ordinary state status keeps its semantic emphasis', () => {
  const face = recordRowFace(
    model([line(1)], { kind: 'state', face: 'Ready', tone: 'success', tip: 'Ready for the next step' }),
    VIEW,
    { identity: 'R-1' },
  );
  assert.equal(face.facts.at(-1)?.tone, 'default');
});
