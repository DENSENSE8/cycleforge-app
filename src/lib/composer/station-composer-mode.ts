/**
 * Scan-station composer modes — Unbox (notes / Print·Receive) and Ticket.
 * SHIFT+TAB, AND WHY IT WAS NOT (operator ruling 2026-08-31). This chord used
 */

export const STATION_COMPOSER_MODES = ['unbox', 'ticket'] as const;

export type StationComposerMode = (typeof STATION_COMPOSER_MODES)[number];

export const STATION_COMPOSER_MODE_DEFAULT: StationComposerMode = 'unbox';

export const STATION_COMPOSER_MODE_PARAM = 'composerMode';

const STATION_COMPOSER_MODE_SESSION_KEY = 'cf.stationComposerMode';

/**
 * The toggle chord, as an operator reads it.
 * WORDS in sentence case, not `⇧⇥` (operator ruling 2026-08-31). The glyphs are
 */
export const STATION_COMPOSER_CYCLE_CHORD = 'Shift + Tab';

type StationComposerModeCatalogEntry = {
  id: StationComposerMode;
  label: string;
  /** One-line destination — I4, named in words. */
  destination: string;
};

export const STATION_COMPOSER_MODE_CATALOG: readonly StationComposerModeCatalogEntry[] =
  [
    {
      id: 'unbox',
      label: 'Unbox',
      destination: 'the item note — sticker center on print',
    },
    {
      id: 'ticket',
      label: 'Ticket',
      destination: 'a Zendesk update on the linked ticket',
    },
  ];

/** Legacy URL/session ids → live mode. */
function canonicalizeStationComposerMode(raw: string): StationComposerMode | null {
  if (raw === 'unbox' || raw === 'label' || raw === 'notes') return 'unbox';
  if (raw === 'ticket') return 'ticket';
  // Dropped modes (location) — treat as unset so default Unbox wins.
  return null;
}

function isStationComposerMode(value: string): value is StationComposerMode {
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
    // No ticket yet → this field IS the claim body, seeded from the template.
    // It used to read "Create or link a ticket above — then send from here",
    // pointing at a claim form that no longer sits above it.
    return 'Claim body — Enter to file the ticket';
  }
  return 'Note for this item — shows on the sticker center';
}

/** Words on the composer's commit CTA in Ticket mode. */
export function stationComposerTicketCommitLabel(hasTicket: boolean): string {
  return hasTicket ? 'Update ticket' : 'File ticket →';
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

type StationComposerModeKeyHit = { kind: 'cycle' };

/** Classify a station keydown. */
export function classifyStationComposerModeKey(
  e: Pick<
    KeyboardEvent,
    'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'
  >,
): StationComposerModeKeyHit | null {
  // THE toggle, and the only one. Bare Tab is deliberately not here — it is
  // the wedge scanner's terminator and ghost autocomplete's accept key.
  if (e.key === 'Tab' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    return { kind: 'cycle' };
  }
  return null;
}

/** What a click inside the ticket thread should do. */
export function resolveTicketThreadActivation(opts: {
  mode: StationComposerMode;
  hasTextSelection?: boolean;
}): { setTicketMode: boolean; focusComposer: boolean } {
  if (opts.hasTextSelection) return { setTicketMode: false, focusComposer: false };
  return { setTicketMode: opts.mode !== 'ticket', focusComposer: true };
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

/** Landing on a scan station starts on Unbox — always. */
export function stationComposerArrivalMode(): StationComposerMode {
  return STATION_COMPOSER_MODE_DEFAULT;
}
