'use client';

import { useEffect, useRef } from 'react';

/** "Is this render an entity→entity swap inside an ALREADY-OPEN overlay?" */
export function useOverlaySwapHardCut(overlayOpen: boolean): boolean {
  const committedOpenRef = useRef(false);
  const hardCut = overlayOpen && committedOpenRef.current;
  useEffect(() => {
    committedOpenRef.current = overlayOpen;
  });
  return hardCut;
}
