/**
 * The desk Field — where it mounts, and what its placeholder promises.
 *
 * One field sits at the bottom of the desk shell and takes everything an
 * operator can hand the app: a scan, a typed question, a pasted block of
 * orders, a spoken sentence. This module answers the only two questions that
 * decision needs, as data:
 *
 *   *does the field mount on this screen?* and *where does the next input go?*
 *
 * Three rules hold it in place.
 *
 * **A floor station's own mouth wins.** A station page already carries
 * `StationComposerHost` — the mouth staff look at all day. A second field
 * underneath it is a second place to type with a different destination, which
 * is exactly the fork the composer law refuses. One mouth on screen, always;
 * `stationMouths >= 1` stands the desk field down.
 *
 * **The phone and the public resolver are not desks.** `/m/*` is the mobile
 * scan shell with its own Field, and the GS1 resolver routes (`/01`, `/414`,
 * `/l`, `/p`, `/s`, `/q`) are public pages a customer opens off a printed
 * label — there is no desk behind either one to type at.
 *
 * **The placeholder names the destination in words** (I4). Never "Search…",
 * never a bare caret: the operator must be able to read where their next
 * keystroke lands before they spend it. Four destinations, in priority order —
 * the open import draft, the armed session, the orders desk that stages
 * pasted orders, and the desk itself.
 *
 * Pure by construction: no React, no DOM, no fetch. The shell passes what it
 * knows; this module decides.
 */

// ─── Input ──────────────────────────────────────────────────────────────────

export interface DeskFieldInput {
  /** The current route, e.g. `/shipping/orders`. Query and hash are ignored. */
  pathname: string;
  /** Station mouths already mounted on this screen. One is enough to win. */
  stationMouths: number;
  /** True while the paste-orders import draft is open. */
  importDraftOpen: boolean;
  /** Title of the armed work session, or `null` when nothing is armed. */
  armedSessionTitle: string | null;
}

export interface DeskFieldPlacement {
  /** Whether the desk field mounts on this screen at all. */
  mount: boolean;
  /** The words in the empty field — always the destination of the next input. */
  placeholder: string;
  /** Why it mounts (or stands down), in one sentence. */
  reason: string;
}

// ─── The routes that refuse a desk field ────────────────────────────────────

/**
 * The public GS1 digital-link resolver prefixes. These are label-scan landing
 * pages — a customer's phone opens them off a printed carton, with no session,
 * no desk and nothing to type at.
 */
export const DESK_FIELD_RESOLVER_SEGMENTS: readonly string[] = [
  '01',
  '414',
  'l',
  'p',
  's',
  'q',
];

/** The mobile scan shell — it carries its own Field. */
export const DESK_FIELD_MOBILE_SEGMENT = 'm';

/** The orders desk, where a paste stages orders instead of asking a question. */
export const DESK_FIELD_ORDERS_PATH = '/shipping/orders';

/** Strip query/hash, collapse a trailing slash, lowercase. `''` → `/`. */
function normalizePathname(pathname: string): string {
  const raw = (pathname || '').trim().split('?')[0]!.split('#')[0]!;
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const trimmed = withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
  return (trimmed || '/').toLowerCase();
}

function firstSegment(pathname: string): string {
  return normalizePathname(pathname).split('/')[1] ?? '';
}

/** `/m`, `/m/`, `/m/scan` — the phone shell, at any depth. */
export function isMobileShellPath(pathname: string): boolean {
  return firstSegment(pathname) === DESK_FIELD_MOBILE_SEGMENT;
}

/** `/01/0950…`, `/p/SKU-1`, `/q` — a public resolver page, at any depth. */
export function isResolverPath(pathname: string): boolean {
  return DESK_FIELD_RESOLVER_SEGMENTS.includes(firstSegment(pathname));
}

/** The orders desk itself or anything beneath it. */
export function isOrdersDeskPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === DESK_FIELD_ORDERS_PATH || path.startsWith(`${DESK_FIELD_ORDERS_PATH}/`);
}

// ─── The placeholder — the destination, in words ────────────────────────────

/**
 * What the empty field promises, in priority order:
 *
 *  1. **An open import draft** is already holding a destination — the paste
 *     goes into the staging table the operator is looking at.
 *  2. **An armed session** owns everything typed while it runs, so the field
 *     says which one by name. A scan that lands in an unnamed session is how
 *     an operator loses a carton's worth of notes.
 *  3. **The orders desk** with neither: a paste here is orders, not a
 *     question, and the field says so before the paste rather than after.
 *  4. **Otherwise** the desk itself answers — scan, type or say.
 */
export function deskFieldPlaceholder(
  input: Pick<DeskFieldInput, 'pathname' | 'importDraftOpen' | 'armedSessionTitle'>,
): string {
  if (input.importDraftOpen) return 'Paste orders to stage';

  const armed = (input.armedSessionTitle ?? '').trim();
  if (armed) return `Scan a carton or type to ask · lands in ${armed}`;

  if (isOrdersDeskPath(input.pathname)) {
    return 'Paste a CSV or a screenshot of orders to stage them';
  }

  return 'Scan, type or say — ask about this desk';
}

// ─── The placement ──────────────────────────────────────────────────────────

/**
 * Decide whether the desk field mounts here, and what it says.
 *
 * The suppressions are checked before anything else and in this order, because
 * a station page under `/m/` is still a station: the mouth is the reason, and
 * naming the route instead would send whoever reads the reason to the wrong
 * fix. The placeholder is computed either way — a stood-down field still
 * reports the destination it would have named, which is what makes this
 * testable without a screen.
 */
export function deskFieldPlacement(input: DeskFieldInput): DeskFieldPlacement {
  const placeholder = deskFieldPlaceholder(input);

  const mouths = Number.isFinite(input.stationMouths) ? input.stationMouths : 0;
  if (mouths >= 1) {
    return {
      mount: false,
      placeholder,
      reason:
        "A floor station's own mouth is already on screen, and one screen gets one mouth.",
    };
  }

  if (isMobileShellPath(input.pathname)) {
    return {
      mount: false,
      placeholder,
      reason: 'The phone scan shell carries its own Field, so the desk field stands down.',
    };
  }

  if (isResolverPath(input.pathname)) {
    return {
      mount: false,
      placeholder,
      reason: 'A public resolver page has no desk behind it to type at.',
    };
  }

  return {
    mount: true,
    placeholder,
    reason: 'This desk has no mouth of its own, so the field is where input lands.',
  };
}
