/** Phone QR companion must authorize the desk from the phone session. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'page.tsx'), 'utf8');

test('qr-auth page: Authorize desktop login CTA, no Face ID ceremony', () => {
  assert.match(src, /Authorize desktop login/);
  assert.doesNotMatch(src, /Authorize with Face ID/);
  assert.doesNotMatch(src, /startAuthentication/);
  assert.doesNotMatch(src, /needs_passkey/);
  assert.match(src, /JSON\.stringify\(\{ token \}\)/);
});
