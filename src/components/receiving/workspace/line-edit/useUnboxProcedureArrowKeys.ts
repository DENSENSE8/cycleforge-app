'use client';

/**
 * ← / → pages the Unbox procedure pointer when focus is not in a text field.
 * Complements {@link UnboxProcedurePager} + checklist click → focusStep.
 */

import { useEffect } from 'react';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { isKeyboardRegionOwner } from '@/lib/keyboard/keyboard-region-owner';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function useUnboxProcedureArrowKeys(row: ReceivingLineRow) {
  const { prevStep, nextNeighbour, settled, focusStep } = useUnboxProcedureSteps(row);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableKeyTarget(e.target)) return;
      // Displays owns ← → while Right is the keyboard region (pointer / open).
      if (isKeyboardRegionOwner('right')) return;
      if (!settled) return;

      const step = e.key === 'ArrowLeft' ? prevStep : nextNeighbour;
      if (!step) return;

      e.preventDefault();
      focusStep(step.key);
      setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settled, prevStep, nextNeighbour, focusStep]);
}
