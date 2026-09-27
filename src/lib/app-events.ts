/**
 * App-wide custom DOM event names.
 *
 * Prefer these constants over string literals so typos become compile errors
 * and renames stay greppable.
 */

export const AI_CHAT_NEW_EVENT = 'app:ai-chat-new' as const;
/**
 * A session was renamed, deleted, or otherwise mutated — every list that shows
 * sessions (the spine Sessions list, the header switcher) refetches. Distinct
 * from {@link AI_CHAT_NEW_EVENT}: that starts a NEW thread (and other listeners
 * act on it), this only says "the recent list changed, reload it."
 */
export const AI_CHAT_SESSIONS_CHANGED_EVENT = 'app:ai-chat-sessions-changed' as const;
export const ASSISTANT_HIGHLIGHT_EVENT = 'app:assistant-highlight' as const;
export const COMMAND_BAR_OPEN_EVENT = 'app-command-bar-open' as const;

/**
 * Toggle the MasterNav spine.
 *
 * The toggle renders in TWO places that are the SAME screen position: the
 * GlobalHeader nav cluster while the spine is closed, and the spine's own top
 * row while it is open (there is no header cluster to occupy that corner then).
 * `ResponsiveLayout` owns `navOpen`, so an event is how the spine's copy
 * reaches it — the same idiom `SpineSessionHead`'s Search row already uses to
 * reach the palette, instead of threading a setter down five components.
 */
export const MASTER_NAV_TOGGLE_EVENT = 'app:master-nav-toggle' as const;
/** Fired when the find dialog opens or closes — header icon pressed state. */
export const COMMAND_BAR_OPEN_CHANGE_EVENT = 'app-command-bar-open-change' as const;
/**
 * Display string for the chord that opens the palette, authored HERE beside
 * the event that opens it so a hint and the binding cannot drift. Feed it to
 * `HotkeyTooltip chord={…}` — never re-type "⌘K" into a label, and never fold
 * it into label text ("Search (⌘K)"): the tooltip paints it as keycaps.
 */
export const COMMAND_BAR_CHORD = 'Cmd + K' as const;
/** Ask {@link ClipboardHistoryHost} to open the clipboard panel (spine ⋯ button). */
export const CLIPBOARD_HISTORY_OPEN_EVENT = 'app:clipboard-history-open' as const;
/** Ask {@link ThrowTaskHost} to open the throw-a-task panel (spine ⋯ button). */
export const THROW_TASK_OPEN_EVENT = 'app:throw-task-open' as const;
/**
 * The agent asked the AI session to show an artifact (table / timeline /
 * ticket thread / reply draft / chart / record / report …) via the
 * `render_artifact` UI tool. Detail is a {@link SessionArtifactEventDetail}:
 * the RAW payload (validated by the store against ui-artifacts.ts) plus the
 * assistant message it belongs under, so the transcript can draw its card in
 * place. Surfaces without an artifact store simply have no listener — the
 * event evaporates harmlessly.
 */
export const SESSION_ARTIFACT_EVENT = 'app:session-artifact' as const;
export interface SessionArtifactEventDetail {
  artifact: unknown;
  /** The registered report tool that produced it; absent for a model-typed payload. */
  producedBy?: string | null;
  /** The assistant message it belongs under; absent = the foot of the transcript. */
  messageId?: string | null;
  /**
   * Streamed by a LIVE turn's `render_artifact` — the store opens the side
   * panel on it (the newest of the turn wins). Unset for everything replayed
   * or derived: a reopened past session, a leaked table moved to a card, a
   * printer report.
   */
  live?: true;
}
/**
 * The agent OPENED a `render_artifact` tool block — the payload is still
 * streaming. Detail is a {@link SessionArtifactPendingDetail}: `true` shows a
 * "Preparing…" card under that message instead of nothing for the rest of
 * the turn, `false` releases it (turn aborted, failed, or ended without an
 * artifact).
 */
export const SESSION_ARTIFACT_PENDING_EVENT = 'app:session-artifact-pending' as const;
export interface SessionArtifactPendingDetail {
  pending: boolean;
  messageId?: string | null;
}
/**
 * A turn in this session FAILED after an artifact was already standing (tool
 * error mid-turn). Detail is `{ reason: string }`. The store badges the newest
 * artifact as from an earlier turn — yesterday's number must not stand in for
 * a read that just failed.
 */
export const SESSION_ARTIFACT_STALE_EVENT = 'app:session-artifact-stale' as const;
