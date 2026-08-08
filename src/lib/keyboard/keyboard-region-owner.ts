/**
 * Keyboard region owner — which frame column owns horizontal / focus feedback
 * keys after a pointer claim (or nav-keys arm).
 *
 * Complements {@link list-key-scope} (↑↓ yield while Displays is *open*) and
 * {@link nav-keys} (⌘; letter teleport). This waist answers: after the operator
 * clicks Displays, do ← → edit Displays history — or still page Middle
 * procedure?
 *
 *   pointer into Right  → owner = right  (paint focus face; ← → = Displays)
 *   pointer into Middle → owner = middle (procedure ← → resume)
 *
 * DOM: stamp {@link KEYBOARD_REGION_ATTR} on each region root; when that region
 * is the owner, also stamp {@link KEYBOARD_REGION_ACTIVE_ATTR} for CSS / guards.
 */

import type { NavRegionId } from '@/lib/keyboard/nav-keys/nav-regions';

export const KEYBOARD_REGION_ATTR = 'data-keyboard-region';
/** Present on the owning region's root while it holds keyboard focus feedback. */
export const KEYBOARD_REGION_ACTIVE_ATTR = 'data-keyboard-region-active';

let owner: NavRegionId | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getKeyboardRegionOwner(): NavRegionId | null {
  return owner;
}

/** SSR / first paint — nothing claimed. */
export function getServerKeyboardRegionOwner(): NavRegionId | null {
  return null;
}

export function setKeyboardRegionOwner(next: NavRegionId | null): void {
  if (owner === next) return;
  owner = next;
  emit();
}

export function subscribeKeyboardRegionOwner(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isKeyboardRegionOwner(id: NavRegionId): boolean {
  return owner === id;
}
