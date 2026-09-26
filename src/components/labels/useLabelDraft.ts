'use client';

import { useEffect, useState } from 'react';

/** Draft state for a label editor: */
export function useLabelDraft<T extends object>(defaults: T, open: boolean) {
  const [draft, setDraft] = useState<T>(defaults);

  useEffect(() => {
    if (open) setDraft(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof T>(key: K, value: T[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return { draft, setDraft, set };
}
