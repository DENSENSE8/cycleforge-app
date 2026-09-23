import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/documents/[id]/content/route.ts'),
  'utf8',
);

test('stored document content is streamed through the authenticated app origin', () => {
  assert.match(routeSource, /adapter\.getObjectBytes\(/);
  assert.match(routeSource, /'content-length': String\(bytes\.byteLength\)/);
  assert.match(routeSource, /contentDisposition\(filename, download\)/);
  assert.doesNotMatch(routeSource, /adapter\.getSignedReadUrl\(/);
});

