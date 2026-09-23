import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(file: string): string {
  return readFileSync(path.resolve(process.cwd(), file), 'utf8');
}

test('mobile guided Pack submits its physical finish through the socket command', () => {
  const studio = source('src/components/mobile/photos/MobilePackerPhotoStudio.tsx');
  const flow = source('src/lib/packing/pack-verify-flow.ts');

  assert.match(studio, /executeWmsCommand/);
  assert.match(flow, /name:\s*'pack\.verify'/);
  assert.doesNotMatch(flow, /fetch\(['"]\/api\/packing\/verification/);
  assert.doesNotMatch(flow, /method:\s*['"]POST['"]/);
});
