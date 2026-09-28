import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';

import { parseDumpsysBattery, parseGetprop, parseIdeviceinfo, parseUpowerDump, smartReadings } from './probes.mjs';
import { parseMonitorLine, portIsOnHub } from './usb.mjs';

test('udevadm monitor lines → device add/remove on a port; interfaces and root hubs ignored', () => {
  deepStrictEqual(
    parseMonitorLine('UDEV  [8123.456789] add      /devices/pci0000:00/0000:00:14.0/usb1/1-11/1-11.3 (usb)'),
    { action: 'add', port: '1-11.3' },
  );
  deepStrictEqual(parseMonitorLine('UDEV  [8123.5] add      /devices/pci0000:00/0000:00:14.0/usb1/1-11/1-11.3/1-11.3:1.0 (usb)'), null);
  deepStrictEqual(parseMonitorLine('UDEV  [1.0] add      /devices/pci0000:00/0000:00:14.0/usb1 (usb)'), null);
  deepStrictEqual(parseMonitorLine('KERNEL[1.0] add      /devices/pci0000:00/0000:00:14.0/usb1/1-11 (usb)'), null);
});

test('hub filter keeps only downstream ports', () => {
  deepStrictEqual(['1-11', '1-11.3', '1-11.4.2', '1-110', '1-1'].filter((p) => portIsOnHub(p, '1-11')), ['1-11.3', '1-11.4.2']);
});

test('upower -d blocks keyed by native-path', () => {
  const dump = [
    'Device: /org/freedesktop/UPower/devices/battery_hidpp_battery_0',
    '  native-path:          hidpp_battery_0',
    '  serial:               4a2b-11-22',
    '  power supply:         no',
    '  battery',
    '    state:               discharging',
    '    percentage:          55%',
    '    capacity:            91.2%',
    '',
    'Device: /org/freedesktop/UPower/devices/DisplayDevice',
    '  power supply:         no',
  ].join('\n');
  deepStrictEqual(parseUpowerDump(dump), {
    hidpp_battery_0: {
      'native-path': 'hidpp_battery_0',
      serial: '4a2b-11-22',
      'power supply': 'no',
      state: 'discharging',
      percentage: '55%',
      capacity: '91.2%',
    },
  });
});

test('adb getprop and dumpsys battery', () => {
  deepStrictEqual(parseGetprop('[ro.product.model]: [Pixel 7]\n[ro.serialno]: [2B111FDH]\n[empty]: []\n'), {
    'ro.product.model': 'Pixel 7',
    'ro.serialno': '2B111FDH',
    empty: '',
  });
  const battery = 'Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  level: 87\n  health: 2\n  temperature: 251\n  Cycle count: 412\n';
  deepStrictEqual(parseDumpsysBattery(battery), {
    'ac powered': 'false',
    'usb powered': 'true',
    level: '87',
    health: '2',
    temperature: '251',
    'cycle count': '412',
  });
});

test('ideviceinfo key: value lines', () => {
  deepStrictEqual(parseIdeviceinfo('SerialNumber: F2LXK0ABCD\nProductVersion: 17.5.1\nBatteryCurrentCapacity: 100\n'), {
    SerialNumber: 'F2LXK0ABCD',
    ProductVersion: '17.5.1',
    BatteryCurrentCapacity: '100',
  });
});

test('smartctl -j → SMART verdict carries pass/fail; wear counters are plain numbers', () => {
  const readings = smartReadings({
    smart_status: { passed: false },
    temperature: { current: 41 },
    power_on_time: { hours: 20931 },
    ata_smart_attributes: { table: [{ id: 5, raw: { value: 24 } }, { id: 197, raw: { value: 0 } }] },
  });
  deepStrictEqual(
    readings.map((r) => [r.key, r.value, r.passed]),
    [
      ['storage.smart_passed', 'FAILED', false],
      ['storage.temp_c', '41', undefined],
      ['storage.power_on_hours', '20931', undefined],
      ['storage.reallocated_sectors', '24', undefined],
      ['storage.pending_sectors', '0', undefined],
    ],
  );
});
