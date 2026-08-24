/**
 * Trigger mapping — prefix keys halt plain text and open a contextual
 * typeahead. Bare identifiers (scanner or typed) are the default order route.
 */

import { looksLikeIdentifier } from '@/lib/search/search-hit';

export type ComposerTriggerKind = 'order' | 'user' | 'action' | 'bare_identifier';

export interface ComposerTriggerMatch {
  readonly kind: ComposerTriggerKind;
  readonly query: string;
  /** UTF-16 offset in `textBeforeCursor` where the trigger token starts. */
  readonly start: number;
}

const PREFIX: ReadonlyArray<{ char: string; kind: Exclude<ComposerTriggerKind, 'bare_identifier'> }> = [
  { char: '#', kind: 'order' },
  { char: '@', kind: 'user' },
  { char: '/', kind: 'action' },
];

/**
 * Read the token at the caret. Prefix characters (`#` orders, `@` users, `/`
 * actions) win; otherwise a trailing identifier-shaped token is a bare order
 * query (the scanner path — no prefix required).
 */
export function matchComposerTrigger(textBeforeCursor: string): ComposerTriggerMatch | null {
  const text = textBeforeCursor;
  if (!text) return null;

  // Walk backward to the start of the current token (whitespace-delimited).
  let tokenStart = text.length;
  while (tokenStart > 0 && !/\s/.test(text[tokenStart - 1]!)) tokenStart -= 1;
  const token = text.slice(tokenStart);
  if (!token) return null;

  for (const { char, kind } of PREFIX) {
    if (token.startsWith(char)) {
      return { kind, query: token.slice(char.length), start: tokenStart };
    }
  }

  if (looksLikeIdentifier(token)) {
    return { kind: 'bare_identifier', query: token, start: tokenStart };
  }

  return null;
}
