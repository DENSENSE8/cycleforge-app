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

/**
 * Toggle the MasterNav spine.
 *
 * The toggle renders in TWO places that are the SAME screen position: the
 * GlobalHeader nav cluster while the spine is closed, and the spine's own top
 * row while it is open. `ResponsiveLayout` owns `navOpen`, so an event is how
 * the spine's copy reaches it — the same idiom the Search row uses for the
 * palette.
 */
export const MASTER_NAV_TOGGLE_EVENT = 'app:master-nav-toggle' as const;
/** Fired when the find dialog opens or closes — header icon pressed state. */
export const COMMAND_BAR_OPEN_CHANGE_EVENT = 'app-command-bar-open-change' as const;
/** Ask {@link ClipboardHistoryHost} to open the clipboard panel (spine ⋯ button). */
export const CLIPBOARD_HISTORY_OPEN_EVENT = 'app:clipboard-history-open' as const;
/** Ask {@link ThrowTaskHost} to open the throw-a-task panel (spine ⋯ button). */
export const THROW_TASK_OPEN_EVENT = 'app:throw-task-open' as const;
