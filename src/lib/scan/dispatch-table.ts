/** The scan dispatch table — scan class × object state → one Card, one title. */

import {
  routeScan,
  scannedUnitKey,
  type ScanRoute,
  type ScanType,
} from '../barcode-routing';

/** The Cards the phone can open. */
export type ScanCard = 'arrival' | 'carton' | 'qc' | 'pack' | 'preview';

/** What the scan does to the armed session. */
export type DispatchMode = 'act' | 'preview' | 'ask';

/** Everything the table knows about the object the scan names, and nothing more. */
export interface ScanObjectState {
  /** Has a carton already been opened against this tracking number? */
  trackingSeen?: boolean;
  /** Does this LPN / SSCC have an open QC check? */
  qcOpen?: boolean;
  /** Is this LPN / SSCC staged for pack-out? */
  stagedForPack?: boolean;
  /** The pending order this bin / tote is paired to, or null when unpaired. */
  binOrderId?: string | null;
}

/** The one armed scan session, or `null` when nothing is armed. */
export interface ArmedScanSession {
  expects: readonly ScanType[];
  /** The session's current title, kept as-is by any Card that returns none. */
  title?: string | null;
  /** The Card this session DOES, when it is a single-job session (the scan kernel armed with `?work=qc` arms `'qc'`). */
  work?: ScanCard;
}

/**
 * The QC session the scan kernel (`/m/scan?work=qc`) arms: QC runs on units,
 * and a line label is taken so the tech can pick one of its units.
 */
export const QC_SCAN_SESSION: ArmedScanSession = {
  expects: ['serial-unit', 'receiving-line', 'receiving'],
  work: 'qc',
  title: 'Quality control',
};

interface ScanDispatchInput {
  /** A raw scan (routed here) or an already-decoded route. */
  scan: string | ScanRoute;
  state?: ScanObjectState;
  armedSession?: ArmedScanSession | null;
}

export interface ScanDispatch {
  card: ScanCard;
  /** The session title this scan sets, or `null` to keep the existing one. */
  title: string | null;
  mode: DispatchMode;
  /** Why this row won — shown as the reason line under the primary action. */
  reason: string;
  /** Where this scan lands, in words: the Field's placeholder before acting. */
  destination: string;
  /** True only when an armed session actually takes the scan (`mode: 'act'`). */
  parks: boolean;
  /** Set only for `mode: 'ask'` — the two Cards that tied. */
  candidates?: readonly [ScanCard, ScanCard];
}

// ─── The table ──────────────────────────────────────────────────────────────

interface DispatchRow {
  id: string;
  classes: readonly ScanType[];
  when: (s: ScanObjectState) => boolean;
  card: ScanCard;
  stateful: boolean;
  reason: string;
  /** Fires only when the armed session's `work` is this Card. */
  armedFor?: ScanCard;
}

const ALWAYS = () => true;

const DISPATCH_TABLE: readonly DispatchRow[] = [
  {
    id: 'tracking-known',
    classes: ['carrier-tracking'],
    when: (s) => s.trackingSeen === true,
    card: 'carton',
    stateful: true,
    reason: 'this tracking number already has a carton',
  },
  {
    id: 'tracking-new',
    classes: ['carrier-tracking'],
    when: (s) => s.trackingSeen !== true,
    card: 'arrival',
    stateful: false,
    reason: 'this tracking number has never been seen',
  },
  {
    id: 'qc-open',
    classes: ['handling-unit', 'sscc'],
    when: (s) => s.qcOpen === true,
    card: 'qc',
    stateful: true,
    reason: 'this licence plate has an open QC check',
  },
  {
    // Session work, not object state:
    id: 'qc-unit',
    classes: ['serial-unit'],
    when: ALWAYS,
    armedFor: 'qc',
    card: 'qc',
    stateful: true,
    reason: 'this station is running QC on units',
  },
  {
    // A line label names a PO line that can hold several units; QC is per
    // unit, so inside a QC session the line opens QC to pick one of them.
    id: 'qc-line',
    classes: ['receiving-line'],
    when: ALWAYS,
    armedFor: 'qc',
    card: 'qc',
    stateful: true,
    reason: 'this station is running QC — pick a unit on this line',
  },
  {
    // A carton label is a useful QC starting point too: it opens the carton
    // hub's line picker, rather than pretending the carton itself is a unit.
    id: 'qc-carton',
    classes: ['receiving'],
    when: ALWAYS,
    armedFor: 'qc',
    card: 'qc',
    stateful: true,
    reason: 'this station is running QC — pick a line in this carton',
  },
  {
    id: 'staged-for-pack',
    classes: ['handling-unit', 'sscc'],
    when: (s) => s.stagedForPack === true,
    card: 'pack',
    stateful: true,
    reason: 'this licence plate is staged for pack',
  },
  {
    id: 'bin-paired',
    classes: ['bin', 'bin-paired-order'],
    when: (s) => Boolean(s.binOrderId),
    card: 'pack',
    stateful: true,
    reason: 'this bin is paired to a pending order',
  },
  {
    id: 'bin-unpaired',
    classes: ['bin', 'bin-paired-order'],
    when: (s) => !s.binOrderId,
    card: 'preview',
    stateful: false,
    reason: 'this bin is not paired to an order',
  },
  {
    // The catch-all: serial, SKU, kit, ticket, FNSKU, a bare carton or line
    // handle, and any licence plate with nothing outstanding. Preview is the
    // safe answer — the existing page opens and no work starts.
    id: 'preview',
    classes: [
      'sku',
      'bin',
      'receiving',
      'receiving-line',
      'serial-unit',
      'handling-unit',
      'manifest',
      'support-ticket',
      'carrier-tracking',
      'sscc',
      'bin-paired-order',
      'fnsku',
    ],
    when: ALWAYS,
    card: 'preview',
    stateful: false,
    reason: 'nothing outstanding on this object',
  },
];

// ─── Titles are data ────────────────────────────────────────────────────────

const TITLE_TEMPLATES = {
  // Workstation pivot (operator 2026-09-06): session blocks name the WORK and
  // the ID, never a destination called "Arrival" — the door is what you are
  // doing, not a place the phone navigates to.
  arrival: (carrier: string, last4: string) => `Intake · ${carrier} ${last4}`,
  qcLpn: (lpn: string) => `QC · LPN ${lpn}`,
  qcUnit: (unit: string) => `QC · Unit ${unit}`,
  qcLine: (line: string) => `QC · Line ${line}`,
  qcCarton: (carton: string) => `QC · Carton ${carton}`,
  pack: (ref: string) => `Pack · ${ref}`,
} as const;

/** The Field's placeholder tail — "scan · type · say → {destination}". */
const CARD_DESTINATION: Record<ScanCard, string> = {
  arrival: 'the door',
  carton: 'the carton',
  qc: 'QC',
  pack: 'Pack',
  preview: 'a preview',
};

const ASK_DESTINATION = 'two Cards — pick one';

// ─── Deriving the title parts from the route ────────────────────────────────

/** Label-ID tail an operator can read off the sticker and match by eye. */
function last4(value: string): string {
  const compact = value.replace(/[^A-Za-z0-9]/g, '');
  return compact.slice(-4) || compact;
}

/** The licence-plate number for a `QC · LPN {n}` title. */
function lpnLabel(route: ScanRoute): string {
  const fromRedirect = /^\/m\/h\/(\d+)$/.exec(route.redirect || '');
  if (fromRedirect) return fromRedirect[1];
  if (route.type === 'sscc') return last4(route.value);
  return route.value.replace(/^H-/i, '');
}

function titleFor(
  card: ScanCard,
  route: ScanRoute,
  state: ScanObjectState,
): string | null {
  if (card === 'arrival') {
    return TITLE_TEMPLATES.arrival(route.carrier ?? 'Unknown', last4(route.value));
  }
  if (card === 'qc') {
    // The unit reads as the key printed on its label (serial / unit_uid), the
    // same one `/api/serial-units/[id]` resolves — never a guessed tail.
    if (route.type === 'serial-unit') {
      return TITLE_TEMPLATES.qcUnit(scannedUnitKey(route.value) ?? route.value);
    }
    if (route.type === 'receiving-line') {
      // A URL-form line label reads as its printed handle, not the whole URL.
      const lineId = /^\/m\/l\/(\d+)$/.exec(route.redirect || '')?.[1];
      return TITLE_TEMPLATES.qcLine(lineId ? `L-${lineId}` : route.value);
    }
    if (route.type === 'receiving') {
      const cartonId = /^\/m\/r\/(\d+)$/.exec(route.redirect || '')?.[1];
      return TITLE_TEMPLATES.qcCarton(cartonId ? `R-${cartonId}` : route.value);
    }
    return TITLE_TEMPLATES.qcLpn(lpnLabel(route));
  }
  if (card === 'pack') {
    return TITLE_TEMPLATES.pack(route.orderRef ?? state.binOrderId ?? lpnLabel(route));
  }
  // `carton` keeps the carton's own stage title; `preview` starts no session.
  return null;
}

// ─── Preview vs act ─────────────────────────────────────────────────────────

/**
 * A `bin-paired-order` scan satisfies a session that armed for `bin` — pairing
 * is a fact the session did not have when it armed, and refusing it here would
 * make the pack session unable to take the very bin it is waiting for.
 */
const EXPECT_ALIASES: Partial<Record<ScanType, readonly ScanType[]>> = {
  'bin-paired-order': ['bin'],
};

function isExpected(session: ArmedScanSession, type: ScanType): boolean {
  if (session.expects.includes(type)) return true;
  return (EXPECT_ALIASES[type] ?? []).some((alias) => session.expects.includes(alias));
}

// ─── The dispatch ───────────────────────────────────────────────────────────

/** Decide the Card, the session title and the mode for one scan. */
export function dispatchScan(input: ScanDispatchInput): ScanDispatch {
  const armed = input.armedSession ?? null;
  const route = typeof input.scan === 'string' ? routeScan(input.scan) : input.scan;

  if (!route) {
    return {
      card: 'preview',
      title: null,
      mode: 'preview',
      reason: 'nothing was scanned',
      destination: CARD_DESTINATION.preview,
      parks: false,
    };
  }

  // `routeScanPaired` has already run the injected order-book lookup, so a route
  // carrying `orderRef` IS the pairing state — fold it in rather than making
  // every caller pass the same fact twice.
  const state: ScanObjectState = {
    ...(input.state ?? {}),
    binOrderId: input.state?.binOrderId ?? route.orderRef ?? null,
  };

  const matches = DISPATCH_TABLE.filter(
    (row) =>
      row.classes.includes(route.type) &&
      (row.armedFor === undefined || armed?.work === row.armedFor) &&
      row.when(state),
  );
  const stateful = matches.filter((row) => row.stateful);
  const contenders = stateful.length ? stateful : matches;

  // A tie is two stateful rows naming different Cards. Two rows naming the SAME
  // Card is not a tie — they agree.
  const distinct = [...new Set(contenders.map((row) => row.card))];
  if (stateful.length > 1 && distinct.length > 1) {
    const [a, b] = distinct as [ScanCard, ScanCard];
    return {
      card: a,
      title: null,
      mode: 'ask',
      reason: `${contenders[0].reason}, and ${contenders[1].reason}`,
      destination: ASK_DESTINATION,
      parks: false,
      candidates: [a, b],
    };
  }

  const row = contenders[0] ?? DISPATCH_TABLE[DISPATCH_TABLE.length - 1];
  const card = row.card;
  const acts = Boolean(armed) && isExpected(armed!, route.type);

  return {
    card,
    title: titleFor(card, route, state),
    mode: acts ? 'act' : 'preview',
    reason: acts
      ? row.reason
      : armed
        ? `${row.reason} — not what this session is waiting for`
        : row.reason,
    destination: CARD_DESTINATION[card],
    parks: acts,
  };
}
