import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasNgrams,
  brandSlug,
  brandTokens,
  compatTargetStart,
  longestAliasAt,
  normalizeBrandName,
  normalizeManufacturerField,
  stripLeadingStopWords,
} from './normalize';

test('normalizeBrandName folds case, diacritics, punctuation and whitespace to one key', () => {
  assert.equal(normalizeBrandName('  BOSE®  '), 'bose');
  assert.equal(normalizeBrandName('Bose, Inc.'), 'bose inc');
  assert.equal(normalizeBrandName('Harman/Kardon'), 'harman kardon');
  assert.equal(normalizeBrandName('Harman   Kardon'), normalizeBrandName('harman kardon'));
  assert.equal(normalizeBrandName('Motörhead Élan'), 'motorhead elan');
  assert.equal(normalizeBrandName("McIntosh's"), 'mcintoshs');
  assert.equal(normalizeBrandName('***'), '');
});

test('model-prefix punctuation survives inside a token but not at its edge', () => {
  assert.equal(normalizeBrandName('Bose PS3-2-1 II'), 'bose ps3-2-1 ii');
  assert.equal(normalizeBrandName('B&O -Play- +'), 'b&o play');
  assert.equal(normalizeBrandName('Bang & Olufsen'), normalizeBrandName('bang and olufsen'));
});

test('brandSlug is URL-safe and spells symbols out', () => {
  assert.equal(brandSlug('Bang & Olufsen'), 'bang-and-olufsen');
  assert.equal(brandSlug('B&O'), 'b-and-o');
  assert.equal(brandSlug('3-2-1'), '3-2-1');
  assert.equal(brandSlug('Polk  Audio'), 'polk-audio');
});

test('leading listing noise is stripped repeatedly, only from the front', () => {
  assert.deepEqual(stripLeadingStopWords(brandTokens('New Genuine OEM Bose Wave remote')), ['bose', 'wave', 'remote']);
  assert.deepEqual(stripLeadingStopWords(brandTokens('The Beatles Rock Band')), ['beatles', 'rock', 'band']);
  assert.deepEqual(stripLeadingStopWords(brandTokens('Lot of 3 Bose 161 speakers')), ['bose', '161', 'speakers']);
  assert.deepEqual(stripLeadingStopWords(brandTokens('Brand New 2x JBL Flip')), ['jbl', 'flip']);
  // A stop word after the brand is content, not noise.
  assert.deepEqual(stripLeadingStopWords(brandTokens('Bose new old stock')), ['bose', 'new', 'old', 'stock']);
});

test('a Zoho manufacturer field loses its legal-entity tail but never becomes empty', () => {
  assert.equal(normalizeManufacturerField('Bose Corporation'), 'bose');
  assert.equal(normalizeManufacturerField('Sony Corp. Inc.'), 'sony');
  assert.equal(normalizeManufacturerField('Company'), 'company');
  assert.equal(normalizeManufacturerField(null), '');
});

test('compatibility markers point past "for / fits / compatible with"', () => {
  const t = brandTokens('Replacement CD drive for Bose Wave');
  assert.equal(t[compatTargetStart(t)], 'bose');
  const c = brandTokens('Remote compatible with Sony Bravia');
  assert.equal(c[compatTargetStart(c)], 'sony');
  assert.equal(compatTargetStart(brandTokens('Bose Wave radio')), -1);
});

test('longest alias wins at a position; shorter aliases are the fallback', () => {
  const aliases: Record<string, string> = { bose: 'Bose', 'bose wave': 'Wave', 'guitar hero': 'Guitar Hero' };
  const lookup = (g: string) => aliases[g];
  assert.deepEqual(longestAliasAt(['bose', 'wave', 'radio'], 0, lookup), { ngram: 'bose wave', length: 2, entry: 'Wave' });
  assert.deepEqual(longestAliasAt(['bose', 'solo'], 0, lookup), { ngram: 'bose', length: 1, entry: 'Bose' });
  // "guitar" alone is not Guitar Hero (Guitar Strap exists).
  assert.equal(longestAliasAt(['guitar', 'strap'], 0, lookup), null);
});

test('aliasNgrams covers every 1..4-gram once', () => {
  const grams = aliasNgrams(['the', 'beatles', 'rock', 'band', 'drums']);
  assert.ok(grams.includes('the beatles rock band'));
  assert.ok(grams.includes('rock band'));
  assert.ok(!grams.includes('the beatles rock band drums'));
  assert.equal(new Set(grams).size, grams.length);
});
