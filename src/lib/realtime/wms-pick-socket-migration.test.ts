import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pickerHook = readFileSync(
  path.resolve(process.cwd(), 'src/app/m/(shell)/pick/[orderId]/_picker/useMobilePicker.ts'),
  'utf8',
);

test('mobile pick physical mutations use the WMS command socket', () => {
  assert.match(pickerHook, /name:\s*'pick\.confirm'/);
  assert.match(pickerHook, /name:\s*'pick\.short'/);
  assert.match(pickerHook, /executeWmsCommand/);
  assert.doesNotMatch(pickerHook, /fetch\(`?\/api\/picking\/session\/\$\{sessionId\}\/(?:confirm-pick|short-pick|complete)/);
});

