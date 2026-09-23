import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./FbaCreatePlanModal.tsx', import.meta.url), 'utf8');

test('FBA plan modal close control is a sized flush icon button', () => {
  assert.match(source, /<IconButton[\s\S]*size="md"[\s\S]*radius="flush"/);
  assert.doesNotMatch(source, /rounded-full/);
});
