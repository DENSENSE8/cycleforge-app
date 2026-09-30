import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { serviceDowngrade, serviceLevelOf } from './service-level';

describe('serviceLevelOf — the spellings ShipStation actually sends (prod refs 2026-09-29)', () => {
  const requested: Array<[string, string | null]> = [
    ['NextDay', 'nextDay'],
    ['SecondDay', 'secondDay'],
    ['Expedited', 'expedited'],
    ['Standard', 'standard'],
    ['USPSPriority', 'standard'],
    ['USPS Priority Mail®', 'standard'],
    ['USPSPriorityMailPaddedFlatRateEnvelope', 'standard'],
    ['UPS Ground', 'standard'],
    ['Standard Std US D2D Dom', 'standard'],
    ['FreeEconomy Econ US Dom', 'economy'],
    ['Free Shipping', 'economy'],
    ['Value', 'economy'],
    ['In-store Pickup', 'pickup'],
    ['', null],
  ];
  for (const [raw, level] of requested) {
    it(`requested "${raw}" → ${level}`, () => assert.equal(serviceLevelOf({ requested: raw }), level));
  }

  const codes: Array<[string, string]> = [
    ['fedex_2day_one_rate', 'secondDay'],
    ['ups_2nd_day_air', 'secondDay'],
    ['ups_next_day_air_saver', 'nextDay'],
    ['fedex_priority_overnight', 'nextDay'],
    ['usps_priority_mail_express', 'nextDay'],
    ['usps_priority_mail', 'standard'],
    ['usps_ground_advantage', 'standard'],
    ['usps_media_mail', 'economy'],
  ];
  for (const [code, level] of codes) {
    it(`service code ${code} → ${level}`, () => assert.equal(serviceLevelOf({ serviceCode: code }), level));
  }

  it('takes the faster of what was requested and the service set on the order', () => {
    assert.equal(serviceLevelOf({ requested: 'Standard', serviceCode: 'fedex_2day_one_rate' }), 'secondDay');
    assert.equal(serviceLevelOf({ requested: 'NextDay', serviceCode: 'usps_ground_advantage' }), 'nextDay');
  });
});

describe('serviceDowngrade — a paid-for fast level on a ground label', () => {
  it('flags a 2-day order labelled Ground Advantage', () => {
    assert.deepEqual(serviceDowngrade('secondDay', 'usps_ground_advantage'), { label: '2-day → Ground' });
  });
  it('accepts Priority Mail and air services for an urgent level', () => {
    assert.equal(serviceDowngrade('secondDay', 'usps_priority_mail'), null);
    assert.equal(serviceDowngrade('nextDay', 'ups_next_day_air'), null);
  });
  it('never flags a standard order, or one with no label yet', () => {
    assert.equal(serviceDowngrade('standard', 'usps_ground_advantage'), null);
    assert.equal(serviceDowngrade('nextDay', null), null);
  });
});
