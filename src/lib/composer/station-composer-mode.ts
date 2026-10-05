/**
 * Scan-station composer modes — Unbox (notes / Print·Receive) and Ticket, plus
 * Ask: the operations assistant, honored ONLY by a mouth that names it
 * (`modes={['ask']}` on `/ai-chat`). Ask is never a URL / session latch and
 * never a Shift+Tab destination, so no station grows a second chat door.
 * SHIFT+TAB, AND WHY IT WAS NOT (operator ruling 2026-08-31). This chord used
 */

export const STATION_COMPOSER_MODES = ['unbox', 'ticket', 'ask'] as const;

export type StationComposerMode = (typeof STATION_COMPOSER_MODES)[number];

/** Default modes a station mouth honors. Header tasks select between them. */
export const STATION_COMPOSER_FACES = ['unbox', 'ticket'] as const satisfies readonly StationComposerMode[];

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
    {
      id: 'ask',
      label: 'Ask',
      destination: 'the operations assistant',
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


export function stationComposerModeKeepsTrailingAction(
  mode: StationComposerMode,
): boolean {
  return mode === 'unbox' || mode === 'ask';
}

export function stationComposerModePlaceholder(
  mode: StationComposerMode,
  opts: { ticketLabel?: string | null; hasTicket?: boolean } = {},
): string {
  if (mode === 'ask') return 'Ask about your operation…';
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

/**
 * Words on the composer's commit CTA in Ticket mode. A comment on a live ticket
 * says what reaches whom: a public commit reaches the customer ("Send public
 * reply"), an internal one stays with staff ("Add internal note"). Never
 * "Update ticket" — that hid a customer-visible send behind a neutral verb.
 */
export function stationComposerTicketCommitLabel(hasTicket: boolean, isPublic: boolean): string {
  if (!hasTicket) return 'File ticket →';
  return isPublic ? 'Send public reply' : 'Add internal note';
}


export function stationComposerModeAriaLabel(
  mode: StationComposerMode,
  opts: { ticketLabel?: string | null; hasTicket?: boolean } = {},
): string {
  if (mode === 'ask') return 'Ask the operations assistant';
  if (mode === 'ticket') {
    if (opts.hasTicket) {
      const face = (opts.ticketLabel || '').trim() || 'ticket';
      return `Ticket reply for ${face}`;
    }
    return 'Ticket create draft';
  }
  return 'Unbox item note';
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
