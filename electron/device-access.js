/**
 * N7 — WebUSB / Web Serial / WebHID device access (the thermal print path).
 *
 * `setPermissionRequestHandler` answers "may this origin use USB at all?". It
 * does NOT pick a device. Chromium delegates that to the embedder, and an
 * Electron session with no `select-usb-device` listener cancels every request:
 * `navigator.usb.requestDevice()` rejects with `NotFoundError: No device
 * selected.` before the operator sees anything. Measured on Electron 41.10.4 /
 * Chrome 146 with eight USB devices attached and the `usb` permission allowed —
 * the permission handler is necessary and on its own useless. So pairing a
 * thermal printer from the desktop shell failed outright, and
 * `printProductLabel` fell through to the hidden-iframe `window.print()`
 * dialog: the exact non-silent path the WebUSB work exists to avoid.
 *
 * THE GRANT DOES NOT PERSIST BY ITSELF. Chromium's per-origin device grants are
 * a browser-profile feature Electron does not implement; the granted set lives
 * in the session and dies with the process. Verified by pairing a device, then
 * relaunching with the same `userData` directory and an emptied grant record —
 * `navigator.usb.getDevices()` returned 0. With the record intact it returned 1.
 * `setDevicePermissionHandler` is therefore the whole persistence mechanism, and
 * the file this module writes is its backing store.
 *
 * KEYED BY ORIGIN, because `src/lib/print/browserPrint.ts` keeps printer
 * profiles in `localStorage` — which is per-origin too. The renderer half
 * remembers "profile `label` is vid:pid"; this half remembers "that origin may
 * reopen vid:pid". Key them differently and they drift: a profile saved against
 * the deployed origin would silently re-attach while pointed at a dev server,
 * or a profile would survive with no grant behind it and every print would fail
 * at `getDevices()` with nothing in the UI to explain why.
 */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const STORE_VERSION = 1;
const STORE_FILE = 'paired-devices.json';

const log = () => global.__cfDesktopLog ?? console;

// ---------------------------------------------------------------------------
// Persisted grants
// ---------------------------------------------------------------------------
let storeCache = null;

function storePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
}

function readStore() {
  if (storeCache) return storeCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    if (parsed && parsed.version === STORE_VERSION && parsed.grants && typeof parsed.grants === 'object') {
      storeCache = parsed;
      return storeCache;
    }
  } catch {
    // First run, or a file we cannot parse. Re-seeding costs the operator one
    // re-pair; refusing to start costs them the shell.
  }
  storeCache = { version: STORE_VERSION, grants: {} };
  return storeCache;
}

function writeStore(store) {
  storeCache = store;
  try {
    fs.mkdirSync(path.dirname(storePath()), { recursive: true });
    fs.writeFileSync(storePath(), JSON.stringify(store, null, 2));
  } catch (err) {
    // A printer that has to be re-paired next launch beats a crash on pair.
    log().warn?.('[devices] could not persist grants:', err?.message || err);
  }
}

function originOf(url) {
  try {
    const { origin } = new URL(url);
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}

/** SerialPort reports ids as decimal STRINGS; USBDevice/HIDDevice as numbers. */
function toNum(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * A key that means the same thing at pair time and at re-attach time.
 *
 * `deviceId` / `portId` are per-session handles — Electron regenerates them
 * every launch, so a grant keyed on one matches nothing on the next start.
 * Vendor/product/serial is what survives, and it is also what the renderer's
 * profile stores, so both halves match the same physical printer.
 */
function identity(deviceType, device) {
  if (!device) return null;
  const vid = toNum(device.vendorId);
  const pid = toNum(device.productId);
  const serial = device.serialNumber ? String(device.serialNumber) : '';
  if (vid != null && pid != null) return `${deviceType}:${vid}:${pid}:${serial}`;
  // A built-in COM port or a Bluetooth SPP port exposes no USB ids at all.
  // `deviceInstanceId` is Windows' stable handle; elsewhere the port name is.
  if (deviceType === 'serial') {
    const stable = device.deviceInstanceId || device.portName;
    return stable ? `serial:port:${stable}` : null;
  }
  return null;
}

function grantsFor(origin) {
  return readStore().grants[origin] ?? [];
}

function recordGrant(origin, deviceType, device, label) {
  const id = identity(deviceType, device);
  if (!origin || !id) return;
  const store = readStore();
  const list = store.grants[origin] ?? [];
  if (list.some((g) => g.id === id)) return;
  list.push({
    id,
    deviceType,
    label: label || '',
    vendorId: toNum(device.vendorId),
    productId: toNum(device.productId),
    serialNumber: device.serialNumber ?? null,
    portName: device.portName ?? null,
  });
  store.grants[origin] = list;
  writeStore(store);
  log().info?.(`[devices] granted ${deviceType} ${label || id} to ${origin}`);
}

/**
 * Drop a grant. A profile deleted in Settings must not leave the origin holding
 * open USB access to that printer — the renderer calls this through the bridge.
 */
function forgetGrant(origin, match) {
  const store = readStore();
  const list = store.grants[origin];
  if (!list || list.length === 0) return 0;
  const vid = toNum(match?.vendorId);
  const pid = toNum(match?.productId);
  if (vid == null || pid == null) return 0;
  const serial = match?.serialNumber ? String(match.serialNumber) : null;
  const kept = list.filter((g) => {
    if (g.vendorId !== vid || g.productId !== pid) return true;
    // A profile that pinned a serial only revokes that unit; one that did not
    // revokes every unit of that model, which is what "forget this printer"
    // means when the operator never distinguished them.
    if (serial && g.serialNumber && String(g.serialNumber) !== serial) return true;
    return false;
  });
  const removed = list.length - kept.length;
  if (removed > 0) {
    if (kept.length > 0) store.grants[origin] = kept;
    else delete store.grants[origin];
    writeStore(store);
    log().info?.(`[devices] revoked ${removed} grant(s) for ${origin}`);
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Chooser
// ---------------------------------------------------------------------------
/**
 * Electron ships no picker UI — the embedder renders one or auto-selects. Auto-
 * selecting is not an option here: an empty-filter request lists every attached
 * device (on the test bench: a DAC, a microphone, a keyboard receiver, an RGB
 * controller), so "first in the list" pairs the wrong hardware and the failure
 * surfaces later as a print that goes nowhere. The operator picks, exactly as
 * they would in a browser.
 */
let pickerWindow = null;

function labelFor(deviceType, device) {
  if (deviceType === 'serial') {
    return device.displayName || device.portName || 'Serial port';
  }
  return (
    device.name ||
    device.productName ||
    [device.manufacturerName, device.serialNumber].filter(Boolean).join(' ') ||
    'Unnamed device'
  );
}

function hex(value) {
  const n = toNum(value);
  return n == null ? null : `0x${n.toString(16).padStart(4, '0')}`;
}

function rowFor(deviceType, device) {
  const vid = hex(device.vendorId);
  const pid = hex(device.productId);
  const ids = vid && pid ? `${vid}:${pid}` : device.portName || '';
  return {
    id: deviceType === 'serial' ? device.portId : device.deviceId,
    label: labelFor(deviceType, device),
    detail: [ids, device.serialNumber].filter(Boolean).join(' · '),
    known: grantsFor(device.__origin ?? '').some((g) => g.id === identity(deviceType, device)),
  };
}

function openPicker({ parent, deviceType, getItems }) {
  if (pickerWindow) {
    // Two overlapping requests would leave one callback stranded forever.
    return Promise.resolve(null);
  }

  const win = new BrowserWindow({
    width: 460,
    height: 440,
    parent: parent ?? undefined,
    modal: !!parent,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Select a device',
    backgroundColor: '#0b1220',
    webPreferences: {
      preload: path.join(__dirname, 'device-picker-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  pickerWindow = win;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (!win.isDestroyed()) win.close();
    };

    win.webContents.ipc.on('cf:device-picker-choose', (_event, id) => {
      finish(typeof id === 'string' && id ? id : null);
    });
    win.webContents.ipc.on('cf:device-picker-cancel', () => finish(null));
    win.on('closed', () => {
      pickerWindow = null;
      // A window dismissed with the OS control is a cancel, not a hang.
      if (!settled) {
        settled = true;
        resolve(null);
      }
    });

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('cf:device-picker-list', { deviceType, items: getItems() });
      win.show();
    });

    win.loadFile(path.join(__dirname, 'device-picker.html')).catch((err) => {
      log().error?.('[devices] picker failed to load:', err?.message || err);
      finish(null);
    });
  });
}

/** Push a refreshed list into an open picker (hot-plug while choosing). */
function refreshPicker(deviceType, getItems) {
  if (!pickerWindow || pickerWindow.isDestroyed()) return;
  pickerWindow.webContents.send('cf:device-picker-list', { deviceType, items: getItems() });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
/**
 * @param {import('electron').Session} session
 * @param {() => import('electron').BrowserWindow | null} getParentWindow
 */
function registerDeviceAccess(session, getParentWindow) {
  // -- USB ------------------------------------------------------------------
  session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    const origin = originOf(details.frame?.url ?? '');
    let list = details.deviceList.slice();

    const onAdded = (_e, device) => {
      list = list.concat(device);
      refreshPicker('usb', () => list.map((d) => rowFor('usb', { ...d, __origin: origin })));
    };
    const onRemoved = (_e, device) => {
      list = list.filter((d) => d.deviceId !== device.deviceId);
      refreshPicker('usb', () => list.map((d) => rowFor('usb', { ...d, __origin: origin })));
    };
    session.on('usb-device-added', onAdded);
    session.on('usb-device-removed', onRemoved);

    openPicker({
      parent: getParentWindow(),
      deviceType: 'usb',
      getItems: () => list.map((d) => rowFor('usb', { ...d, __origin: origin })),
    })
      .then((deviceId) => {
        const picked = list.find((d) => d.deviceId === deviceId);
        if (picked) recordGrant(origin, 'usb', picked, labelFor('usb', picked));
        // `callback()` with nothing is the cancel the renderer sees as
        // NotFoundError — the same rejection a browser gives.
        callback(picked ? picked.deviceId : undefined);
      })
      .finally(() => {
        session.removeListener('usb-device-added', onAdded);
        session.removeListener('usb-device-removed', onRemoved);
      });
  });

  // -- Serial ---------------------------------------------------------------
  session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    const origin = originOf(webContents?.getURL?.() ?? '');
    let list = portList.slice();

    const onAdded = (_e, port) => {
      list = list.concat(port);
      refreshPicker('serial', () => list.map((p) => rowFor('serial', { ...p, __origin: origin })));
    };
    const onRemoved = (_e, port) => {
      list = list.filter((p) => p.portId !== port.portId);
      refreshPicker('serial', () => list.map((p) => rowFor('serial', { ...p, __origin: origin })));
    };
    session.on('serial-port-added', onAdded);
    session.on('serial-port-removed', onRemoved);

    openPicker({
      parent: getParentWindow(),
      deviceType: 'serial',
      getItems: () => list.map((p) => rowFor('serial', { ...p, __origin: origin })),
    })
      .then((portId) => {
        const picked = list.find((p) => p.portId === portId);
        if (picked) recordGrant(origin, 'serial', picked, labelFor('serial', picked));
        // Web Serial's cancel is the empty string, not undefined.
        callback(picked ? picked.portId : '');
      })
      .finally(() => {
        session.removeListener('serial-port-added', onAdded);
        session.removeListener('serial-port-removed', onRemoved);
      });
  });

  // -- HID ------------------------------------------------------------------
  session.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const origin = originOf(details.frame?.url ?? '');
    let list = details.deviceList.slice();

    const onAdded = (_e, device) => {
      list = list.concat(device);
      refreshPicker('hid', () => list.map((d) => rowFor('hid', { ...d, __origin: origin })));
    };
    const onRemoved = (_e, device) => {
      list = list.filter((d) => d.deviceId !== device.deviceId);
      refreshPicker('hid', () => list.map((d) => rowFor('hid', { ...d, __origin: origin })));
    };
    session.on('hid-device-added', onAdded);
    session.on('hid-device-removed', onRemoved);

    openPicker({
      parent: getParentWindow(),
      deviceType: 'hid',
      getItems: () => list.map((d) => rowFor('hid', { ...d, __origin: origin })),
    })
      .then((deviceId) => {
        const picked = list.find((d) => d.deviceId === deviceId);
        if (picked) recordGrant(origin, 'hid', picked, labelFor('hid', picked));
        callback(picked ? picked.deviceId : undefined);
      })
      .finally(() => {
        session.removeListener('hid-device-added', onAdded);
        session.removeListener('hid-device-removed', onRemoved);
      });
  });

  // -- Re-attach ------------------------------------------------------------
  // The only reason a pairing outlives the process. Consulted by getDevices()
  // and getPorts() for every candidate device, so it must stay cheap and must
  // never grant something this origin did not pair.
  session.setDevicePermissionHandler((details) => {
    const id = identity(details.deviceType, details.device);
    if (!id) return false;
    return grantsFor(details.origin).some((g) => g.id === id);
  });

  log().info?.(`[devices] chooser + persistence registered (store: ${storePath()})`);
}

/** IPC: let the renderer revoke a grant when its profile is deleted. */
function registerDeviceHandlers(ipcMain, getAppWebContents) {
  ipcMain.handle('cf:forget-paired-device', async (event, payload) => {
    const wc = getAppWebContents?.() ?? event.sender;
    const origin = originOf(wc?.getURL?.() ?? '');
    if (!origin) return { ok: false, error: 'no origin' };
    const removed = forgetGrant(origin, payload ?? {});
    return { ok: true, removed };
  });
}

module.exports = {
  registerDeviceAccess,
  registerDeviceHandlers,
  // exported for the shell selftest
  __internal: { identity, toNum, originOf, forgetGrant, recordGrant, grantsFor, storePath },
};
