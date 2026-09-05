'use client';

import { useEffect, useState } from 'react';

/**
 * `true` only where a real pointer exists — a desk with a mouse or trackpad.
 *
 * The gate for every cursor-layer decoration. A floor station is a mounted
 * touchscreen worked by a gloved hand: `(pointer: fine)` is false there, so the
 * layer never mounts, never listens for `pointermove`, and costs the scan path
 * nothing.
 *
 * Starts `false` on purpose. `matchMedia` does not exist during SSR, so
 * returning anything else would paint a cursor on the server that the client
 * then contradicts — a hydration mismatch on a fixed, full-viewport layer.
 * First client effect settles it.
 */
export function usePointerFine(): boolean {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(pointer: fine)');
    setFine(query.matches);
    const onChange = (event: MediaQueryListEvent) => setFine(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return fine;
}
