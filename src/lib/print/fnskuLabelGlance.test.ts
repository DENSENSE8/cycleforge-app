import test from 'node:test';
import assert from 'node:assert/strict';
import { fnskuLabelGlance, fnskuPrintedCorner } from './fnskuLabelGlance';

test('a trailing color is the bottom-right mark', () => {
  assert.equal(fnskuLabelGlance('Factory-renewed Bose VCS-10 Center Channel Speaker - Black'), 'Black');
  assert.equal(fnskuLabelGlance('Bose Surround Speakers 700, White'), 'White');
  assert.equal(fnskuLabelGlance('Bose SoundLink Color Bluetooth Speaker (Mint)'), 'Mint');
});

test('a series number sits with the color, short enough to read', () => {
  assert.equal(
    fnskuLabelGlance('Bose SoundDock Series II 30-Pin iPod/iPhone Speaker Dock (Black)'),
    'II · Black',
  );
  assert.equal(fnskuLabelGlance('Bose Wave® Music System III - Platinum White'), 'III · Platinum White');
  assert.equal(fnskuLabelGlance('Bose SoundLink Color II: Aqua Blue'), 'II · Aqua Blue');
  assert.equal(fnskuLabelGlance('Bose® CineMate® Series II Digital Home Theater Speaker System'), 'Series II');
});

test('a slash-joined finish stays one mark', () => {
  assert.equal(
    fnskuLabelGlance('Bose Companion 3 Series II multimedia speaker system (Graphite/Silver)'),
    'II · Graphite/Silver',
  );
});

test('a saved mark replaces the title guess', () => {
  assert.equal(fnskuPrintedCorner('Bose Solo 15, Black', null), 'Black');
  assert.equal(fnskuPrintedCorner('Bose Solo 15, Black', '  '), 'Black');
  assert.equal(fnskuPrintedCorner('Bose Solo 15, Black', 'White'), 'White');
});

test('a product number that is not a series is left in the title', () => {
  assert.equal(fnskuLabelGlance('Bose Surround Speakers 700'), '');
  assert.equal(fnskuLabelGlance('Bose SoundDock Portable 30-Pin iPod/iPhone Speaker Dock'), '');
  assert.equal(fnskuLabelGlance(''), '');
});
