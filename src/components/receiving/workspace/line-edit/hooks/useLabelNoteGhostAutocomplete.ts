'use client';

/**
 * Ghost (inline) autocomplete for Unbox label / item-note drafts.
 *
 * Shared by the bubble {@link LineNotesCard} composer and any flush field that
 * still wants the same MRU bank ({@link label-note-phrases}).
 */

import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import {
  labelNoteGhostSuffix,
  matchLabelNotePhrase,
  rememberLabelNotePhrase,
} from '@/lib/receiving/label-note-phrases';
import { focusTextEnd } from '../../note-composer-helpers';

export function useLabelNoteGhostAutocomplete({
  value,
  onChange,
  previousLineNotes,
  inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  previousLineNotes?: string;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  /** Escape clears the ghost without blur; typing resets dismissal. */
  const [ghostDismissed, setGhostDismissed] = useState(false);
  const trimmedPrevious = (previousLineNotes || '').trim();

  const matchedPhrase = useMemo(() => {
    if (ghostDismissed || !value) return null;
    return matchLabelNotePhrase(value, [trimmedPrevious || null]);
  }, [ghostDismissed, value, trimmedPrevious]);

  const ghostSuffix = labelNoteGhostSuffix(value, matchedPhrase);

  const acceptGhost = useCallback(() => {
    if (!matchedPhrase) return false;
    onChange(matchedPhrase);
    setGhostDismissed(true);
    requestAnimationFrame(() => focusTextEnd(inputRef.current));
    return true;
  }, [matchedPhrase, onChange, inputRef]);

  const dismissGhost = useCallback(() => {
    setGhostDismissed(true);
  }, []);

  const clearGhostDismissal = useCallback(() => {
    setGhostDismissed(false);
  }, []);

  const onValueChange = useCallback(
    (next: string) => {
      setGhostDismissed(false);
      onChange(next);
    },
    [onChange],
  );

  /**
   * Persist helper — call after a successful write so the MRU bank learns.
   * Returns whether `wrote` was true (passthrough).
   */
  const rememberIfWrote = useCallback((phrase: string, wrote: boolean) => {
    if (wrote) rememberLabelNotePhrase(phrase);
    return wrote;
  }, []);

  /**
   * Key handling for caret-at-end ghost accept / Escape dismiss.
   * Returns true when the event was handled (caller should skip default).
   * Does **not** handle Enter — the composer owns commit.
   */
  const handleGhostKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const caretAtEnd =
        el.selectionStart === el.selectionEnd && el.selectionEnd === el.value.length;

      if (ghostSuffix && caretAtEnd && (e.key === 'Tab' || e.key === 'ArrowRight')) {
        e.preventDefault();
        acceptGhost();
        return true;
      }

      if (e.key === 'Escape') {
        if (ghostSuffix) {
          e.preventDefault();
          dismissGhost();
          return true;
        }
      }

      return false;
    },
    [ghostSuffix, acceptGhost, dismissGhost],
  );

  /**
   * Before Enter commit: if a ghost is showing and caret is at end, accept it
   * and return the full phrase so the caller can persist the accepted value.
   */
  const resolveCommitValue = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null): string => {
      if (!el || !ghostSuffix || !matchedPhrase) return value;
      const caretAtEnd =
        el.selectionStart === el.selectionEnd && el.selectionEnd === el.value.length;
      if (!caretAtEnd) return value;
      onChange(matchedPhrase);
      setGhostDismissed(true);
      return matchedPhrase;
    },
    [ghostSuffix, matchedPhrase, value, onChange],
  );

  return {
    matchedPhrase,
    ghostSuffix,
    acceptGhost,
    dismissGhost,
    clearGhostDismissal,
    onValueChange,
    rememberIfWrote,
    handleGhostKeyDown,
    resolveCommitValue,
  };
}
