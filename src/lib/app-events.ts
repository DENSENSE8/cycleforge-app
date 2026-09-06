/**
 * App-wide custom DOM event names.
 *
 * Prefer these constants over string literals so typos become compile errors
 * and renames stay greppable.
 */

export const AI_CHAT_PROMPT_EVENT = 'app:ai-chat-prompt' as const;
export const AI_CHAT_NEW_EVENT = 'app:ai-chat-new' as const;
export const ASSISTANT_HIGHLIGHT_EVENT = 'app:assistant-highlight' as const;
export const COMMAND_BAR_OPEN_EVENT = 'app-command-bar-open' as const;
/** Fired when the find dialog opens or closes — header icon pressed state. */
export const COMMAND_BAR_OPEN_CHANGE_EVENT = 'app-command-bar-open-change' as const;
/** Ask {@link ClipboardHistoryHost} to open the clipboard panel (spine ⋯ button). */
export const CLIPBOARD_HISTORY_OPEN_EVENT = 'app:clipboard-history-open' as const;
/** Ask {@link ThrowTaskHost} to open the throw-a-task panel (spine ⋯ button). */
export const THROW_TASK_OPEN_EVENT = 'app:throw-task-open' as const;
/**
 * The agent asked the session view panel to render an artifact (table /
 * timeline / ticket thread / reply draft / chart / record) via the
 * `render_artifact` UI tool. Detail payload is a {@link SessionArtifactInput}
 * (src/lib/assistant/ui-artifacts.ts). Surfaces without an artifact panel
 * simply have no listener — the event evaporates harmlessly.
 */
export const SESSION_ARTIFACT_EVENT = 'app:session-artifact' as const;
/**
 * The agent OPENED a `render_artifact` tool block — the payload is still
 * streaming. Detail is `{ pending: boolean }`: `true` holds a placeholder slot
 * at the head of the artifact stack so the panel paints immediately instead of
 * a whole message later, `false` releases it (turn aborted, failed, or ended
 * without an artifact).
 */
export const SESSION_ARTIFACT_PENDING_EVENT = 'app:session-artifact-pending' as const;
