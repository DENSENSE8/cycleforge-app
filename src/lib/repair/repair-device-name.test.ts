/**
 *   tsx --test src/lib/repair/repair-device-name.test.ts
 *
 * DB-free. Every title below is a real `repair_service.product_title` from the
 * book; each case is a place a naive prefix strip or a plain cut goes wrong.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repairDeviceName } from './repair-device-name';

describe('the device a repair listing is about', () => {
  it('cuts the phrase wherever the listing put it', () => {
    assert.equal(
      repairDeviceName('REPAIR SERVICE for Bose Wave Radio CD Awrc-1G Awrc-1P'),
      'Bose Wave Radio CD Awrc-1G Awrc-1P',
    );
    assert.equal(
      repairDeviceName('Bose Wave® music system REPAIR SERVICE for Model AWRCC1 AWRCC2'),
      'Bose Wave® music system Model AWRCC1 AWRCC2',
    );
    assert.equal(
      repairDeviceName('Bose 321 Series III Media Center  Repair Service'),
      'Bose 321 Series III Media Center',
    );
  });

  it('never prints the brand twice across the seam', () => {
    assert.equal(
      repairDeviceName('Bose Repair Service For  Bose SoundTouch 300 Soundbar'),
      'Bose SoundTouch 300 Soundbar',
    );
  });

  it('leaves a title with no listing boilerplate alone', () => {
    assert.equal(repairDeviceName('Wave Music System - Series II + CD Changer'), 'Wave Music System - Series II + CD Changer');
    assert.equal(repairDeviceName(null), '');
  });

  it('keeps the title when the phrase is all there is', () => {
    assert.equal(repairDeviceName('Repair Service'), 'Repair Service');
  });
});
