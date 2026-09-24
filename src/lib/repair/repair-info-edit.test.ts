import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRepairInfoDraft,
  repairInfoDraft,
  repairInfoPlan,
  withCustomerIntent,
  type RepairInfoSource,
} from './repair-info-edit';

const unlinked: RepairInfoSource = {
  product_title: 'Bose SoundLink Mini',
  issue: 'No power',
  serial_number: 'SN123',
  price: '$89',
  notes: 'Line one\n',
  contact_info: 'Jane Doe, 555-123-4567, jane@x.com',
  customer_id: null,
};

const linked: RepairInfoSource = {
  ...unlinked,
  contact_info: 'Intake Name, 555-000-0000',
  customer_id: 42,
  customer_name: 'Jane Doe',
  customer_phone: '555-123-4567',
  customer_email: null,
};

const jack = { id: 77, name: 'Jack Roe', phone: '555-777-8888', email: 'jack@y.com' };

test('an untouched draft sends no writes, linked or not', () => {
  assert.deepEqual(repairInfoPlan(7, unlinked, repairInfoDraft(unlinked)), { writes: [], problem: null });
  assert.deepEqual(repairInfoPlan(7, linked, repairInfoDraft(linked)), { writes: [], problem: null });
});

test('whitespace-only edits are not a change; the trimmed value is what is written', () => {
  const draft = { ...repairInfoDraft(unlinked), serialNumber: '  SN123 ', issue: ' Dead battery ', contactName: ' Jane Doe ' };
  assert.deepEqual(repairInfoPlan(7, unlinked, draft).writes, [
    { label: 'Issue', method: 'PATCH', url: '/api/repair-service', body: { id: 7, field: 'issue', value: 'Dead battery' } },
  ]);
});

test('notes go through the notes key untrimmed', () => {
  const draft = { ...repairInfoDraft(unlinked), notes: 'Line one\nLine two\n' };
  assert.deepEqual(repairInfoPlan(7, unlinked, draft).writes, [
    { label: 'Notes', method: 'PATCH', url: '/api/repair-service', body: { id: 7, notes: 'Line one\nLine two\n' } },
  ]);
});

test('no customer record: contact rewrites the intake string in intake order, skipping blanks', () => {
  const draft = { ...repairInfoDraft(unlinked), contactPhone: '' };
  assert.deepEqual(repairInfoPlan(7, unlinked, draft).writes, [
    {
      label: 'Customer',
      method: 'PATCH',
      url: '/api/repair-service',
      body: { id: 7, field: 'contact_info', value: 'Jane Doe, jane@x.com' },
    },
  ]);
});

test('linked: the form shows the customer record, and a contact edit patches only the changed columns of that record', () => {
  const draft = repairInfoDraft(linked);
  assert.equal(draft.contactName, 'Jane Doe', 'seeded from the record, not the intake string');
  assert.equal(draft.contactEmail, '');
  const plan = repairInfoPlan(7, linked, { ...draft, contactPhone: '(555) 999-0000', contactEmail: 'jane@x.com' });
  assert.deepEqual(plan, {
    writes: [
      {
        label: 'Customer',
        method: 'PATCH',
        url: '/api/customers/42',
        body: { phone: '(555) 999-0000', email: 'jane@x.com' },
      },
    ],
    problem: null,
  });
});

test('linked: a blank name or a bad email is refused before any write', () => {
  const draft = repairInfoDraft(linked);
  assert.equal(repairInfoPlan(7, linked, { ...draft, contactName: '  ' }).problem, 'Name cannot be blank');
  assert.equal(repairInfoPlan(7, linked, { ...draft, contactEmail: 'nope' }).problem, 'Email is not a valid address');
  assert.equal(repairInfoPlan(7, linked, { ...draft, contactPhone: '' }).problem, null, 'a blank phone clears it');
});

test('create + link sends the typed contact, seeded from the intake string when nothing was linked', () => {
  const draft = withCustomerIntent(unlinked, repairInfoDraft(unlinked), { kind: 'create' });
  assert.equal(draft.contactName, 'Jane Doe');
  assert.deepEqual(repairInfoPlan(7, unlinked, draft), {
    writes: [
      {
        label: 'New customer',
        method: 'POST',
        url: '/api/repair-service/7/customer',
        body: { name: 'Jane Doe', phone: '555-123-4567', email: 'jane@x.com' },
      },
    ],
    problem: null,
  });
});

test('create replacing a linked customer starts blank and needs a name', () => {
  const draft = withCustomerIntent(linked, repairInfoDraft(linked), { kind: 'create' });
  assert.deepEqual([draft.contactName, draft.contactPhone, draft.contactEmail], ['', '', '']);
  assert.equal(repairInfoPlan(7, linked, draft).problem, 'Name cannot be blank');
});

test('change customer links first, then patches the picked record only where the operator edited it', () => {
  const picked = withCustomerIntent(linked, repairInfoDraft(linked), { kind: 'link', customer: jack });
  assert.equal(picked.contactName, 'Jack Roe');
  assert.deepEqual(repairInfoPlan(7, linked, picked).writes, [
    { label: 'Change customer', method: 'PUT', url: '/api/repair-service/7/customer', body: { customerId: 77 } },
  ]);
  const edited = { ...picked, contactEmail: 'jack@z.com' };
  assert.deepEqual(
    repairInfoPlan(7, linked, edited).writes.map((w) => [w.method, w.url, w.body]),
    [
      ['PUT', '/api/repair-service/7/customer', { customerId: 77 }],
      ['PATCH', '/api/customers/77', { email: 'jack@z.com' }],
    ],
  );
});

test('picking the customer already linked, or unlinking with none linked, is no change', () => {
  const typed = { ...repairInfoDraft(linked), issue: 'Cracked' };
  const same = withCustomerIntent(linked, typed, { kind: 'link', customer: { ...jack, id: 42 } });
  assert.deepEqual(same.customer, { kind: 'keep' });
  assert.equal(same.issue, 'Cracked', 'other typing survives an intent change');
  assert.deepEqual(withCustomerIntent(unlinked, repairInfoDraft(unlinked), { kind: 'unlink' }).customer, { kind: 'keep' });
});

test('unlink clears the link only; the contact falls back to the intake string, which is left alone unless edited', () => {
  const draft = withCustomerIntent(linked, repairInfoDraft(linked), { kind: 'unlink' });
  assert.equal(draft.contactName, 'Intake Name');
  assert.deepEqual(repairInfoPlan(7, linked, draft).writes, [
    { label: 'Unlink customer', method: 'DELETE', url: '/api/repair-service/7/customer' },
  ]);
  const view = applyRepairInfoDraft(linked, draft);
  assert.equal(view.customer_id, null);
  assert.equal(view.customer_name, null);
  assert.equal(view.contact_info, 'Intake Name, 555-000-0000');
});

test('optimistic view: a linked contact edit lands on the joined customer columns, not the intake string', () => {
  const view = applyRepairInfoDraft(linked, { ...repairInfoDraft(linked), contactPhone: '555-222-3333' });
  assert.equal(view.customer_phone, '555-222-3333');
  assert.equal(view.contact_info, linked.contact_info);
});
