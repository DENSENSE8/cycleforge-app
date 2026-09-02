/**
 * Scan-station composer modes — Unbox (notes / Print·Receive) and Ticket.
 * Mode faces live BELOW the rounded outline as a horizontal strip (Unbox left,
 * Ticket right) — not a dropdown. **Shift+Tab toggles, and that is the whole
 * keyboard surface.** Two modes need one key, not a cycle chord plus a jump
 * per mode; the ⌥1 / ⌥2 jumps were removed with the ruling below because a
 * second way to reach two places is chrome, not capability.
 *
 * SHIFT+TAB, AND WHY IT WAS NOT (operator ruling 2026-08-31). This chord used
 * to raise a toast refusing it, on the grounds that "Tab is a shipping-wedge
 * terminator". That was half right and cost the station its only toggle: a
 * keyboard-wedge scanner terminates a barcode with a BARE Tab (or Enter). It
 * has no shift key and cannot emit Shift+Tab, so the scanner was never in
 * competition for this chord — only bare Tab was, and bare Tab is still left
 * alone (it belongs to the wedge and to ghost autocomplete).
 *
 * Ctrl+Tab was the documented cycle before this and could never have worked:
 * Chrome reserves it for its own tab switching and never dispatches it to the
 * page, so the chord only ever fired inside the Electron wrapper.
 *
 * WHAT IT COSTS: Shift+Tab is the browser's reverse focus traversal, and this
 * surface now takes it. That is a real trade the operator made deliberately —
 * a two-mode composer wants one toggle, and forward Tab still traverses.
 */

export const STATION_COMPOSER_MODES = ['unbox', 'ticket'] as const;

export type StationComposerMode = (typeof STATION_COMPOSER_MODES)[number];

export const STATION_COMPOSER_MODE_DEFAULT: StationComposerMode = 'unbox';

export const STATION_COMPOSER_MODE_PARAM = 'composerMode';

export const STATION_COMPOSER_MODE_SESSION_KEY = 'cf.stationComposerMode';

/**
 * The toggle chord, as an operator reads it. Painted on the mode row.
 *
 * WORDS in sentence case, not `⇧⇥` (operator ruling 2026-08-31). The glyphs are
 * Mac keyboard notation on a bench that runs Windows workstations, and a
 * shift-arrow next to a tab-arrow is two symbols an operator has to decode
 * mid-carton. The `+` between the two keys is the same joiner the rest of the
 * app writes chords with.
 */
export const STATION_COMPOSER_CYCLE_CHORD = 'Shift + Tab';

export type StationComposerModeCatalogEntry = {
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
    // No ticket yet → this field IS the claim body, seeded from the template.
    // It used to read "Create or link a ticket above — then send from here",
    // pointing at a claim form that no longer sits above it.
    return 'AI draft — Enter to file the ticket';
  }
  return 'Note for this item — shows on the sticker center';
}

/**
 * Words on the composer's commit CTA in Ticket mode.
 *
 * Both faces name the outcome, not the keystroke. Unlinked → the commit FILES
 * the claim; linked → it posts to a live helpdesk thread a customer may read.
 * "Send" said neither, and a bare return arrow said less (operator rulings
 * 2026-08-30, 2026-08-31). This is the claim panel's own `File ticket →`
 * button folded into the dock rather than duplicated beside it.
 */
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

export type StationComposerModeKeyHit = { kind: 'cycle' };

/**
 * Classify a station keydown. Caller preventDefaults when a hit is returned.
 * Bare Tab is left for ghost autocomplete.
 *
 * This runs on a DOCUMENT listener, not just the composer textarea. A mode
 * chord that only fires while the field has focus is a chord an operator who
 * just scanned a box cannot use, which is most of the time they want it.
 */
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

/**
 * What a click inside the ticket thread should do.
 *
 * TWO decisions, not one — conflating them was a bug. The thread is visible in
 * both modes now, so a click has to be able to hand the composer to Ticket AND
 * put the caret in it. Those do not have the same precondition:
 *
 * - `setTicketMode` — only when not already there. Re-setting rewrites the URL
 *   for nothing, and that is a `router.replace` per click on a scrolling
 *   thread.
 * - `focusComposer` — whenever the operator touched a message, INCLUDING when
 *   the mode is already Ticket. Reading the reply is what makes someone reach
 *   for the field; "you were already in the right mode" is not a reason to
 *   leave the caret elsewhere. A single `shouldActivate` boolean returned false
 *   here and silently swallowed the focus with the redundant mode set.
 *
 * A live text SELECTION refuses both: dragging across a serial number to copy
 * it is reading, not composing, and moving the caret out from under that is how
 * a surface loses an operator's trust.
 */
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

/**
 * Landing on a scan station starts on Unbox — always.
 *
 * The mode is sticky (session + `?composerMode=`) so it survives a sibling-line
 * switch mid-carton, which is right. It is NOT right on arrival: an operator
 * who filed a claim an hour ago would walk up to the next carton and find the
 * composer pointed at Ticket, with the scan note one keystroke further away
 * than the station's whole job. Stations call this on carton open.
 */
export function stationComposerArrivalMode(): StationComposerMode {
  return STATION_COMPOSER_MODE_DEFAULT;
}
