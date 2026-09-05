import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('home tasks collection routes declare operations.plans gates in source', () => {
  const tasks = readFileSync(path.join(ROOT, 'src/app/api/ops-plans/tasks/route.ts'), 'utf8');
  assert.match(tasks, /operations\.plans\.view/);
  assert.match(tasks, /operations\.plans\.manage/);
  const members = readFileSync(
    path.join(ROOT, 'src/app/api/ops-plans/[id]/members/route.ts'),
    'utf8',
  );
  assert.match(members, /operations\.plans\.view/);
  assert.match(members, /operations\.plans\.manage/);
});
