import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fontFamilies } from './families';

test('the interface has one readable sans family and no condensed fork', () => {
  assert.deepEqual(Object.keys(fontFamilies), ['sans', 'mono']);

  const sources = [
    new URL('../../../lib/fonts.ts', import.meta.url),
    new URL('../../../app/layout.tsx', import.meta.url),
    new URL('../../../styles/globals.css', import.meta.url),
    new URL('../../../../tailwind.config.mjs', import.meta.url),
  ].map((url) => readFileSync(url, 'utf8')).join('\n');

  assert.doesNotMatch(sources, /IBM_Plex_Sans_Condensed|font-condensed|ds-font-condensed|ibm-plex-condensed/);
  assert.match(sources, /\.text-role-eyebrow.+var\(--ds-font-sans\)/);
  assert.match(sources, /\.text-role-micro.+var\(--ds-font-sans\)/);
});
