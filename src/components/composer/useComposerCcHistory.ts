'use client';

/**
 * Public-CC chips for every ticket mouth that has an audience row.
 *
 * The claim rail used to be the only surface that restored
 * {@link readComposerCcHistory}. {@link StationComposerHost} Ticket mode
 * (Unbox, Testing, Triage, and any peer that mounts {@link LineNotesCard})
 * and {@link useTicketComposer} (console / host-placed dock) now seed from
 * the same bank, so a public file emails the people already sitting on the
 * ticket — not an empty Cc row.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  COMPOSER_CC_FORM_EVENT,
  publishComposerCcForm,
  readComposerCcHistory,
  rememberComposerCcHistory,
} from '@/lib/composer/ticket-cc';

function sameEmails(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((email, i) => email === b[i]);
}

export function useComposerCcHistory(opts: {
  /** Carton / ticket identity — reseeds chips from history when it changes. */
  identityKey: string | number | null | undefined;
  /** When false, leave the chips alone (closed claim rail). Default true. */
  active?: boolean;
}): {
  ccs: string[];
  setCcs: (next: string[]) => void;
  ccDraft: string;
  setCcDraft: (next: string) => void;
} {
  const active = opts.active ?? true;
  const [ccs, setCcsState] = useState<string[]>([]);
  const [ccDraft, setCcDraft] = useState('');

  useEffect(() => {
    if (!active) return;
    const seeded = readComposerCcHistory();
    setCcsState(seeded);
    setCcDraft('');
    publishComposerCcForm(seeded);
  }, [active, opts.identityKey]);

  useEffect(() => {
    const onSync = (event: Event) => {
      const next = (event as CustomEvent<string[]>).detail;
      if (!Array.isArray(next)) return;
      setCcsState((prev) => (sameEmails(prev, next) ? prev : next));
    };
    window.addEventListener(COMPOSER_CC_FORM_EVENT, onSync);
    return () => window.removeEventListener(COMPOSER_CC_FORM_EVENT, onSync);
  }, []);

  const setCcs = useCallback((next: string[]) => {
    setCcsState(next);
    rememberComposerCcHistory(next);
    publishComposerCcForm(next);
  }, []);

  return { ccs, setCcs, ccDraft, setCcDraft };
}
