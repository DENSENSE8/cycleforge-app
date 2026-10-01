import { deepStrictEqual } from 'node:assert';
import { test } from 'node:test';
import { handlingUnitQcFace } from './handling-unit-presentation';

test('handling unit QC never aliases physical CLOSED to prepacked', () => {
  deepStrictEqual(handlingUnitQcFace({ totalUnits: 0, testedUnits: 0, holdUnits: 0 }).stage, 'empty');
  deepStrictEqual(handlingUnitQcFace({ totalUnits: 4, testedUnits: 0, holdUnits: 0 }).stage, 'pending');
  deepStrictEqual(handlingUnitQcFace({ totalUnits: 4, testedUnits: 2, holdUnits: 0 }).stage, 'partial');
  deepStrictEqual(handlingUnitQcFace({ totalUnits: 4, testedUnits: 4, holdUnits: 1 }).stage, 'hold');
  deepStrictEqual(handlingUnitQcFace({ totalUnits: 4, testedUnits: 4, holdUnits: 0 }), {
    stage: 'cleared', label: '4/4 QC', next: 'Prepack', tone: 'success',
  });
});
