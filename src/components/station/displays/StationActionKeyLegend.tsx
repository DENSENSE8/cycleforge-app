'use client';

/**
 * Station Action Plane — persistent key-legend floor for Displays leaves.
 *
 * Leaf-scoped F-keys / modifiers. Skips when focus is on an editable
 * (aligns with {@link useWedgeScanner} `isEditable` skip). Esc stays on
 * {@link StationDisplaysPushStack} — do not bind Escape here.
 *
 * Not desk {@link InspectorActionFloor}. Law: Station Action vs Context planes.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { FlushTerminalFooter } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export type StationActionKeyBinding = {
  /** Operator-facing chord, e.g. `F2` or `⌘S`. */
  chord: string;
  label: string;
  /** KeyboardEvent.code when matching (e.g. `F2`, `KeyS`). */
  code: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  disabled?: boolean;
  onAction: () => void;
};

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function matchBinding(e: KeyboardEvent, b: StationActionKeyBinding): boolean {
  if (b.disabled) return false;
  if (e.code !== b.code) return false;
  if (Boolean(b.metaKey) !== e.metaKey) return false;
  if (Boolean(b.ctrlKey) !== e.ctrlKey) return false;
  if (Boolean(b.shiftKey) !== e.shiftKey) return false;
  // Allow Alt only when not required (we never require Alt).
  if (e.altKey) return false;
  return true;
}

/**
 * Wire leaf keybindings. Capture-phase; skips editables and when disabled.
 * Does not handle Escape (Displays stack owns Esc).
 */
export function useStationActionKeyBindings(
  bindings: StationActionKeyBinding[],
  enabled = true,
): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      for (const b of bindingsRef.current) {
        if (!matchBinding(e, b)) continue;
        e.preventDefault();
        e.stopPropagation();
        try {
          b.onAction();
        } catch {
          /* leaf handler errors must not break the listener */
        }
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}

export function StationActionKeyLegend({
  bindings,
  leading,
  className,
  'data-testid': testId = 'station-action-key-legend',
}: {
  bindings: StationActionKeyBinding[];
  leading?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  if (bindings.length === 0 && leading == null) return null;

  return (
    <FlushTerminalFooter
      layout="cluster"
      leading={leading}
      className={cn(className)}
      data-testid={testId}
    >
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5"
        data-testid={`${testId}-chords`}
      >
        {bindings.map((b) => (
          <span
            key={`${b.chord}-${b.label}`}
            className={cn(
              'inline-flex items-baseline gap-1 text-role-micro font-medium text-text-muted',
              b.disabled && 'opacity-40',
            )}
          >
            <kbd className="rounded-none border border-border-hairline bg-surface-sunken px-1 py-0.5 font-mono text-role-micro text-text-default">
              {b.chord}
            </kbd>
            <span>{b.label}</span>
          </span>
        ))}
      </div>
    </FlushTerminalFooter>
  );
}
