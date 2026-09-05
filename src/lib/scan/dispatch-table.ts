/**
 * The scan dispatch table — scan class × object state → one Card, one title.
 *
 * This is the whole decision behind the phone's Scan Shell: a scan arrives, and
 * exactly one Card opens with exactly one session title. Nothing here renders,
 * fetches, or navigates. It is a pure function of two inputs and it must stay
 * that way:
 *
 *   - the CLASS comes from `@/lib/barcode-routing` (`routeScan` /
 *     `routeScanPaired`) — a fact about the bytes on the label;
 *   - the STATE comes from the caller — a fact about the object the label names.
 *
 * The split is load-bearing. A tracking number does not know whether we have
 * seen its carton; an LPN does not know whether its QC is open. If this module
 * ever reached for that itself it would need a DB, and the Card could no longer
 * paint inside the 100 ms the plan budgets between wedge keystroke and paint.
 * `state` is therefore an argument, never a lookup.
 *
 * Plan: docs/warehouse-os/PLAN-scan-shell-mobile.md → "Dispatch (mobile subset)".
 */

import {
  routeScan,
  type ScanRoute,
  type ScanType,
} from '../barcode-routing';

/**
 * The Cards the phone can open. One at a time — there is no stack of panes and
 * no bottom tab bar; the Stack behind top-left is the only other surface.
 *
 * `carton` is not a new screen: it means "whatever stage this carton is already
 * in", i.e. the existing page, with the existing session title.
 */
export type ScanCard = 'arrival' | 'carton' | 'qc' | 'pack' | 'preview';

/**
 * What the scan does to the armed session.
 *
 *   `act`     — the scan advances the armed session's work.
 *   `preview` — the Card opens read-only; the armed session is untouched.
 *   `ask`     — two rows of the table matched with equal standing; the Field
 *               asks one line rather than guessing. Exactly three modes; a
 *               fourth ("queue", "park", "defer") is how this becomes a router.
 */
export type DispatchMode = 'act' | 'preview' | 'ask';

/**
 * Everything the table knows about the object the scan names, and nothing more.
 *
 * All four are optional and all four default to "no prior state", so a caller
 * that knows nothing yet gets the honest answer (arrival / preview) rather than
 * a wrong one.
 */
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

/**
 * The one armed scan session, or `null` when nothing is armed.
 *
 * `expects` is the classes this session can act on. Anything else previews over
 * it and **parks nothing** — an unexpected scan must never silently enqueue
 * itself into work the operator did not ask for.
 */
export interface ArmedScanSession {
  expects: readonly ScanType[];
  /** The session's current title, kept as-is by any Card that returns none. */
  title?: string | null;
}

export interface ScanDispatchInput {
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
//
// One row per line of the plan's dispatch table, in the plan's order. A row is
// `stateful` when it fires on PRIOR STATE about the object rather than on the
// class alone — that flag is the whole "prior state wins" rule: if any stateful
// row matches, the class defaults below it never get a say.

interface DispatchRow {
  id: string;
  classes: readonly ScanType[];
  when: (s: ScanObjectState) => boolean;
  card: ScanCard;
  stateful: boolean;
  reason: string;
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
    // The catch-all: serial, SKU, kit, ticket, a bare carton or line handle, and
    // any licence plate with nothing outstanding. Preview is the safe answer —
    // the existing page opens and no work starts.
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
    ],
    when: ALWAYS,
    card: 'preview',
    stateful: false,
    reason: 'nothing outstanding on this object',
  },
];

// ─── Titles are data ────────────────────────────────────────────────────────
//
// Every session title this app writes for a scan is one of these three
// templates. A Card that returns `null` keeps the session's existing title —
// that is the plan's "existing" row, not a missing case.

const TITLE_TEMPLATES = {
  arrival: (carrier: string, last4: string) => `Arrival · ${carrier} ${last4}`,
  qc: (lpn: string) => `QC · LPN ${lpn}`,
  pack: (ref: string) => `Pack · ${ref}`,
} as const;

/** The Field's placeholder tail — "scan · type · say → {destination}". */
const CARD_DESTINATION: Record<ScanCard, string> = {
  arrival: 'Arrival',
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

/**
 * The licence-plate number for a `QC · LPN {n}` title.
 *
 * A house LPN carries its id in the redirect (`/m/h/12`) and reads best in
 * full; a foreign SSCC is 18 digits, so it reads as its tail — the same four
 * characters printed large on the label.
 */
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
    return TITLE_TEMPLATES.qc(lpnLabel(route));
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

/**
 * Decide the Card, the session title and the mode for one scan.
 *
 * Resolution, in order:
 *
 *  1. Collect every row whose class list holds this scan's class and whose
 *     state predicate is true.
 *  2. **Prior state wins.** If any `stateful` row matched, the class defaults
 *     are dropped — a known carton beats "arrival", a paired bin beats "bin
 *     preview".
 *  3. **A tie asks.** If two stateful rows matched and they name DIFFERENT
 *     Cards (an LPN both in QC and staged for pack), neither is more true than
 *     the other, so the Field asks one line and names both candidates.
 *  4. Otherwise the first matching row wins; the catch-all is `preview`.
 *
 * Then the mode: no armed session → everything previews. Armed session → an
 * expected class acts; **any other class previews and parks nothing.**
 */
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
    (row) => row.classes.includes(route.type) && row.when(state),
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
