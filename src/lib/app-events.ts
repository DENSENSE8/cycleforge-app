/**
 * App-wide custom DOM event names.
 *
 * Prefer these constants over string literals so typos become compile errors
 * and renames stay greppable.
 */

/** Cross-surface data refresh (tables, rails, dashboards). */
export const APP_REFRESH_DATA = 'app-refresh-data' as const;

export const AI_CHAT_PROMPT_EVENT = 'app:ai-chat-prompt' as const;
export const AI_CHAT_NEW_EVENT = 'app:ai-chat-new' as const;
export const ASSISTANT_HIGHLIGHT_EVENT = 'app:assistant-highlight' as const;
export const COMMAND_BAR_OPEN_EVENT = 'app-command-bar-open' as const;
