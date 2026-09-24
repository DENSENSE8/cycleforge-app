import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeDeclinedReason,
  intakeSignatureUrl,
  pickupReviewPaperwork,
  pickupSignoffInput,
  PICKUP_DECLINE_DETAIL_MAX,
} from './pickup-signoff';

const signature = { dataUrl: 'data:image/png;base64,AAAA', strokes: [{ points: [] }] };

test('decline sentence: chip, detail, both, neither', () => {
  assert.equal(composeDeclinedReason('Refused to sign', '  '), 'Refused to sign');
  assert.equal(composeDeclinedReason(null, '  hands full '), 'hands full');
  assert.equal(composeDeclinedReason('Unable to sign', 'cast'), 'Unable to sign — cast');
  assert.equal(composeDeclinedReason(null, '   '), null);
});

test('decline detail is capped', () => {
  const long = 'x'.repeat(PICKUP_DECLINE_DETAIL_MAX + 50);
  assert.equal(composeDeclinedReason(null, long)?.length, PICKUP_DECLINE_DETAIL_MAX);
});

test('a signed pickup sends the signature, trimmed signer, and no decline', () => {
  const out = pickupSignoffInput({
    repairId: 7,
    signerName: '  Jane Doe ',
    signature,
    declinedReason: null,
  });
  assert.deepEqual(out, {
    ok: true,
    input: { repairId: 7, signerName: 'Jane Doe', signature, declinedReason: null },
  });
});

test('a declined pickup sends the reason and no signature', () => {
  const out = pickupSignoffInput({
    repairId: 7,
    signerName: 'Jane',
    signature: null,
    declinedReason: ' Refused to sign ',
  });
  assert.deepEqual(out, {
    ok: true,
    input: { repairId: 7, signerName: 'Jane', signature: null, declinedReason: 'Refused to sign' },
  });
});

test('refuses: no signer, neither path, both paths', () => {
  const base = { repairId: 7, signerName: 'Jane', signature: null, declinedReason: null };
  assert.equal(pickupSignoffInput({ ...base, signerName: '   ', signature }).ok, false);
  assert.equal(pickupSignoffInput(base).ok, false);
  assert.equal(pickupSignoffInput({ ...base, declinedReason: '   ' }).ok, false);
  assert.equal(pickupSignoffInput({ ...base, signature, declinedReason: 'Refused' }).ok, false);
});

test('intake ink: newest intake (or legacy NULL type) with a url; never the pickup row', () => {
  assert.equal(
    intakeSignatureUrl([
      { document_type: 'pickup_agreement', signature_url: 'https://b/pickup.png' },
      { document_type: 'intake_agreement', signature_url: null },
      { document_type: null, signature_url: 'https://b/legacy.png' },
      { document_type: 'intake_agreement', signature_url: 'https://b/older.png' },
    ]),
    'https://b/legacy.png',
  );
  assert.equal(
    intakeSignatureUrl([{ document_type: 'pickup_agreement', signature_url: 'https://b/p.png' }]),
    null,
  );
});

test('review paperwork: joined customer wins per field, phone formatted, date MM/DD/YYYY', () => {
  const props = pickupReviewPaperwork({
    ticket_number: '9998',
    product_title: 'SoundLink Mini',
    issue: 'No power',
    serial_number: 'SN1',
    price: '89',
    created_at: '2026-09-01T15:00:00.000Z',
    contact_info: 'Old Name, 5551234567, old@x.com',
    customer_name: 'Jane Doe',
    customer_phone: null,
    customer_email: 'jane@x.com',
  });
  assert.equal(props.name, 'Jane Doe');
  assert.equal(props.contact, '555-123-4567, jane@x.com');
  assert.equal(props.startDateTime, '09/01/2026');
  assert.equal(props.ticketNumber, '9998');
});
