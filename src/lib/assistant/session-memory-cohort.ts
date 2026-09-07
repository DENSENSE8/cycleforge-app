/**
 * Session-memory cohort — SoT is MEMORY INTEGRITY: an AI session is the
 * operator's record of work already done, so losing one, being unable to take
 * a deletion back, or painting one illegibly is a data defect, not a cosmetic
 * one.
 *
 * Eval: `node --import tsx --test src/lib/assistant/session-memory-cohort.test.ts`
 * (wired into scripts/verify-profile.mjs as the `Cohort: session-memory` gate).
 *
 * Sibling of `session-surface-cohort.ts`, which owns the artifact PLANE (what
 * the agent may show). This cohort owns the session's LIFECYCLE and the pin
 * that binds a thread to a destination.
 *
 * Laws this cohort pins:
 *   1. REVERSIBLE. Every destructive session write ships its inverse in the
 *      same route, and both halves broadcast so every mounted list re-reads.
 *      A delete affordance that promises recovery must be backed by a real
 *      restore write.
 *   2. NO HARD DELETE. A session row is tombstoned, never dropped. Reads
 *      filter `deleted_at IS NULL`; the row survives for the undo.
 *   3. HONEST RETENTION. The UI never promises a retention window that no job
 *      enforces. There is no purge cron for `ai_chat_sessions` today, so no
 *      surface may name a number of days.
 *   4. LEGIBLE. A stored title reaches paint only through
 *      `displaySessionTitle`. Rows written before Harmony-stripping still hold
 *      `<|channel|>analysis…`, so the READ path sanitizes too.
 *   5. PROVENANCE. A pin that names a thread carries its `sessionId`, and
 *      every re-pin path converts a whole stored pin rather than copying a
 *      subset — the shape that silently dropped the binding on undo.
 *   6. SESSION-FIRST FACE. A pin's identity is asked before its href. A
 *      session href (`/?session=<id>`) resolves to the Home face, so any
 *      href-first resolver paints threads as Home.
 *   7. ANNOUNCED. A bound thread's title is part of the row's accessible name,
 *      never only a hover line that carries `aria-hidden`.
 *   8. ONE UNDO WINDOW. Each undo surface names its window in one exported
 *      constant — no inline timeout literals racing each other.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SESSION_MEMORY_COHORT_TRIPWIRE =
  'src/lib/assistant/session-memory-cohort.test.ts' as const;

/** Files this cohort's laws are enforced against. */
export const SESSION_MEMORY_ENGINE = {
  /** Soft delete + restore live in the same route file. */
  sessionRoute: 'src/app/api/ai/chat-sessions/[sessionId]/route.ts',
  sessionListRoute: 'src/app/api/ai/chat-sessions/route.ts',
  /** Client verbs: rename / delete / restore / pin. */
  sessionActions: 'src/lib/assistant/use-session-actions.ts',
  /** The spine's Sessions list — delete + undo surface. */
  sessionsList: 'src/components/sidebar/master-nav/SpineSessionsList.tsx',
  /** The one title sanitizer both writer and readers run. */
  titleText: 'src/lib/ai/session-title-text.ts',
  /** Pin model: discriminated write input + the binding field. */
  pinTypes: 'src/lib/quick-access/types.ts',
  /** Session predicate + the total stored-pin converter. */
  navPin: 'src/lib/quick-access/nav-pin.ts',
  /** Paint-time pin copy — session pins keep their stored thread name. */
  pageLabel: 'src/lib/quick-access/page-label.ts',
  /** Pin writes; both take PinInput. */
  quickAccessHook: 'src/lib/quick-access/use-quick-access.ts',
  pinStorage: 'src/lib/quick-access/storage.ts',
  /** Unpin-with-undo — the re-pin path that must not lose the binding. */
  pinUndo: 'src/components/sidebar/master-nav/use-pin-undo.ts',
  /** Spine pin shelf: glyph + accessible name. */
  pinnedCluster: 'src/components/sidebar/master-nav/MasterNavPinnedCluster.tsx',
  /** Header pin switcher — the second glyph resolver. */
  headerPins: 'src/components/layout/HeaderPinsSwitcher.tsx',
} as const;

/**
 * Symbols a graph consult must resolve before an edit here. `resolvePinIcon`
 * exists TWICE on purpose (spine shelf + header switcher) — an impact run that
 * returns one file is the stale-index tell, not a single-surface change.
 */
export const SESSION_MEMORY_GRAPH_SYMBOLS = [
  'resolvePinIcon',
  'pinInputFromPinned',
  'isSessionPin',
  'displaySessionTitle',
  'restoreSession',
] as const;

/** Structural markers the engine files MUST contain. */
export const SESSION_MEMORY_CONTRACT = {
  /** Law 1 — the restore half of the soft delete, and its broadcast. */
  restoreAccepted: 'body.restore === true',
  restoreClearsTombstone: 'deletedAt: null',
  restoreVerb: 'const restoreSession',
  restoreBroadcast: 'emitSessionsChanged()',
  /** Law 1 — the list surface offers the undo, not just the toast copy. */
  undoOffered: 'onRestore',
  /** Law 2 — DELETE is an UPDATE that stamps the tombstone. */
  softDeleteWrite: 'deletedAt: sql`now()`',
  /** Law 4 — one sanitizer, branded so a raw title cannot be stored. */
  titleBrand: 'DisplayTitle',
  titleSanitizer: 'export function displaySessionTitle',
  /** Law 5 — the discriminant and the total converter. */
  pinKindDiscriminant: "kind: 'session'",
  pinSessionIdRequired: 'sessionId: string',
  pinConverter: 'export function pinInputFromPinned',
  /** Law 5 — insertPin persists the binding, like addPin. */
  insertPinKeepsBinding: 'sessionId: input.sessionId || undefined',
  /** Law 6 — one predicate, asked before the href lookup. */
  sessionPredicate: 'export function isSessionPin',
  /** Law 7 — the thread is in the accessible name. */
  sessionInAccessibleName: '— session: ',
} as const;

/**
 * Which engine file each contract marker is asserted against. A marker with no
 * home is a law nobody can check, so the tripwire fails on a missing entry.
 */
export const SESSION_MEMORY_CONTRACT_FILES: Readonly<
  Record<keyof typeof SESSION_MEMORY_CONTRACT, string>
> = {
  restoreAccepted: SESSION_MEMORY_ENGINE.sessionRoute,
  restoreClearsTombstone: SESSION_MEMORY_ENGINE.sessionRoute,
  restoreVerb: SESSION_MEMORY_ENGINE.sessionActions,
  restoreBroadcast: SESSION_MEMORY_ENGINE.sessionActions,
  undoOffered: SESSION_MEMORY_ENGINE.sessionsList,
  softDeleteWrite: SESSION_MEMORY_ENGINE.sessionRoute,
  titleBrand: SESSION_MEMORY_ENGINE.titleText,
  titleSanitizer: SESSION_MEMORY_ENGINE.titleText,
  pinKindDiscriminant: SESSION_MEMORY_ENGINE.pinTypes,
  pinSessionIdRequired: SESSION_MEMORY_ENGINE.pinTypes,
  pinConverter: SESSION_MEMORY_ENGINE.navPin,
  insertPinKeepsBinding: SESSION_MEMORY_ENGINE.pinStorage,
  sessionPredicate: SESSION_MEMORY_ENGINE.navPin,
  sessionInAccessibleName: SESSION_MEMORY_ENGINE.pinnedCluster,
};

/** Source shapes that break a memory law. */
export const SESSION_MEMORY_FORBIDDEN = {
  /** Law 2 — a session row is never dropped. */
  hardDeleteSql: /DELETE\s+FROM\s+ai_chat_sessions/i,
  hardDeleteDrizzle: /db\s*\.\s*delete\s*\(\s*aiChatSessions/,
  /**
   * Law 3 — no surface names a retention window. `check-law-checksums` and
   * this file may SPELL the rule; the engine files may not make the promise.
   */
  retentionPromise: /recoverable for \d+ days|for \d+ days|\b\d+-day\b/i,
  /**
   * Law 4 — a stored title never reaches JSX raw. `displaySessionTitle` is the
   * only way in, so an interpolated `.title` in a component is the drift.
   */
  rawTitleInJsx: /\{\s*(?:[\w.]*\bsession|s|row)\.title\s*\}/,
  /**
   * Law 5 — a re-pin that hand-picks fields. The binding is not in the list,
   * which is exactly how it got dropped; `pinInputFromPinned` is the way.
   */
  handPickedRePin: /pinAt\(\s*\{\s*(?:kind:\s*'session',\s*)?href:[^}]*label:[^}]*iconKey:[^}]*\}\s*,/,
  /** Law 8 — no inline undo timers beside the exported window. */
  inlineUndoTimeout: /setTimeout\([^)]*,\s*(?:5000|8000|10000|12000)\s*\)/,
} as const;

/**
 * Which engine files each forbidden pattern is swept over. Scoped on purpose:
 * a law file must be free to name the token it bans.
 */
export const SESSION_MEMORY_FORBIDDEN_FILES: Readonly<
  Record<keyof typeof SESSION_MEMORY_FORBIDDEN, readonly string[]>
> = {
  hardDeleteSql: [SESSION_MEMORY_ENGINE.sessionRoute, SESSION_MEMORY_ENGINE.sessionListRoute],
  hardDeleteDrizzle: [SESSION_MEMORY_ENGINE.sessionRoute, SESSION_MEMORY_ENGINE.sessionListRoute],
  retentionPromise: [SESSION_MEMORY_ENGINE.sessionsList],
  rawTitleInJsx: [
    SESSION_MEMORY_ENGINE.sessionsList,
    SESSION_MEMORY_ENGINE.pinnedCluster,
    SESSION_MEMORY_ENGINE.headerPins,
  ],
  handPickedRePin: [SESSION_MEMORY_ENGINE.pinUndo],
  inlineUndoTimeout: [SESSION_MEMORY_ENGINE.pinUndo, SESSION_MEMORY_ENGINE.sessionsList],
};

/**
 * Law 6 — every file that resolves a pin's glyph. Each must ask the session
 * predicate BEFORE the href face, or pinned threads wear the Home glyph.
 */
export const PIN_FACE_RESOLVERS = [
  SESSION_MEMORY_ENGINE.pinnedCluster,
  SESSION_MEMORY_ENGINE.headerPins,
] as const;

export function sessionMemorySource(rel: string): string {
  const abs = join(process.cwd(), rel);
  if (!existsSync(abs)) throw new Error(`missing ${rel}`);
  return readFileSync(abs, 'utf8');
}

/**
 * The falsifiable claim, kept as text so a plan can quote it.
 */
export const SESSION_MEMORY_ACCEPTANCE =
  'A session survives a mis-click: deleting offers a restore that really clears the tombstone, a pinned thread wears a chat glyph and announces its title, and taking back an accidental unpin returns the pin WITH its session binding. No surface promises a retention window nothing enforces.' as const;
