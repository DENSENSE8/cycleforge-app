import test from 'node:test';
import assert from 'node:assert/strict';
import {
  labelCornerTicketDigits,
  receivingLabelPlatformDisplay,
  receivingLabelPoCornerDisplay,
  receivingPayloadToFace,
  resolveReceivingQrValue,
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

test('receivingLabelPlatformDisplay uses type alone when it already names the platform', () => {
  assert.equal(
    receivingLabelPlatformDisplay({
      platform: 'ECWID',
      receivingType: 'CUSTOM',
      receivingTypeLabel: 'ECWID-RS',
    }),
    'ECWID-RS',
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

test('receivingPayloadToFace keeps R- HRI when matrix encodes platform URL', () => {
  const prevApp = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.cycleforge.ai';
  try {
    const face = receivingPayloadToFace({
      receivingId: 12,
      orgSlug: 'usav',
      scanValue: 'RCV-12',
      platform: 'eBay',
      notes: '',
      conditionCode: 'BRAND_NEW',
      date: '8/1/26',
    });
    assert.equal(resolveReceivingQrValue({
      receivingId: 12,
      orgSlug: 'usav',
      scanValue: 'RCV-12',
      platform: 'eBay',
      notes: '',
      conditionCode: 'BRAND_NEW',
      date: '8/1/26',
    }), 'https://usav.app.cycleforge.ai/m/r/12');
    assert.equal(face.hri, 'R-12');
    assert.equal(face.matrix.value, 'https://usav.app.cycleforge.ai/m/r/12');
  } finally {
    if (prevApp === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevApp;
  }
});
