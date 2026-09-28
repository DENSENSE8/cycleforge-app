import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrinterProfile } from '@/lib/print/browserPrint';
import type { DesktopPrintHost } from '@/lib/print/desktop-print-host';
import { resolvePrintRoute } from './print-route';

const profile = (id: string, over: Partial<PrinterProfile>): PrinterProfile => ({
  id,
  name: id,
  role: 'label',
  kind: 'usb',
  language: 'tspl',
  paperSizeId: '4x6',
  copies: 1,
  ...over,
});
const host: DesktopPrintHost = { kind: 'electron', printHtml: async () => ({ success: true, reason: null }) };
const label = (over: Partial<Parameters<typeof resolvePrintRoute>[0]>) =>
  resolvePrintRoute({ stock: 'label', silent: true, profiles: [], routedProfileId: null, host: null, ...over });

test('a silent 4×6 thermal printer beats the desktop shell; serial reports as serial', () => {
  const usb = label({ profiles: [profile('Rollo', {})], host });
  assert.equal(usb.channel, 'THERMAL_USB');
  assert.equal(usb.printerName, 'Rollo');
  assert.equal(label({ profiles: [profile('Zebra', { kind: 'serial' })] }).channel, 'THERMAL_SERIAL');
});

test('a thermal printer on 2×1 stock is never handed a shipping label', () => {
  const route = label({ profiles: [profile('Product labels', { paperSizeId: '2x1' })], routedProfileId: 'Product labels' });
  assert.equal(route.channel, 'BROWSER_DIALOG');
});

test('the routed label profile wins among several 4×6 printers', () => {
  assert.equal(label({ profiles: [profile('Bench A', {}), profile('Pack 2', {})], routedProfileId: 'Pack 2' }).printerName, 'Pack 2');
});

test('without a thermal printer the shell prints silently to the label OS printer, else its default', () => {
  const named = label({ profiles: [profile('ZD421', { kind: 'os' })], host });
  assert.equal(named.channel, 'DESKTOP_HOST');
  assert.equal(named.printerName, 'ZD421');
  assert.equal(label({ host }).printerName, null);
});

test('silent printing off always opens the print dialog, even with a thermal printer and a shell', () => {
  assert.equal(label({ silent: false, profiles: [profile('Rollo', {})], routedProfileId: 'Rollo', host }).channel, 'BROWSER_DIALOG');
});

test('paperwork never goes raw to a thermal head; it takes the paper OS printer on letter', () => {
  const profiles = [profile('Rollo', {}), profile('Office laser', { role: 'paper', kind: 'os', paperSizeId: 'letter' })];
  const withShell = resolvePrintRoute({ stock: 'paper', silent: true, profiles, routedProfileId: null, host });
  assert.equal(withShell.channel, 'DESKTOP_HOST');
  assert.equal(withShell.printerName, 'Office laser');
  assert.equal(withShell.paper.id, 'letter');
  assert.equal(resolvePrintRoute({ stock: 'paper', silent: true, profiles, routedProfileId: null, host: null }).channel, 'BROWSER_DIALOG');
});
