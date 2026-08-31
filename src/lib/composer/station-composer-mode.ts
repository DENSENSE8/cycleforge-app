/**
 * Scan-station composer modes — Unbox (notes / Print·Receive) and Ticket.
 * Mode faces live BELOW the rounded outline as a horizontal strip (Unbox left,
 * Ticket right) — not a dropdown. Cycle is Ctrl+Tab. Jump is ⌥1 / ⌥2.
 * Shift+Tab is refused: Tab is a shipping-wedge terminator.
 */

export const STATION_COMPOSER_MODES = ['unbox', 'ticket'] as const;

export type StationComposerMode = (typeof STATION_COMPOSER_MODES)[number];

export const STATION_COMPOSER_MODE_DEFAULT: StationComposerMode = 'unbox';

export const STATION_COMPOSER_MODE_PARAM = 'composerMode';

export const STATION_COMPOSER_MODE_SESSION_KEY = 'cf.stationComposerMode';

export const STATION_COMPOSER_SHIFT_TAB_REFUSAL =
  'Shift+Tab cannot switch modes — Tab is a scanner terminator. Use Ctrl+Tab, or ⌥1 / ⌥2.';

export type StationComposerModeCatalogEntry = {
  id: StationComposerMode;
  label: string;
  /** One-line destination — I4, named in words. */
  destination: string;
  optionDigit: '1' | '2';
};

export const STATION_COMPOSER_MODE_CATALOG: readonly StationComposerModeCatalogEntry[] =
  [
    {
      id: 'unbox',
      label: 'Unbox',
      destination: 'the item note — sticker center on print',
      optionDigit: '1',
    },
    {
      id: 'ticket',
      label: 'Ticket',
      destination: 'a Zendesk update on the linked ticket',
      optionDigit: '2',
    },
  ];

/** Legacy URL/session ids → live mode. */
function canonicalizeStationComposerMode(raw: string): StationComposerMode | null {
  if (raw === 'unbox' || raw === 'label' || raw === 'notes') return 'unbox';
  if (raw === 'ticket') return 'ticket';
  // Dropped modes (location) — treat as unset so default Unbox wins.
  return null;
}

export function isStationComposerMode(value: string): value is StationComposerMode {
  return (STATION_COMPOSER_MODES as readonly string[]).includes(value);
}

export function parseStationComposerMode(
  raw: string | null | undefined,
): StationComposerMode | null {
  if (raw == null) return null;
  return canonicalizeStationComposerMode(raw.trim().toLowerCase());
}

export function resolveStationComposerMode(
  urlRaw: string | null | undefined,
  sessionRaw: string | null | undefined,
): StationComposerMode {
  return (
    parseStationComposerMode(urlRaw) ??
    parseStationComposerMode(sessionRaw) ??
    STATION_COMPOSER_MODE_DEFAULT
  );
}

export function cycleStationComposerMode(
  current: StationComposerMode,
): StationComposerMode {
  const i = STATION_COMPOSER_MODES.indexOf(current);
  return STATION_COMPOSER_MODES[(i + 1) % STATION_COMPOSER_MODES.length]!;
}

export function stationComposerModeKeepsTrailingAction(
  mode: StationComposerMode,
): boolean {
  return mode === 'unbox';
}

export function stationComposerModePlaceholder(
  mode: StationComposerMode,
  opts: { ticketLabel?: string | null; hasTicket?: boolean } = {},
): string {
  if (mode === 'ticket') {
    if (opts.hasTicket) {
      const face = (opts.ticketLabel || '').trim() || 'ticket';
      return `Update on ${face} — Enter to send`;
    }
    return 'Create or link a ticket above — then send from here';
  }
  return 'Note for this item — shows on the sticker center';
}

export function stationComposerModeAriaLabel(
  mode: StationComposerMode,
  opts: { ticketLabel?: string | null; hasTicket?: boolean } = {},
): string {
  if (mode === 'ticket') {
    if (opts.hasTicket) {
      const face = (opts.ticketLabel || '').trim() || 'ticket';
      return `Ticket reply for ${face}`;
    }
    return 'Ticket create draft';
  }
  return 'Unbox item note';
}

export type StationComposerModeKeyHit =
  | { kind: 'cycle' }
  | { kind: 'jump'; mode: StationComposerMode }
  | { kind: 'refuse-shift-tab' };

/**
 * Classify a composer keydown. Caller preventDefaults when a hit is returned.
 * Bare Tab is left for ghost autocomplete.
 */
export function classifyStationComposerModeKey(
  e: Pick<
    KeyboardEvent,
    'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'
  >,
): StationComposerModeKeyHit | null {
  if (e.key === 'Tab' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    return { kind: 'refuse-shift-tab' };
  }
  if (e.key === 'Tab' && e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
    return { kind: 'cycle' };
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.code === 'Digit1' || e.key === '1') {
      return { kind: 'jump', mode: 'unbox' };
    }
    if (e.code === 'Digit2' || e.key === '2') {
      return { kind: 'jump', mode: 'ticket' };
    }
  }
  return null;
}

export function readStationComposerModeSession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STATION_COMPOSER_MODE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function writeStationComposerModeSession(mode: StationComposerMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STATION_COMPOSER_MODE_SESSION_KEY, mode);
  } catch {
    // Private mode / quota — mode still works in-memory via the host.
  }
}
