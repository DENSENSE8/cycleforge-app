import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { RecordActionVerb } from './RecordActionStrip';
import { partitionRecordActionVerbs } from './RecordActionStrip';

const verb = (id: string, tone?: RecordActionVerb['tone']): RecordActionVerb => ({
  id,
  label: id,
  tone,
});

describe('partitionRecordActionVerbs', () => {
  it('shows only the first three non-destructive actions', () => {
    const result = partitionRecordActionVerbs([
      verb('one'),
      verb('two'),
      verb('three'),
      verb('four'),
    ]);

    assert.deepEqual(result.primary.map(({ id }) => id), ['one', 'two', 'three']);
    assert.deepEqual(result.overflow.map(({ id }) => id), ['four']);
  });

  it('keeps destructive actions in overflow without consuming a visible seat', () => {
    const result = partitionRecordActionVerbs([
      verb('delete', 'danger'),
      verb('one'),
      verb('two'),
      verb('three'),
      verb('four'),
    ]);

    assert.deepEqual(result.primary.map(({ id }) => id), ['one', 'two', 'three']);
    assert.deepEqual(result.overflow.map(({ id }) => id), ['delete', 'four']);
  });
});
