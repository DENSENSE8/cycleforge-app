/** Client-safe tablet picker model — types, presence window, spoken copy, and the projection that sorts free-and-awake first. */

export const COUNTER_DEVICE_ONLINE_WINDOW_MS = 120_000;

/** One enrolled tablet, as the fleet row reads before presence is applied. */
export interface CounterDeviceRow {
  id: number;
  label: string;
  status: 'enrolled' | 'active' | 'revoked';
  lastSeenAtMs: number | null;
}

/** One tablet, as the desk picker offers it. */
export interface CounterDevice {
  id: number;
  label: string;
  /** Heard from inside the presence window. */
  online: boolean;
  lastSeenAtMs: number | null;
  /** The OTHER open visit holding this tablet, or null when it is free. */
  heldByOtherVisit: boolean;
}

/**
 * What a staffer needs to read about a tablet before they hand a customer to
 * it: is it awake, and is someone else already using it.
 */
export function deviceAvailabilityCopy(device: CounterDevice, nowMs: number): string {
  if (device.heldByOtherVisit) return 'On another visit';
  if (device.online) return 'Ready';
  if (device.lastSeenAtMs === null) return 'Never checked in';
  const minutes = Math.max(1, Math.round((nowMs - device.lastSeenAtMs) / 60_000));
  if (minutes < 60) return `Asleep · ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `Asleep · ${hours}h ago` : 'Asleep';
}

/** Fold rows + open bindings into what the picker paints. */
export function projectCounterDevices(args: {
  devices: readonly CounterDeviceRow[];
  bindings: readonly { deviceId: number; sessionId: number }[];
  nowMs: number;
  /** The visit doing the asking, so its own tablet is not reported as busy. */
  sessionId?: number | null;
}): CounterDevice[] {
  const { devices, bindings, nowMs } = args;
  const currentSessionId = args.sessionId ?? null;

  const heldBy = new Map<number, number>();
  for (const binding of bindings) heldBy.set(binding.deviceId, binding.sessionId);

  const projected = devices
    .filter((device) => device.status === 'active')
    .map<CounterDevice>((device) => {
      const holder = heldBy.get(device.id) ?? null;
      return {
        id: device.id,
        label: device.label,
        online:
          device.lastSeenAtMs !== null &&
          nowMs - device.lastSeenAtMs <= COUNTER_DEVICE_ONLINE_WINDOW_MS,
        lastSeenAtMs: device.lastSeenAtMs,
        heldByOtherVisit: holder !== null && holder !== currentSessionId,
      };
    });

  return projected.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.heldByOtherVisit !== b.heldByOtherVisit) return a.heldByOtherVisit ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}
