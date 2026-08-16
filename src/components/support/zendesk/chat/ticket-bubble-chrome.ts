/**
 * Ticket conversation chrome — compatibility aliases over the hard DS SoT
 * {@link conversation-chrome} / {@link ConversationMessageCard}.
 *
 * Prefer importing from `@/design-system/primitives` for new code. These
 * `TICKET_*` names remain so existing helpdesk hosts keep compiling while
 * call sites migrate.
 */
export {
  CONVERSATION_BODY as TICKET_BUBBLE_BODY,
  CONVERSATION_DAY_HEADER as TICKET_BUBBLE_DAY_HEADER,
  CONVERSATION_MARK as TICKET_BUBBLE_MARK,
  CONVERSATION_MARK_BOX as TICKET_BUBBLE_MARK_BOX,
  CONVERSATION_META as TICKET_BUBBLE_META,
  CONVERSATION_SHELL as TICKET_BUBBLE_SHELL,
  CONVERSATION_SHELL_INTERNAL as TICKET_BUBBLE_SHELL_INTERNAL,
  CONVERSATION_STREAM as TICKET_BUBBLE_STREAM,
  conversationShell as ticketBubbleShell,
  formatConversationAge as formatTicketBubbleAge,
} from '@/design-system/primitives/conversation-chrome';
