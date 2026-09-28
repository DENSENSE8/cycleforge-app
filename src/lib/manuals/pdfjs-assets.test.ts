import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * `public/pdfjs/` serves pdf.js's worker and standard fonts from this origin
 * (`pdfThumbnail.ts`). pdf.js refuses a worker from another version, and stale
 * fonts bring back the mis-set label glyphs — so both copies must equal the
 * installed `pdfjs-dist`.
 */
const root = process.cwd();
const installed = join(root, 'node_modules/pdfjs-dist');
const served = join(root, 'public/pdfjs');

test('the served pdf.js worker is the installed one', () => {
  assert.ok(
    readFileSync(join(served, 'pdf.worker.min.mjs')).equals(readFileSync(join(installed, 'build/pdf.worker.min.mjs'))),
    'public/pdfjs/pdf.worker.min.mjs is stale — recopy it from node_modules/pdfjs-dist/build/',
  );
});

test('the served standard fonts are the installed ones', () => {
  const fonts = readdirSync(join(installed, 'standard_fonts')).sort();
  assert.deepEqual(readdirSync(join(served, 'standard_fonts')).sort(), fonts);
  for (const font of fonts) {
    assert.ok(
      readFileSync(join(served, 'standard_fonts', font)).equals(readFileSync(join(installed, 'standard_fonts', font))),
      `public/pdfjs/standard_fonts/${font} is stale — recopy from node_modules/pdfjs-dist/standard_fonts/`,
    );
  }
});
