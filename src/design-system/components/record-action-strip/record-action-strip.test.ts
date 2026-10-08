import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { RecordActionVerb } from './RecordActionStrip';
import { partitionRecordActionVerbs, partitionRecordPanelVerbs } from './RecordActionStrip';

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

describe('partitionRecordPanelVerbs', () => {
  it('leads with fill-tone verbs, keeps every other verb visible, and closes with danger verbs', () => {
    const result = partitionRecordPanelVerbs([
      verb('delete', 'danger'),
      verb('notes'),
      verb('replacement', 'primary'),
      verb('ticket', 'orange'),
      verb('tonal', 'blue'),
      verb('urgent', 'yellow'),
      verb('cancel', 'danger'),
    ]);

    assert.deepEqual(result.filled.map(({ id }) => id), ['replacement', 'ticket', 'urgent']);
    assert.deepEqual(result.rows.map(({ id }) => id), ['notes', 'tonal']);
    assert.deepEqual(result.danger.map(({ id }) => id), ['delete', 'cancel']);
  });
});
