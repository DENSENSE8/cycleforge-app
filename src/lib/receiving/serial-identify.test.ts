import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeSerialRead,
  resolveSerialReads,
  type SerialIdentifyDeps,
} from './serial-identify';

const ORG = '00000000-0000-0000-0000-0000000000aa';

function fakes(existing: Array<{ normalized: string; receivingLineId: number | null }> = []) {
  const calls: Array<{ orgId: string; normalized: string[] }> = [];
  const deps: SerialIdentifyDeps = {
    findExisting: async (orgId, normalized) => {
      calls.push({ orgId, normalized });
      return existing;
    },
  };
  return { deps, calls };
}

test('a carrier tracking number is never a serial candidate', async () => {
  // The one misclassification that matters: an OCR pass over a box picks up the
  // shipping label as readily as the unit, and attaching that as the unit's
  // identity is unrecoverable without a human noticing.
  assert.equal(normalizeSerialRead('1Z999AA10123456784'), null, 'UPS');
  assert.equal(normalizeSerialRead('9400111899223197428490'), null, 'USPS');
});

test('non-serial scan vocabularies are dropped', async () => {
  assert.equal(normalizeSerialRead('SKU:ABC-123'), null, 'SKU');
  assert.equal(normalizeSerialRead('RS-4192'), null, 'repair ticket');
  assert.equal(normalizeSerialRead('USED'), null, 'condition command word');
  assert.equal(normalizeSerialRead('   '), null, 'blank');
  assert.equal(normalizeSerialRead(''), null);
});

test('the identity key is upper(trim(...)) — the column rule, not the classifier', async () => {
  // `classifyInput`'s own normalization strips non-alphanumerics on a long read,
  // which would compare a dash-bearing serial against a stored one that keeps
  // its dash and call every single one brand new.
  assert.equal(normalizeSerialRead('  abc-1234  '), 'ABC-1234');
  assert.equal(normalizeSerialRead('bose-awrcc1-0099'), 'BOSE-AWRCC1-0099');
});

test('repeated reads collapse — a consensus pass is not three units', async () => {
  const { deps, calls } = fakes();
  const out = await resolveSerialReads(
    { orgId: ORG, receivingLineId: 5, reads: ['ABC123', 'abc123', ' ABC123 '] },
    deps,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].serial, 'ABC123');
  assert.deepEqual(calls[0].normalized, ['ABC123']);
});

test('a serial already on THIS line is flagged as such, not as a conflict', async () => {
  const { deps } = fakes([{ normalized: 'ABC123', receivingLineId: 5 }]);
  const [candidate] = await resolveSerialReads(
    { orgId: ORG, receivingLineId: 5, reads: ['ABC123'] },
    deps,
  );
  assert.equal(candidate.alreadyOnLine, true);
  assert.equal(candidate.alreadyOnAnotherLine, false);
  assert.equal(candidate.otherReceivingLineId, null);
});

test('a serial on ANOTHER line names that line', async () => {
  const { deps } = fakes([{ normalized: 'ABC123', receivingLineId: 99 }]);
  const [candidate] = await resolveSerialReads(
    { orgId: ORG, receivingLineId: 5, reads: ['ABC123'] },
    deps,
  );
  assert.equal(candidate.alreadyOnLine, false);
  assert.equal(candidate.alreadyOnAnotherLine, true);
  assert.equal(candidate.otherReceivingLineId, 99);
});

test('a known serial attached to no line is neither duplicate flag', async () => {
  const { deps } = fakes([{ normalized: 'ABC123', receivingLineId: null }]);
  const [candidate] = await resolveSerialReads(
    { orgId: ORG, receivingLineId: 5, reads: ['ABC123'] },
    deps,
  );
  assert.equal(candidate.alreadyOnLine, false);
  assert.equal(candidate.alreadyOnAnotherLine, false);
});

test('an all-junk read set never touches the database', async () => {
  const { deps, calls } = fakes();
  const out = await resolveSerialReads(
    { orgId: ORG, receivingLineId: 5, reads: ['1Z999AA10123456784', 'SKU:X'] },
    deps,
  );
  assert.deepEqual(out, []);
  assert.equal(calls.length, 0);
});
