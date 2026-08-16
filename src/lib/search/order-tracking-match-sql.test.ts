import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sqlOrderHasMatchingTracking,
  sqlOrderOwnsShipment,
  sqlTrackingNumberMatches,
} from './order-tracking-match-sql';

test('sqlOrderOwnsShipment: primary shipment_id OR shipment_links; never packer_logs', () => {
  const sql = sqlOrderOwnsShipment('o', 'stn.id');
  assert.match(sql, /o\.shipment_id = stn\.id/);
  assert.match(sql, /shipment_links sl_trk/);
  assert.match(sql, /sl_trk\.owner_type = 'ORDER'/);
  assert.match(sql, /sl_trk\.owner_id = o\.id/);
  assert.match(sql, /sl_trk\.shipment_id = stn\.id/);
  assert.doesNotMatch(sql, /packer_logs/);
});

test('sqlTrackingNumberMatches: raw ILIKE + canonical + key18 + last-8', () => {
  const sql = sqlTrackingNumberMatches({
    stnAlias: 'stn_trk',
    likeParam: '$2',
    canonicalParam: '$6',
    key18Param: '$7',
    last8Param: '$4',
  });
  assert.match(sql, /stn_trk\.tracking_number_raw ILIKE \$2/);
  assert.match(sql, /stn_trk\.tracking_number_normalized = \$6/);
  assert.match(sql, /RIGHT\(.*18\) = \$7/);
  assert.match(sql, /RIGHT\(.*8\) = \$4/);
});

test('sqlOrderHasMatchingTracking: EXISTS over STN via relaxed ownership', () => {
  const sql = sqlOrderHasMatchingTracking({
    orderAlias: 'o',
    likeParam: '$2',
    canonicalParam: '$6',
    key18Param: '$7',
    last8Param: '$4',
  });
  assert.match(sql, /^EXISTS \(/);
  assert.match(sql, /FROM shipping_tracking_numbers stn_trk/);
  assert.match(sql, /shipment_links/);
  assert.doesNotMatch(sql, /packer_logs/);
});
