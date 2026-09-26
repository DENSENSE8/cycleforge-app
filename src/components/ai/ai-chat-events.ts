'use client';

/** Cross-tree bridge for /ai-chat. */
export {
  AI_CHAT_PROMPT_EVENT,
  AI_CHAT_NEW_EVENT,
} from '@/lib/app-events';
import {
  AI_CHAT_PROMPT_EVENT,
  AI_CHAT_NEW_EVENT,
} from '@/lib/app-events';

/** Sidebar → page: send an example prompt into the chat. */
export function emitAiChatPrompt(prompt: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<string>(AI_CHAT_PROMPT_EVENT, { detail: prompt }));
}

/** Sidebar → page: start a fresh conversation. */
export function emitAiChatNew(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AI_CHAT_NEW_EVENT));
}
