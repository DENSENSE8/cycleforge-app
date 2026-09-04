/**
 * The Arrival Card — the whole screen a never-seen tracking number opens, as
 * data.
 *
 * A carton lands at the door, the gun reads somebody else's label, and the
 * phone must answer one question in one screen: *do I open this now, or does it
 * go on the rack?* Everything that decision needs lives here, and nothing that
 * renders, fetches or navigates does:
 *
 *   header → the object → 1–3 facts → two photo slots → ONE primary verb with
 *   its reason, and one secondary.
 *
 * Two rules hold this module in place.
 *
 * **The recommendation is pure.** No model call sits between the scan and the
 * Card. The operator is standing over an open carton with a gun in one hand;
 * a recommendation that arrives 800 ms later has already been overtaken by
 * their thumb. `arrivalRecommendation` is a function of two numbers.
 *
 * **The title is not re-derived.** `arrivalTitle` asks the dispatch table
 * (G1) rather than re-formatting `Arrival · {carrier} {last4}` beside it —
 * two spellings of one session title is how the Stack starts showing an
 * operator two rows for one carton.
 *
 * Plan: docs/warehouse-os/PLAN-scan-shell-mobile.md → the phone in one screen.
 * Goal: docs/warehouse-os/GOAL-scan-shell-mobile-card-arrival.md.
 */

import { dispatchScan } from './dispatch-table';
import { routeScan, type ScanRoute } from '../barcode-routing';

// ─── The two verbs ──────────────────────────────────────────────────────────

/**
 * What an operator can do with a carton that just arrived. Exactly two.
 *
 * A third ("hold", "quarantine", "ask someone") is how this Card becomes a
 * menu — and the plan's hand gate counts every menu as a defect.
 */
export type ArrivalVerb = 'unbox' | 'rack';

/** The ops event each verb writes. One choice, one event, one name. */
export const ARRIVAL_OPS_EVENT: Record<ArrivalVerb, string> = {
  unbox: 'arrival.unboxed',
  rack: 'arrival.racked',
};

/** `work_sessions.surface_key` for every session this Card arms. */
export const ARRIVAL_SURFACE_KEY = 'arrival';

export interface ArrivalAction {
  verb: ArrivalVerb;
  /** The words on the button — the reason rides along on the primary. */
  label: string;
  /** Why this verb is or is not the recommendation, in one clause. */
  reason: string;
  /** True for the preselected verb; exactly one action carries it. */
  primary: boolean;
}

export interface ArrivalRecommendation {
  verb: ArrivalVerb;
  reason: string;
  /** Both actions, the recommended one first. Never more, never fewer. */
  actions: readonly [ArrivalAction, ArrivalAction];
}

/**
 * Everything the recommendation is allowed to know.
 *
 * Both are optional and both default to "nothing waiting, rack has room", so a
 * caller that has not counted yet gets the cautious answer (*Rack it*) rather
 * than an invented one.
 */
export interface ArrivalRecommendationInput {
  /** Pending orders that would be filled by what is in this carton. */
  pendingOrdersForCarton?: number | null;
  /** Free rack slots. `0` means the rack is full — there is nowhere to put it. */
  rackCapacity?: number | null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A count we were handed, floored at zero — a negative rack is not a fact. */
function count(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function unboxAction(reason: string, waiting: number, primary: boolean): ArrivalAction {
  return {
    verb: 'unbox',
    label: waiting > 0 ? `Unbox now · ${plural(waiting, 'order')} waiting` : 'Unbox now',
    reason,
    primary,
  };
}

function rackAction(reason: string, primary: boolean): ArrivalAction {
  return { verb: 'rack', label: 'Rack it for later', reason, primary };
}

/**
 * Pick the verb this carton should get, and say why.
 *
 * The rule is the plan's, in order:
 *
 *  1. **Someone is waiting.** One pending order on this carton beats any amount
 *     of tidiness — unboxing now is what turns the carton into a shipment
 *     today.
 *  2. **The rack is full.** With nothing waiting we would rack it, but a rack
 *     with no free slot is not a destination. Unboxing is then the only verb
 *     that actually ends with the carton somewhere.
 *  3. **Otherwise it waits.** Nothing is owed and there is room, so the cheap
 *     answer wins and the operator's next scan is the next carton.
 *
 * The loser is always offered too — the recommendation is preselected, never
 * enforced.
 */
export function arrivalRecommendation(
  input: ArrivalRecommendationInput = {},
): ArrivalRecommendation {
  const waiting = count(input.pendingOrdersForCarton);
  const rackKnown = typeof input.rackCapacity === 'number' && Number.isFinite(input.rackCapacity);
  const free = count(input.rackCapacity);
  const rackFull = rackKnown && free === 0;

  if (waiting > 0) {
    const reason = `${plural(waiting, 'order')} waiting on this carton`;
    return {
      verb: 'unbox',
      reason,
      actions: [
        unboxAction(reason, waiting, true),
        rackAction('the orders keep waiting', false),
      ],
    };
  }

  if (rackFull) {
    const reason = 'the rack is full — there is nowhere to put it';
    return {
      verb: 'unbox',
      reason,
      actions: [unboxAction(reason, waiting, true), rackAction(reason, false)],
    };
  }

  const reason = 'no orders are waiting on this carton';
  return {
    verb: 'rack',
    reason,
    actions: [
      rackAction(reason, true),
      unboxAction('nothing is waiting on it yet', waiting, false),
    ],
  };
}

// ─── Title and Field placeholder — asked, not re-derived ────────────────────

/**
 * The armed session's title for this scan — `Arrival · {carrier} {last4}`.
 *
 * Read out of {@link dispatchScan} with `trackingSeen: false`, which is the
 * only state that opens this Card. `null` when the scan is not a never-seen
 * tracking number at all: the Card should not have been opened, and inventing
 * an `Arrival ·` title for it would arm a session against the wrong object.
 */
export function arrivalTitle(scan: string | ScanRoute): string | null {
  const dispatch = dispatchScan({ scan, state: { trackingSeen: false } });
  return dispatch.card === 'arrival' ? dispatch.title : null;
}

/**
 * The Field's placeholder while this Card is open — "scan · type · say →
 * Arrival". The destination word comes from the dispatch table for the same
 * reason the title does.
 */
export function arrivalFieldPlaceholder(scan: string | ScanRoute): string {
  const dispatch = dispatchScan({ scan, state: { trackingSeen: false } });
  return `scan · type · say → ${dispatch.destination}`;
}

// ─── The photo slots ────────────────────────────────────────────────────────

export type ArrivalPhotoKind = 'label' | 'box';

export interface ArrivalPhotoSlot {
  kind: ArrivalPhotoKind;
  label: string;
  /** What the operator should actually point the camera at. */
  hint: string;
}

/**
 * Two inputs, not a gallery: the label (who sent it, what it says) and the box
 * (what condition it turned up in). Both go through `usePhotoDropzone` and
 * `downscaleImageTo720` on the way out — the Card names them, the component
 * captures them.
 */
export const ARRIVAL_PHOTO_SLOTS: readonly [ArrivalPhotoSlot, ArrivalPhotoSlot] = [
  { kind: 'label', label: 'Label', hint: 'the shipping label, readable' },
  { kind: 'box', label: 'Box', hint: 'the carton as it arrived' },
];

// ─── The facts ──────────────────────────────────────────────────────────────

export interface ArrivalFact {
  label: string;
  value: string;
}

/** One to three. Two facts an operator can act on beat six they scroll past. */
export const ARRIVAL_MAX_FACTS = 3;

/**
 * What the caller already knows about this arrival. All optional — a tracking
 * number that has never been seen usually comes with nothing but itself, and
 * the Card has to be honest about that rather than padded.
 */
export interface ArrivalCardInput extends ArrivalRecommendationInput {
  scan: string | ScanRoute;
  /** Who sent it, when an inbound record or the carrier account names them. */
  supplier?: string | null;
  /** Cartons expected on the same inbound, when one is known. */
  cartonsExpected?: number | null;
  /** The PO / inbound reference this tracking number was announced against. */
  poRef?: string | null;
}

function buildFacts(input: ArrivalCardInput): readonly ArrivalFact[] {
  const facts: ArrivalFact[] = [];
  const supplier = input.supplier?.trim();
  if (supplier) facts.push({ label: 'From', value: supplier });

  const cartons = count(input.cartonsExpected);
  if (cartons > 0) facts.push({ label: 'Expected', value: plural(cartons, 'carton') });

  const po = input.poRef?.trim();
  if (po) facts.push({ label: 'PO', value: po });

  const waiting = count(input.pendingOrdersForCarton);
  if (waiting > 0) facts.push({ label: 'Waiting', value: plural(waiting, 'order') });

  // Never zero facts. With nothing announced, the absence IS the fact — it is
  // why this Card opened instead of the carton's stage.
  if (!facts.length) {
    return [{ label: 'Prior record', value: 'none — first scan of this number' }];
  }
  return facts.slice(0, ARRIVAL_MAX_FACTS);
}

// ─── The Card ───────────────────────────────────────────────────────────────

export interface ArrivalCardHeader {
  /** Top-left goes back to the Stack, the only surface behind this one. */
  back: 'Stack';
  /** `Arrival · UPS 4471` — the same string that titles the session. */
  title: string;
}

export interface ArrivalCardModel {
  header: ArrivalCardHeader;
  /** The scanned string itself, printed so it can be matched against the label. */
  tracking: string;
  carrier: string;
  /** The session title this Card arms, from the dispatch table. */
  title: string;
  surfaceKey: typeof ARRIVAL_SURFACE_KEY;
  facts: readonly ArrivalFact[];
  photos: readonly [ArrivalPhotoSlot, ArrivalPhotoSlot];
  recommendation: ArrivalRecommendation;
  fieldPlaceholder: string;
}

/**
 * Build the whole Card. `null` when the scan is not a never-seen tracking
 * number — the dispatch table owns that judgement, so a caller that mounts
 * this Card on the wrong scan gets nothing rather than a plausible screen.
 */
export function arrivalCardModel(input: ArrivalCardInput): ArrivalCardModel | null {
  const dispatch = dispatchScan({ scan: input.scan, state: { trackingSeen: false } });
  if (dispatch.card !== 'arrival' || !dispatch.title) return null;

  // The route is where the carrier and the canonical tracking string live —
  // the same decode the dispatch table just ran, not a second parse beside it.
  const route = typeof input.scan === 'string' ? routeScan(input.scan) : input.scan;
  if (!route) return null;

  return {
    header: { back: 'Stack', title: dispatch.title },
    tracking: route.value,
    carrier: route.carrier ?? 'Unknown',
    title: dispatch.title,
    surfaceKey: ARRIVAL_SURFACE_KEY,
    facts: buildFacts(input),
    photos: ARRIVAL_PHOTO_SLOTS,
    recommendation: arrivalRecommendation(input),
    fieldPlaceholder: `scan · type · say → ${dispatch.destination}`,
  };
}

// ─── The one event a choice writes ──────────────────────────────────────────

export interface ArrivalChoice {
  verb: ArrivalVerb;
  /** Which photo slots the operator actually filled before choosing. */
  photos?: readonly ArrivalPhotoKind[];
}

export interface ArrivalOpsEvent {
  type: string;
  surfaceKey: typeof ARRIVAL_SURFACE_KEY;
  /** The title the armed session takes — the dispatch table's, unchanged. */
  title: string;
  tracking: string;
  carrier: string;
  verb: ArrivalVerb;
  /** The reason shown under the button the operator pressed. */
  reason: string;
  /** False when the operator overrode the preselected verb — worth knowing. */
  followedRecommendation: boolean;
  photos: readonly ArrivalPhotoKind[];
}

/**
 * The single ops event a choice writes. One press, one row — the Card does not
 * write a second "session started" event beside it, because the title on the
 * event IS the session.
 */
export function arrivalOpsEvent(
  card: ArrivalCardModel,
  choice: ArrivalChoice,
): ArrivalOpsEvent {
  const action =
    card.recommendation.actions.find((a) => a.verb === choice.verb) ??
    card.recommendation.actions[0];

  return {
    type: ARRIVAL_OPS_EVENT[action.verb],
    surfaceKey: ARRIVAL_SURFACE_KEY,
    title: card.title,
    tracking: card.tracking,
    carrier: card.carrier,
    verb: action.verb,
    reason: action.reason,
    followedRecommendation: action.verb === card.recommendation.verb,
    photos: choice.photos ?? [],
  };
}
