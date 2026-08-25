'use client';

/**
 * React waist over the keybinding registry.
 *
 * Two hooks and nothing else:
 *
 *  - {@link useKeybindingListener} — mount ONCE, app-wide. It is the single
 *    `window` `keydown` listener the registry dispatches through, replacing the
 *    per-feature listener that 56 files each mount today.
 *  - {@link useKeybinding} — register one binding for the lifetime of a
 *    component, for surface- and tool-scoped chords that only exist while their
 *    surface does.
 *
 * `run` is held in a ref and the registration is keyed on the STABLE half
 * (`id`, `chord`, `scope`, `label`), so a call site that passes an inline arrow
 * does not re-register on every render. That is the same defect
 * `useScanDock`'s dependency array carries — a function and a ReactNode in the
 * deps re-registering the policy on every render of every natural call site —
 * and it is fixed here before the first adopter, not after.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAnyOverlayOpen } from '@/lib/overlay-stack/useOverlayStack';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import {
  dispatchKeybinding,
  getServerKeybindings,
  listKeybindings,
  registerKeybinding,
  subscribeKeybindings,
  type Keybinding,
  type KeybindingInput,
} from '@/lib/keybindings/registry';

/**
 * The app's ONE keydown listener. Mount from the shell, never from a route.
 *
 * Bubble phase, deliberately: an open popover / dialog owns the keyboard while
 * it is up, and `useAnyOverlayOpen` is how the rest of this app already asks.
 * Capture would jump the overlay stack and dismiss the wrong thing.
 */
export function useKeybindingListener(): void {
  const overlayOpen = useAnyOverlayOpen();
  const overlayRef = useRef(overlayOpen);
  overlayRef.current = overlayOpen;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      dispatchKeybinding(event, {
        isEditableTarget: isEditableKeyTarget(event.target),
        overlayOpen: overlayRef.current,
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/**
 * Register one binding while this component is mounted.
 *
 * `enabled: false` makes no claim at all — the chord falls through to whatever
 * lower-scope binding wants it, which is what a disarmed tool tile should do.
 */
export function useKeybinding(
  input: KeybindingInput & { enabled?: boolean },
): void {
  const { id, chord, label, scope, allowInEditable, enabled = true } = input;

  // The volatile half. A call site that passes `() => openTool(...)` inline
  // must not re-register on every render.
  const runRef = useRef(input.run);
  runRef.current = input.run;
  const whenRef = useRef(input.when);
  whenRef.current = input.when;

  useEffect(() => {
    if (!enabled) return undefined;
    return registerKeybinding({
      id,
      chord,
      label,
      scope,
      allowInEditable,
      when: () => (whenRef.current ? whenRef.current() : true),
      run: () => runRef.current(),
    });
  }, [id, chord, label, scope, allowInEditable, enabled]);
}

/** Every registered binding — for a shortcuts sheet or a rebinding surface. */
export function useKeybindings(): readonly Keybinding[] {
  return useSyncExternalStore(subscribeKeybindings, listKeybindings, getServerKeybindings);
}
