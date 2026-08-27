import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  ENTITY_KINDS,
  ENTITY_WORD,
  entityLetter,
  entityPickerLabel,
  isEntityKind,
} from './kind';

describe('entity kind SoT', () => {
  it('derives the selector letter from the word', () => {
    assert.equal(entityLetter('order'), 'o');
    assert.equal(entityLetter('tracking'), 't');
    assert.equal(entityLetter('serial'), 's');
    assert.equal(entityLetter('phone'), 'p');
  });

  it('picker labels are Letter · Word', () => {
    assert.equal(entityPickerLabel('order'), 'O · Orders');
    assert.equal(entityPickerLabel('tracking'), 'T · Tracking');
    assert.equal(entityPickerLabel('serial'), 'S · Serials');
    assert.equal(entityPickerLabel('phone'), 'P · Phone');
  });

  it('every kind has a word and a letter', () => {
    for (const kind of ENTITY_KINDS) {
      assert.ok(ENTITY_WORD[kind].length > 0);
      assert.equal(entityLetter(kind), ENTITY_WORD[kind][0].toLowerCase());
      assert.equal(isEntityKind(kind), true);
    }
    assert.equal(isEntityKind('sku'), false);
    assert.equal(isEntityKind('all'), false);
  });
});
