# QC service-hub agent

A small Node service (no dependencies) for the QC bench's USB service hub.
It detects devices plugged into the hub, reads what they expose without
vendor tools, maps each one to a `serial_units` row by serial, and posts the
readings to `POST /api/qc/readings` (contract: `src/lib/qc/contracts.ts`).
Linux only for now.

## What it reads

| Source | Needs | Readings (`kind`) |
|---|---|---|
| USB identity (always) | sysfs; `udevadm` for hwdb names | `USB.DEVICE` — vendor/product ids, names, USB serial, speed, port |
| Battery | a `power_supply` node under the device; `upower` (optional) fills gaps | `BATTERY.LEVEL_PCT`, `.STATUS`, `.HEALTH`, `.HEALTH_PCT`, `.CYCLES`, `.VOLTAGE_V` |
| Storage (USB drives, enclosures) | a block device under the device; `smartctl` for SMART | `STORAGE.DEVICE`, `.MODEL`, `.SIZE_GB`; with smartctl `STORAGE.SMART_PASSED`, `.TEMP_C`, `.POWER_ON_HOURS`, `.REALLOCATED_SECTORS`, `.PENDING_SECTORS`, `.NVME_USED_PCT`, `.NVME_MEDIA_ERRORS` |
| Android | `adb`, USB debugging authorized | `ANDROID.MODEL`, `.MANUFACTURER`, `.OS_VERSION`, `.BUILD`, `.SECURITY_PATCH`, `BATTERY.*` from `dumpsys battery` |
| iOS | `ideviceinfo` (libimobiledevice), device trusted | `IOS.PRODUCT_TYPE`, `.MODEL_NUMBER`, `.OS_VERSION`, `.IMEI`, `.ACTIVATION_STATE`, `BATTERY.LEVEL_PCT`, `.STATUS` |

Every tool is detected at runtime; a missing one skips its probe and, where it
matters, says so in the device's `notes`. Each reading's `value` is
`{ label, value, unit?, num?, passed?, probe, … }`. `passed` is set only when
the fact is itself a verdict (SMART overall, a named battery health state) — the
hub never invents thresholds.

## Mapping to a unit

Serials are tried in order against `GET /api/serial-units/lookup`: the ones the
device reports about itself (iOS `SerialNumber`, Android `ro.serialno`, drive
serial from SMART, battery serial), then the USB serial. The first hit wins. No
hit → the device is logged as `unmatched` and nothing is posted.

When the device's serial is not what the warehouse recorded, pin it to the unit
you scanned: `--port 1-11.3 --unit 2203`.

Readings attach to an open QC session on that unit: the one started with this
hub's `hubDeviceId`, else the signed-in staff member's own open session.

## Configuration

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--base-url` | `QC_HUB_BASE_URL` | `http://localhost:3050` | App origin |
| `--sid` | `QC_HUB_SID` | — | Staff session id (the `cf_sid` cookie). Required unless `--dry-run`. The staff member needs `tech.qc_pass`. |
| `--hub` | `QC_HUB_PORT` | every port | sysfs port of the service hub, e.g. `1-11`. Only devices downstream of it count. |
| `--hub-id` | `QC_HUB_ID` | `<hostname>:<hub>` | Stable id sent as `hubDeviceId` |
| `--port` | | | Only this device port (e.g. `1-11.3`) |
| `--unit` | | | Pin the `--port` device to this serial_unit id |
| `--dry-run` | | off | Print the exact payload instead of posting. With `--sid` it still looks the serial up. |
| `--once` | | off | Scan what is plugged in now and exit (default: then keep watching) |
| `--settle-ms` | | `2500` | Wait after a device arrives before probing (phones and drives need a moment) |

Find the hub's port: `lsusb -t`, or
`for d in /sys/bus/usb/devices/*; do [ -f $d/idVendor ] && echo "$(basename $d) $(cat $d/product 2>/dev/null)"; done`
— the hub shows as e.g. `1-11 USB2.0 Hub`, its devices as `1-11.3`, `1-11.4`.

Get a session id: sign in to the app in a browser on the bench, then copy the
`cf_sid` cookie (DevTools → Application → Cookies). Use a staff account meant
for the bench; signing that session out (or revoking it) cuts the hub off.

## Run

```bash
# See what it would post, without posting
node tools/qc-hub-agent/qc-hub-agent.mjs --dry-run --once --hub 1-11

# Live: scan, then watch the hub for plug-ins
QC_HUB_SID=… node tools/qc-hub-agent/qc-hub-agent.mjs --hub 1-11 --hub-id bench-3

# Pin one device to the unit on the bench
node tools/qc-hub-agent/qc-hub-agent.mjs --once --hub 1-11 --port 1-11.3 --unit 2203 --sid …
```

Output is one JSON line per event: `start`, `dry-run` / `posted` /
`unmatched` / `post-failed` per device, `removed`, `watching`.

Hot-plug uses `udevadm monitor`; without `udevadm` the agent polls sysfs every
3 s. Readings are idempotent per scan (`clientEventId` = hash of hub id, port,
USB serial, scan time and kind), so a retried post is a no-op replay.

### Tool access

- `smartctl` needs to open the raw disk: run the agent as a user in the `disk`
  group, or give `smartctl` a sudoers rule. Otherwise SMART is skipped with a note.
- Android: enable USB debugging and accept the host key prompt; until then the
  note reads `unauthorized`.
- iOS: unlock the device and tap Trust, then replug.

### As a service

```ini
# ~/.config/systemd/user/qc-hub-agent.service
[Unit]
Description=QC service-hub agent

[Service]
WorkingDirectory=%h/Projects/cycleforge-lanes/prod
Environment=QC_HUB_PORT=1-11 QC_HUB_ID=bench-3
EnvironmentFile=%h/.config/qc-hub-agent.env
ExecStart=/usr/bin/node tools/qc-hub-agent/qc-hub-agent.mjs
Restart=on-failure

[Install]
WantedBy=default.target
```

`~/.config/qc-hub-agent.env` holds `QC_HUB_SID=…` (and `QC_HUB_BASE_URL=` for
a non-local app).

## Tests

```bash
node --test tools/qc-hub-agent/probes.test.mjs
```
