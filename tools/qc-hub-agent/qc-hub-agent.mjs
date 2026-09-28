#!/usr/bin/env node
/**
 * QC service-hub agent — see README.md.
 *
 * Detects devices on the service hub, reads what they expose without vendor
 * tools, maps each to a serial_unit by serial and posts the readings to
 * POST /api/qc/readings. `--dry-run` prints the payload instead of posting.
 */

import { createHash } from 'node:crypto';
import os from 'node:os';
import { parseArgs } from 'node:util';

import { createApi } from './api.mjs';
import { PROBES } from './probes.mjs';
import { listUsbDevices, readUsbDevice, watchUsb } from './usb.mjs';

const { values: opts } = parseArgs({
  options: {
    'base-url': { type: 'string', default: process.env.QC_HUB_BASE_URL ?? 'http://localhost:3050' },
    sid: { type: 'string', default: process.env.QC_HUB_SID },
    hub: { type: 'string', default: process.env.QC_HUB_PORT },
    'hub-id': { type: 'string', default: process.env.QC_HUB_ID },
    port: { type: 'string' },
    unit: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    once: { type: 'boolean', default: false },
    'settle-ms': { type: 'string', default: '2500' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opts.help) {
  console.log(`qc-hub-agent [--dry-run] [--once] [--hub 1-11] [--hub-id bench-3] [--sid <cf_sid>]
             [--base-url http://localhost:3050] [--port 1-11.3 --unit <serialUnitId>]
See tools/qc-hub-agent/README.md.`);
  process.exit(0);
}

const dryRun = opts['dry-run'];
const hub = opts.hub || null;
const hubId = opts['hub-id'] || `${os.hostname()}:${hub ?? 'all'}`;
const forcedUnit = opts.unit ? Number(opts.unit) : null;
if (forcedUnit != null && !(Number.isInteger(forcedUnit) && forcedUnit > 0)) fail('--unit must be a serial_unit id');
if (forcedUnit != null && !opts.port) fail('--unit needs --port: it pins ONE device to the unit you scanned');
if (!dryRun && !opts.sid) fail('--sid (or QC_HUB_SID) is required to post; use --dry-run to only print readings');

const api = opts.sid ? createApi({ baseUrl: opts['base-url'], sid: opts.sid }) : null;

function fail(message) {
  console.error(`qc-hub-agent: ${message}`);
  process.exit(2);
}

function log(event, fields) {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }, null, dryRun ? 2 : 0));
}

async function probeDevice(device) {
  const serials = [];
  const readings = [];
  const notes = [];
  for (const probe of PROBES) {
    const result = await probe(device).catch((err) => ({ source: probe.name, serials: [], readings: [], note: String(err) }));
    if (!result) continue;
    serials.push(...result.serials);
    readings.push(...result.readings.map((r) => ({ ...r, probe: result.source })));
    if (result.note) notes.push(`${result.source}: ${result.note}`);
  }
  if (device.usbSerial) serials.push(device.usbSerial);
  return { serials: [...new Set(serials.filter(Boolean))], readings, notes };
}

/** One USB identity reading + every probe reading, in the `POST /api/qc/readings` shape. */
function toPayload(device, readings, { unitId, sessionId, scanAt }) {
  const identity = {
    key: 'usb.device',
    label: 'USB device',
    value: [device.vendorName ?? device.manufacturer, device.modelName ?? device.product].filter(Boolean).join(' '),
    probe: 'usb',
    vendorId: device.vendorId,
    productId: device.productId,
    manufacturer: device.manufacturer,
    product: device.product,
    usbSerial: device.usbSerial,
    speedMbps: device.speedMbps,
    port: device.port,
  };
  return [identity, ...readings].map(({ key, ...value }) => ({
    clientEventId: createHash('sha256')
      .update([hubId, device.port, device.usbSerial ?? '', scanAt, key].join('|'))
      .digest('hex')
      .slice(0, 40),
    serialUnitId: unitId,
    qcSessionId: sessionId,
    source: 'HUB',
    kind: key.toUpperCase(),
    value,
    readAt: scanAt,
    hubDeviceId: hubId,
  }));
}

async function handleDevice(device) {
  const scanAt = new Date().toISOString();
  const { serials, readings, notes } = await probeDevice(device);
  let unit = null;
  if (forcedUnit != null && device.port === opts.port) unit = { unitId: forcedUnit, serial: null, sku: null, forced: true };
  else if (api && serials.length > 0) unit = await api.lookupUnit(serials).catch((err) => (notes.push(String(err.message)), null));
  const sessionId = unit && api ? await api.openSessionId(unit.unitId, hubId) : null;
  const payload = toPayload(device, readings, { unitId: unit?.unitId ?? null, sessionId, scanAt });
  const summary = {
    port: device.port,
    usb: `${device.vendorId}:${device.productId}`,
    name: [device.vendorName ?? device.manufacturer, device.modelName ?? device.product].filter(Boolean).join(' '),
    serials,
    unit,
    notes,
  };

  if (dryRun) {
    log('dry-run', { ...summary, readings: payload });
    return;
  }
  if (!unit) {
    log('unmatched', { ...summary, readings: payload.length });
    return;
  }
  try {
    const result = await api.postReadings(payload);
    log('posted', { ...summary, created: result.created, replayed: result.replayed, readingIds: result.readings.map((r) => r.id) });
  } catch (err) {
    log('post-failed', { ...summary, error: String(err.message) });
  }
}

const initial = (await listUsbDevices(hub)).filter((d) => !opts.port || d.port === opts.port);
if (opts.port && initial.length === 0) fail(`no device at port ${opts.port}${hub ? ` on hub ${hub}` : ''}`);
log('start', { hubId, hub: hub ?? 'all ports', dryRun, devices: initial.map((d) => d.port) });
for (const device of initial) await handleDevice(device);

if (!opts.once) {
  const settleMs = Number(opts['settle-ms']) || 2500;
  const pending = new Map();
  const stop = await watchUsb(hub, ({ action, port }) => {
    if (opts.port && port !== opts.port) return;
    clearTimeout(pending.get(port));
    if (action === 'remove') {
      pending.delete(port);
      log('removed', { port });
      return;
    }
    // Phones and drives need a moment after enumeration before adb / smartctl answer.
    pending.set(
      port,
      setTimeout(async () => {
        pending.delete(port);
        const device = await readUsbDevice(port).catch(() => null);
        if (device) await handleDevice(device);
      }, settleMs),
    );
  });
  log('watching', { hub: hub ?? 'all ports' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => (stop(), process.exit(0)));
}
