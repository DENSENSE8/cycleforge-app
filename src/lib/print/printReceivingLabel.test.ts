import test from 'node:test';
import assert from 'node:assert/strict';
import {
  labelCornerTicketDigits,
  receivingLabelPlatformDisplay,
  receivingLabelPoCornerDisplay,
} from './printReceivingLabel';

test('labelCornerTicketDigits prefers Zendesk provider id over registry id', () => {
  assert.equal(
    labelCornerTicketDigits({
      providerTicketId: 9395,
      externalTicketId: '9395',
    }),
    '9395',
  );
});

test('receivingLabelPlatformDisplay abbreviates Amazon Return for small labels', () => {
  assert.equal(
    receivingLabelPlatformDisplay({
      platform: 'Amazon',
      receivingType: 'RETURN',
    }),
    'AMZ - Return',
  );
});

test('receivingLabelPlatformDisplay keeps full Amazon name without a type', () => {
  assert.equal(
    receivingLabelPlatformDisplay({
      platform: 'Amazon',
      receivingType: null,
    }),
    'Amazon',
  );
});

test('receivingLabelPoCornerDisplay shows provider ticket on label face', () => {
  assert.equal(
    receivingLabelPoCornerDisplay({
      scanValue: 'RCV-6936',
      platform: 'Unfound',
      notes: '',
      conditionCode: 'BRAND_NEW',
      date: '7/1/26',
      zendeskTicket: '9395',
      trackingNumber: '1ZR096K99051220071',
    }),
    '#9395',
  );
});
