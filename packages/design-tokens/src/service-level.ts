import type { OperationalStateSpec } from './state';

/**
 * Shipping service level — the speed the BUYER paid for, one word, code and
 * colour on every platform (owner 2026-09-29: "if a shipping label is imported
 * as next day air or expedited, it is automatically urgent"). `urgent` is the
 * import rule: an order first classified at an urgent level is marked urgent;
 * `rank` orders the levels so a split order takes its fastest service.
 * Keys are also the stored value (`orders.service_level`).
 */
export const SERVICE_LEVEL = {
  nextDay: { tone: 'danger', code: 'NXD', label: 'Next day', icon: 'zap', urgent: true, rank: 4 },
  secondDay: { tone: 'warning', code: '2DA', label: '2-day', icon: 'zap', urgent: true, rank: 3 },
  expedited: { tone: 'warning', code: 'EXP', label: 'Expedited', icon: 'zap', urgent: true, rank: 2 },
  standard: { tone: 'neutral', code: 'STD', label: 'Standard', icon: 'truck', urgent: false, rank: 1 },
  economy: { tone: 'neutral', code: 'ECO', label: 'Economy', icon: 'truck', urgent: false, rank: 0 },
  pickup: { tone: 'neutral', code: 'PKU', label: 'Pickup', icon: 'store', urgent: false, rank: 0 },
} as const satisfies Record<string, OperationalStateSpec & { urgent: boolean; rank: number }>;

export type ServiceLevel = keyof typeof SERVICE_LEVEL;

export const SERVICE_LEVELS = Object.keys(SERVICE_LEVEL) as ServiceLevel[];
