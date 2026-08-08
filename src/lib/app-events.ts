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
/** Ask {@link ClipboardHistoryHost} to open the clipboard panel (spine ⋯ button). */
export const CLIPBOARD_HISTORY_OPEN_EVENT = 'app:clipboard-history-open' as const;
/** Ask {@link ThrowTaskHost} to open the throw-a-task panel (spine ⋯ button). */
export const THROW_TASK_OPEN_EVENT = 'app:throw-task-open' as const;
