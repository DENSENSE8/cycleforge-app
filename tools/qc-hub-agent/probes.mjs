/**
 * Readers for what a plugged-in device exposes without vendor tools. Each probe
 * is optional: it runs only when its tool (or sysfs node) exists and returns
 * `{ source, serials, readings, note? }` or null when it has nothing to say.
 *
 * A reading: `{ key, label, value, unit?, num? }` — `key` is dotted and stable
 * (`battery.level_pct`), `num` is the numeric value when there is one.
 */

import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { hasTool, run } from './exec.mjs';

const APPLE_VENDOR = '05ac';

/**
 * `passed` only where the fact itself is a verdict (SMART overall, a battery
 * health state) — the hub never invents thresholds.
 */
function reading(key, label, value, unit, passed) {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return {
    key,
    label,
    value: String(value),
    ...(unit ? { unit } : {}),
    ...(Number.isFinite(num) && String(value).trim() !== '' ? { num } : {}),
    ...(typeof passed === 'boolean' ? { passed } : {}),
  };
}

/** A battery health word (sysfs / Android) as a reading: GOOD passes, a named fault fails. */
function healthReading(health) {
  const h = String(health ?? '').toUpperCase().replace(/[\s-]+/g, '_');
  return reading('battery.health', 'Battery health', health, undefined, !h || h === 'UNKNOWN' ? undefined : h === 'GOOD');
}

/** Entries of a sysfs listing (`/sys/class/power_supply`, `/sys/block`) that live under the USB device. */
async function sysfsUnder(root, syspath) {
  let names;
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const target = await realpath(path.join(root, name)).catch(() => null);
    if (target?.startsWith(`${syspath}/`)) out.push({ name, dir: target });
  }
  return out;
}

async function attr(dir, name) {
  try {
    return (await readFile(path.join(dir, name), 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

// ── Battery: sysfs power_supply under the device, enriched by `upower -d` ──

/** `upower -d` → { [native-path]: { key: value } } for each device block. */
export function parseUpowerDump(text) {
  const byNativePath = {};
  for (const block of text.split(/\n(?=Device: )/)) {
    const fields = {};
    for (const line of block.split('\n')) {
      const m = /^\s{2,}([a-z][a-z0-9 -]*?):\s+(.+)$/.exec(line);
      if (m) fields[m[1].trim()] = m[2].trim();
    }
    if (fields['native-path']) byNativePath[fields['native-path']] = fields;
  }
  return byNativePath;
}

export async function probeBattery(device) {
  const supplies = await sysfsUnder('/sys/class/power_supply', device.syspath);
  if (supplies.length === 0) return null;
  const upower = (await hasTool('upower')) ? parseUpowerDump((await run('upower', ['-d'])) ?? '') : {};
  const readings = [];
  const serials = [];
  for (const { name, dir } of supplies) {
    const up = upower[name] ?? {};
    const serial = await attr(dir, 'serial_number');
    if (serial) serials.push(serial);
    const microVolts = Number(await attr(dir, 'voltage_now'));
    const fullDesign = Number(await attr(dir, 'energy_full_design')) || Number(await attr(dir, 'charge_full_design'));
    const full = Number(await attr(dir, 'energy_full')) || Number(await attr(dir, 'charge_full'));
    readings.push(
      reading('battery.level_pct', 'Battery level', (await attr(dir, 'capacity')) ?? up.percentage?.replace('%', ''), '%'),
      reading('battery.status', 'Battery status', (await attr(dir, 'status')) ?? up.state),
      healthReading(await attr(dir, 'health')),
      reading(
        'battery.health_pct',
        'Battery capacity vs design',
        fullDesign > 0 && full > 0 ? Math.round((full / fullDesign) * 100) : up.capacity?.replace('%', ''),
        '%',
      ),
      reading('battery.cycles', 'Charge cycles', (await attr(dir, 'cycle_count')) ?? up['charge-cycles']),
      reading('battery.voltage_v', 'Battery voltage', microVolts > 0 ? +(microVolts / 1e6).toFixed(3) : null, 'V'),
    );
  }
  return { source: 'sysfs-power_supply', serials, readings: readings.filter(Boolean) };
}

// ── Storage: block devices under the USB device; SMART via `smartctl -j` ──

export function smartReadings(json) {
  const table = json.ata_smart_attributes?.table ?? [];
  const ata = (id) => table.find((a) => a.id === id)?.raw?.value ?? null;
  const nvme = json.nvme_smart_health_information_log ?? {};
  return [
    reading(
      'storage.smart_passed',
      'SMART overall',
      json.smart_status ? (json.smart_status.passed ? 'PASSED' : 'FAILED') : null,
      undefined,
      json.smart_status?.passed,
    ),
    reading('storage.temp_c', 'Drive temperature', json.temperature?.current, '°C'),
    reading('storage.power_on_hours', 'Power-on hours', json.power_on_time?.hours, 'h'),
    reading('storage.reallocated_sectors', 'Reallocated sectors', ata(5)),
    reading('storage.pending_sectors', 'Pending sectors', ata(197)),
    reading('storage.nvme_used_pct', 'NVMe wear used', nvme.percentage_used, '%'),
    reading('storage.nvme_media_errors', 'NVMe media errors', nvme.media_errors),
  ].filter(Boolean);
}

export async function probeStorage(device) {
  // /sys/block lists whole disks only — partitions never appear here.
  const disks = await sysfsUnder('/sys/block', device.syspath);
  if (disks.length === 0) return null;
  const smartctl = await hasTool('smartctl');
  const readings = [];
  const serials = [];
  const notes = [];
  for (const { name, dir } of disks) {
    const sectors = Number(await attr(dir, 'size'));
    readings.push(
      reading('storage.device', 'Block device', `/dev/${name}`),
      reading('storage.model', 'Drive model', await attr(path.join(dir, 'device'), 'model')),
      reading('storage.size_gb', 'Capacity', sectors > 0 ? +((sectors * 512) / 1e9).toFixed(1) : null, 'GB'),
    );
    if (!smartctl) {
      notes.push('smartctl not installed — SMART health skipped');
      continue;
    }
    // smartctl's exit status is a bitmask; bits ≥ 2 still come with JSON.
    const out = await run('smartctl', ['-j', '-a', `/dev/${name}`], { acceptExit: (code) => code >= 2 });
    const json = out ? JSON.parse(out) : null;
    if (!json || json.smartctl?.exit_status & 2) {
      notes.push(`smartctl could not open /dev/${name} (run the agent with disk access, e.g. in the disk group or via sudo)`);
      continue;
    }
    if (json.serial_number) serials.push(json.serial_number);
    readings.push(...smartReadings(json));
  }
  return { source: 'storage', serials, readings: readings.filter(Boolean), ...(notes.length ? { note: notes.join('; ') } : {}) };
}

// ── Android over adb ──

/** `[ro.product.model]: [Pixel 7]` lines → { 'ro.product.model': 'Pixel 7' }. */
export function parseGetprop(text) {
  const props = {};
  for (const m of text.matchAll(/^\[([^\]]+)\]:\s*\[([^\]]*)\]\s*$/gm)) props[m[1]] = m[2];
  return props;
}

/** `dumpsys battery` → { level: '87', health: '2', temperature: '251', … }. */
export function parseDumpsysBattery(text) {
  const out = {};
  for (const m of text.matchAll(/^\s+([A-Za-z ]+):\s*(.+)$/gm)) out[m[1].trim().toLowerCase()] = m[2].trim();
  return out;
}

const ANDROID_HEALTH = { 1: 'UNKNOWN', 2: 'GOOD', 3: 'OVERHEAT', 4: 'DEAD', 5: 'OVER_VOLTAGE', 6: 'FAILURE', 7: 'COLD' };

export async function probeAndroid(device) {
  if (!device.usbSerial || !(await hasTool('adb'))) return null;
  const list = (await run('adb', ['devices'])) ?? '';
  const row = list.split('\n').find((l) => l.startsWith(`${device.usbSerial}\t`));
  if (!row) return null;
  if (!row.endsWith('\tdevice')) {
    return { source: 'adb', serials: [], readings: [], note: `adb sees the device as "${row.split('\t')[1]}" — accept the USB debugging prompt` };
  }
  const shell = (cmd) => run('adb', ['-s', device.usbSerial, 'shell', cmd]);
  const props = parseGetprop((await shell('getprop')) ?? '');
  const battery = parseDumpsysBattery((await shell('dumpsys battery')) ?? '');
  const serial = props['ro.serialno'] || props['ro.boot.serialno'] || device.usbSerial;
  const tenthsC = Number(battery.temperature);
  const milliVolts = Number(battery.voltage);
  return {
    source: 'adb',
    serials: [serial],
    readings: [
      reading('android.manufacturer', 'Manufacturer', props['ro.product.manufacturer']),
      reading('android.model', 'Model', props['ro.product.model']),
      reading('android.os_version', 'Android version', props['ro.build.version.release']),
      reading('android.build', 'Build', props['ro.build.display.id']),
      reading('android.security_patch', 'Security patch', props['ro.build.version.security_patch']),
      reading('battery.level_pct', 'Battery level', battery.level, '%'),
      healthReading(ANDROID_HEALTH[battery.health] ?? battery.health),
      reading('battery.temp_c', 'Battery temperature', Number.isFinite(tenthsC) ? tenthsC / 10 : null, '°C'),
      reading('battery.voltage_v', 'Battery voltage', milliVolts > 0 ? milliVolts / 1000 : null, 'V'),
      reading('battery.cycles', 'Charge cycles', battery['cycle count']),
    ].filter(Boolean),
  };
}

// ── iOS over libimobiledevice ──

/** `Key: value` lines from `ideviceinfo`. */
export function parseIdeviceinfo(text) {
  const out = {};
  for (const m of text.matchAll(/^([A-Za-z0-9]+):\s*(.*)$/gm)) out[m[1]] = m[2].trim();
  return out;
}

/** USB serial → UDID: newer devices report 24 hex chars; UDID adds a dash after 8. */
function udidCandidates(usbSerial) {
  return usbSerial.length === 24 ? [`${usbSerial.slice(0, 8)}-${usbSerial.slice(8)}`, usbSerial] : [usbSerial];
}

export async function probeIos(device) {
  if (device.vendorId !== APPLE_VENDOR || !device.usbSerial || !(await hasTool('ideviceinfo'))) return null;
  for (const udid of udidCandidates(device.usbSerial)) {
    const info = await run('ideviceinfo', ['-u', udid]);
    if (!info) continue;
    const props = parseIdeviceinfo(info);
    const battery = parseIdeviceinfo((await run('ideviceinfo', ['-u', udid, '-q', 'com.apple.mobile.battery'])) ?? '');
    return {
      source: 'ideviceinfo',
      serials: [props.SerialNumber].filter(Boolean),
      readings: [
        reading('ios.product_type', 'Product type', props.ProductType),
        reading('ios.model_number', 'Model number', props.ModelNumber),
        reading('ios.os_version', 'iOS version', props.ProductVersion),
        reading('ios.imei', 'IMEI', props.InternationalMobileEquipmentIdentity),
        reading('ios.activation_state', 'Activation state', props.ActivationState),
        reading('battery.level_pct', 'Battery level', battery.BatteryCurrentCapacity, '%'),
        reading('battery.status', 'Battery status', battery.BatteryIsCharging === 'true' ? 'Charging' : battery.BatteryIsCharging ? 'Discharging' : null),
      ].filter(Boolean),
    };
  }
  return { source: 'ideviceinfo', serials: [], readings: [], note: 'iOS device not paired — unlock it and tap Trust, then replug' };
}

export const PROBES = [probeBattery, probeStorage, probeAndroid, probeIos];
