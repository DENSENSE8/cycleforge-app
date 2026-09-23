import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(file: string): string {
  return readFileSync(path.resolve(process.cwd(), file), 'utf8');
}

test('Pick, Putaway, and Pack execution CTAs start from the canonical Button primitive', () => {
  for (const file of [
    'src/components/mobile/ConfirmDock.tsx',
    'src/components/mobile/pair/MobilePairQty.tsx',
    'src/components/mobile/photos/MobilePackerPhotoStudio.tsx',
  ]) {
    const text = source(file);
    assert.match(text, /import\s+\{\s*Button\s*\}\s+from\s+'@\/design-system\/primitives(?:\/Button)?'/, file);
  }
});
