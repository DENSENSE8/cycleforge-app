'use client';

/**
 * Station Displays — keyboard-armed verb rows (Photos golden twin).
 *
 * Pure presentation: ↑↓ / Home / End via {@link useArmedCursorList}; Enter /
 * Space / pointerdown commits (mouse = keyboard). Hosts supply verb ids +
 * labels + onCommit. Esc stays on {@link StationDisplaysPushStack}.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronRight } from '@/components/Icons';
import { useReducedMotion } from '@/design-system/motion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';
import { NAV_KEY_HINT_CLASS, useNavRegion } from '@/lib/keyboard/nav-keys';
import { useKeyboardRegionOwner } from '@/lib/keyboard/useKeyboardRegionOwner';
import { cn } from '@/utils/_cn';
import {
  ARMED_CURSOR_CHEVRON_CLASS,
  ARMED_CURSOR_MARKER_PULSE_CLASS,
  ARMED_CURSOR_TRACK_CLASS,
} from './armed-cursor-face';
import { useArmedCursorList } from './useArmedCursorList';

export type StationArmedVerb = {
  id: string;
  label: string;
  icon: (p: { className?: string }) => ReactNode;
  disabled?: boolean;
  /** Stable nav-keys letter while Right is armed (P3 second layer). */
  preferredKey?: string;
  /** Optional secondary fact under the label (Inventory trust rows). */
  subtitle?: string;
};

export function StationArmedVerbList({
  verbs,
  onCommit,
  listLabel,
  testId,
  activeId = null,
  onArm,
}: {
  verbs: readonly StationArmedVerb[];
  onCommit: (id: string) => void;
  listLabel: string;
  testId: string;
  /** Last committed id — seeds the armed cursor (Look live-preview). */
  activeId?: string | null;
  /** Fires when the armed cursor moves — live preview, not a second commit path. */
  onArm?: (id: string) => void;
}) {
  const orderedIds = useMemo(() => verbs.map((v) => v.id), [verbs]);
  const verbById = useMemo(() => new Map(verbs.map((v) => [v.id, v])), [verbs]);

  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const listId = useId();

  const reduce = useReducedMotion();
  const markerPulse = reduce ? undefined : ARMED_CURSOR_MARKER_PULSE_CLASS;
  const { isOwner: isKeyboardRegion } = useKeyboardRegionOwner();
  const rightOwnsKeyboard = isKeyboardRegion('right');

  const {
    cursorId,
    setCursorId,
    commitArmed,
    handleCommitPointerDown,
    handleCommitClick,
    handleNavKeyDown,
  } = useArmedCursorList({
    orderedIds,
    activeId,
    rootRef,
    rowRefs,
    regionActive: rightOwnsKeyboard,
  });

  const onArmRef = useRef(onArm);
  onArmRef.current = onArm;
  useEffect(() => {
    if (cursorId) onArmRef.current?.(cursorId);
  }, [cursorId]);

  const run = useCallback(
    (id: string) => {
      const verb = verbById.get(id);
      if (!verb || verb.disabled) return;
      onCommit(id);
    },
    [onCommit, verbById],
  );

  // P3 second armed layer — letters teleport + commit while this leaf owns Right.
  const rightTargets = useMemo(
    () =>
      verbs.map((v) => ({
        id: v.id,
        preferredKey: v.preferredKey ?? null,
      })),
    [verbs],
  );
  const { armed: regionArmed, keymap: navKeymap } = useNavRegion({
    id: 'right',
    targets: rightTargets,
    onCommit: (targetId) => commitArmed(targetId, run),
  });

  const onRowKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const verb = verbById.get(id);
        if (verb?.disabled) return;
        commitArmed(id, run);
        return;
      }
      handleNavKeyDown(e, id);
    },
    [commitArmed, handleNavKeyDown, run, verbById],
  );

  return (
    <div
      ref={rootRef}
      data-station-action-dossier=""
      data-testid={testId}
      {...{ [LIST_KEY_OWNER_ATTR]: '' }}
      tabIndex={-1}
      className="min-h-0 flex-1 overflow-y-auto outline-none"
    >
      <ul
        aria-labelledby={listId}
        className="divide-y divide-border-hairline border-y border-border-hairline"
      >
        <li className="sr-only">
          <h3 id={listId}>{listLabel}</h3>
        </li>
        {verbs.map((verb) => {
          const isArmed = cursorId != null && cursorId === verb.id;
          const Icon = verb.icon;
          const navLetter = regionArmed ? navKeymap.get(verb.id) : undefined;
          return (
            <li key={verb.id}>
              <button
                type="button"
                ref={(el) => {
                  if (el) rowRefs.current.set(verb.id, el);
                  else rowRefs.current.delete(verb.id);
                }}
                disabled={verb.disabled}
                onPointerDown={(e) => {
                  if (verb.disabled) return;
                  handleCommitPointerDown(e, verb.id, run);
                }}
                onClick={() => {
                  if (verb.disabled) return;
                  handleCommitClick(verb.id, run);
                }}
                onFocus={() => setCursorId(verb.id)}
                onKeyDown={(e) => onRowKeyDown(e, verb.id)}
                className={cn(
                  'group/row ds-raw-button relative flex w-full items-center gap-2 py-3 pl-3 pr-3 text-left',
                  'hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-40',
                  // Armed face = `>` + bottom track. ds-allow-focus
                  isArmed ? 'outline-none' : focusRing('control', 'accent'),
                  cornerClass('flush'),
                )}
                data-testid={`${testId}-${verb.id}`}
                data-active={isArmed ? 'true' : undefined}
                aria-current={isArmed ? 'true' : undefined}
                aria-keyshortcuts={navLetter ?? undefined}
              >
                {isArmed ? (
                  <span
                    className={cn(ARMED_CURSOR_TRACK_CLASS, markerPulse)}
                    aria-hidden
                  />
                ) : null}
                <span className="relative z-raised flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  {isArmed ? (
                    <span aria-hidden>
                      <ChevronRight
                        className={cn(
                          ARMED_CURSOR_CHEVRON_CLASS,
                          markerPulse,
                        )}
                      />
                    </span>
                  ) : null}
                  <Icon className="h-4 w-4 shrink-0 text-accent-bg" />
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate text-role-caption font-semibold text-text-default">
                      {verb.label}
                    </span>
                    {verb.subtitle ? (
                      <span className="mt-0.5 block truncate text-role-micro text-text-muted">
                        {verb.subtitle}
                      </span>
                    ) : null}
                  </span>
                </span>
                {navLetter ? (
                  <span className={NAV_KEY_HINT_CLASS} aria-hidden>
                    {navLetter}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
