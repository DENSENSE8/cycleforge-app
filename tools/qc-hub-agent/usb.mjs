/**
 * USB enumeration + hot-plug for the QC service hub (Linux).
 *
 * Enumeration reads sysfs (/sys/bus/usb/devices) — always present, no tools.
 * Names come from udev's hwdb (the same names `lsusb` prints) when `udevadm`
 * exists. Hot-plug listens to `udevadm monitor`; without it the agent polls.
 */

import { spawn } from 'node:child_process';
import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { hasTool, run } from './exec.mjs';

const SYS_USB = '/sys/bus/usb/devices';
const HUB_CLASS = '09';

async function readAttr(dir, name) {
  try {
    return (await readFile(path.join(dir, name), 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

/** `KEY=value` lines from `udevadm info -q property`. */
export function parseUdevProperties(text) {
  const props = {};
  for (const line of text.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return props;
}

/**
 * One device (not an interface, not a hub) by its sysfs port name, e.g. `1-11.3`.
 * Returns null when the port is empty, is an interface, or is a hub.
 */
export async function readUsbDevice(port) {
  if (port.includes(':') || port.startsWith('usb')) return null;
  const dir = path.join(SYS_USB, port);
  const vendorId = await readAttr(dir, 'idVendor');
  if (!vendorId) return null;
  const deviceClass = await readAttr(dir, 'bDeviceClass');
  if (deviceClass === HUB_CLASS) return null;

  const syspath = await realpath(dir);
  const device = {
    port,
    syspath,
    vendorId,
    productId: await readAttr(dir, 'idProduct'),
    manufacturer: await readAttr(dir, 'manufacturer'),
    product: await readAttr(dir, 'product'),
    usbSerial: await readAttr(dir, 'serial'),
    speedMbps: Number(await readAttr(dir, 'speed')) || null,
    busnum: Number(await readAttr(dir, 'busnum')) || null,
    devnum: Number(await readAttr(dir, 'devnum')) || null,
    vendorName: null,
    modelName: null,
  };
  if (await hasTool('udevadm')) {
    const out = await run('udevadm', ['info', '-q', 'property', '-p', syspath]);
    if (out) {
      const props = parseUdevProperties(out);
      device.vendorName = props.ID_VENDOR_FROM_DATABASE ?? null;
      device.modelName = props.ID_MODEL_FROM_DATABASE ?? null;
    }
  }
  return device;
}

/** Ports downstream of `hub` (e.g. `1-11` → `1-11.3`, `1-11.4.1`); every port when hub is null. */
export function portIsOnHub(port, hub) {
  return hub == null || port.startsWith(`${hub}.`);
}

export async function listUsbDevices(hub) {
  const ports = (await readdir(SYS_USB)).filter((p) => portIsOnHub(p, hub)).sort();
  const devices = [];
  for (const port of ports) {
    const device = await readUsbDevice(port);
    if (device) devices.push(device);
  }
  return devices;
}

/**
 * `UDEV  [123.456] add      /devices/pci0000:00/0000:00:14.0/usb1/1-11/1-11.3 (usb)`
 * → { action: 'add', port: '1-11.3' }. Interface events (`1-11.3:1.0`) → null.
 */
export function parseMonitorLine(line) {
  const m = /^UDEV\s+\[[\d.]+\]\s+(add|remove|bind|unbind|change)\s+(\S+)\s+\(usb\)/.exec(line.trim());
  if (!m) return null;
  const port = path.basename(m[2]);
  if (port.includes(':') || port.startsWith('usb')) return null;
  return { action: m[1], port };
}

/**
 * Calls `onChange({ action: 'add' | 'remove', port })` for devices arriving on /
 * leaving the hub. udevadm monitor when available, else a sysfs poll.
 * Returns a stop function.
 */
export async function watchUsb(hub, onChange, { pollMs = 3000 } = {}) {
  if (await hasTool('udevadm')) {
    const child = spawn('udevadm', ['monitor', '--udev', '--subsystem-match=usb'], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const event = parseMonitorLine(line);
        if (!event || !portIsOnHub(event.port, hub)) continue;
        if (event.action === 'add' || event.action === 'remove') onChange(event);
      }
    });
    return () => child.kill();
  }

  let known = new Set((await listUsbDevices(hub)).map((d) => d.port));
  const timer = setInterval(async () => {
    const now = new Set((await listUsbDevices(hub)).map((d) => d.port));
    for (const port of now) if (!known.has(port)) onChange({ action: 'add', port });
    for (const port of known) if (!now.has(port)) onChange({ action: 'remove', port });
    known = now;
  }, pollMs);
  return () => clearInterval(timer);
}
