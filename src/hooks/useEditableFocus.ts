'use client';

import { useSyncExternalStore } from 'react';
import { isEditableActiveElement } from '@/lib/keyboard/is-editable-key-target';

function subscribe(onChange: () => void): () => void {
  // `focusout` runs with activeElement already on <body>; `focusin` on the new field.
  document.addEventListener('focusin', onChange);
  document.addEventListener('focusout', onChange);
  return () => {
    document.removeEventListener('focusin', onChange);
    document.removeEventListener('focusout', onChange);
  };
}

/**
 * True while a text field (input, textarea, select, contenteditable, textbox
 * role) holds focus — the same predicate bare-letter keys stand down on, so a
 * painted keycap hides exactly when its key would type instead.
 */
export function useEditableFocus(): boolean {
  return useSyncExternalStore(subscribe, isEditableActiveElement, () => false);
}
