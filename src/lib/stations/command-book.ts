/**
 * The command book — every scannable `CMD-*` string in one ordered catalog.
 *
 * Pure assembly over the three command registries. It exists so the printable
 * book, the on-screen catalog and any future sticker sheet all read the SAME
 * list: a book that could drift from the parser is a book that teaches an
 * operator a code the app will refuse.
 *
 * Grouping is by what a scan DOES, because that is the only distinction that
 * changes how an operator may use the page: a `move` code is always safe to
 * scan, an `act` code changes a unit's lifecycle, and a `session` code changes
 * how the current bench reads the next scan. Sorting inside a group is the
 * registry's own `sortOrder` — the sticker-sheet order.
 */

import { NAV_COMMAND_CODES } from './nav-command-codes';
import { ACTION_COMMAND_CODES } from './action-command-codes';
import { STATION_COMMAND_CODES } from './station-command-codes';

export type CommandFamily = 'move' | 'act' | 'session';

export interface CommandBookEntry {
  /** The exact scan string — what the matrix encodes and the parser matches. */
  code: string;
  /** Human label — the book's left column heading. */
  label: string;
  family: CommandFamily;
  /**
   * One line saying what happens, in the operator's terms. Derived, never
   * hand-written per entry, so it cannot describe behaviour the registry does
   * not have.
   */
  effect: string;
  /** True when scanning this writes. Drives the book's warning treatment. */
  writes: boolean;
  sortOrder: number;
}

export interface CommandBookSection {
  family: CommandFamily;
  title: string;
  /** What this whole family does — the section's standfirst in the book. */
  blurb: string;
  entries: CommandBookEntry[];
}

const FAMILY_META: Record<CommandFamily, { title: string; blurb: string }> = {
  move: {
    title: 'Go — move between surfaces',
    blurb:
      'Scan one of these anywhere to jump to that surface. A move never changes a unit, an order or a carton. If you do not have access to the destination, the scan is refused and you stay where you are.',
  },
  act: {
    title: 'Do — record a verdict',
    blurb:
      'Scan the UNIT first, then one of these within two minutes. These change the unit’s lifecycle and are written to the audit log under your name. A code ending in a destination records the verdict and then moves you there.',
  },
  session: {
    title: 'Mode — change how this bench reads the next scan',
    blurb:
      'Scan one of these to arm a session mode on the bench you are standing at. Nothing is written and you do not move.',
  },
};

const FAMILY_ORDER: CommandFamily[] = ['move', 'act', 'session'];

function navEffect(label: string): string {
  return `Go to ${label.replace(/^Go · /, '')}`;
}

function actionEffect(verdict: string, thenGo: string | null): string {
  const verdictText =
    verdict === 'PASS'
      ? 'Record PASS on the scanned unit'
      : verdict === 'TESTING_FAILED'
        ? 'Record FAIL on the scanned unit (it goes on hold)'
        : 'Send the scanned unit back for re-test';
  if (!thenGo) return verdictText;
  const target = NAV_COMMAND_CODES.find((c) => c.code === thenGo);
  return `${verdictText}, then go to ${(target?.label ?? thenGo).replace(/^Go · /, '')}`;
}

/** The whole catalog, grouped and ordered. */
export function buildCommandBook(): CommandBookSection[] {
  const entries: CommandBookEntry[] = [
    ...NAV_COMMAND_CODES.map<CommandBookEntry>((c) => ({
      code: c.code,
      label: c.label,
      family: 'move',
      effect: navEffect(c.label),
      writes: false,
      sortOrder: c.sortOrder,
    })),
    ...ACTION_COMMAND_CODES.map<CommandBookEntry>((c) => ({
      code: c.code,
      label: c.label,
      family: 'act',
      effect: actionEffect(c.verdict, c.thenGo),
      writes: true,
      sortOrder: c.sortOrder,
    })),
    ...STATION_COMMAND_CODES.map<CommandBookEntry>((c) => ({
      code: c.code,
      label: c.label,
      family: 'session',
      effect: `Arm ${c.label.toLowerCase()} on this bench`,
      writes: false,
      sortOrder: c.sortOrder,
    })),
  ];

  return FAMILY_ORDER.map((family) => ({
    family,
    title: FAMILY_META[family].title,
    blurb: FAMILY_META[family].blurb,
    entries: entries
      .filter((e) => e.family === family)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((section) => section.entries.length > 0);
}

/** Flat catalog in book order — for counts and bulk print. */
export function listCommandBookEntries(): CommandBookEntry[] {
  return buildCommandBook().flatMap((s) => s.entries);
}

/**
 * Every built-in command as a seedable `reason_codes` row.
 *
 * One derived list, so the Admin catalog cannot drift from the parser. Both
 * seeders read it: `seedOrgCatalog` (every NEW org, correct by construction)
 * and the backfill migration (every org that already existed). Hand-listing the
 * codes in either place would create the exact drift this returns.
 *
 * `sortOrder` is offset per family so one `flow_context` sorts coherently —
 * the three registries each number from 10, so without the offset a move code
 * and an action code would interleave arbitrarily in the Admin list.
 */
export function listSeedableCommandCodes(): Array<{
  code: string;
  label: string;
  sortOrder: number;
}> {
  const FAMILY_BASE: Record<CommandFamily, number> = {
    move: 0,
    act: 1000,
    session: 2000,
  };
  return listCommandBookEntries().map((e) => ({
    code: e.code,
    label: e.label,
    sortOrder: FAMILY_BASE[e.family] + e.sortOrder,
  }));
}
