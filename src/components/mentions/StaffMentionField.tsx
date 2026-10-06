'use client';

/**
 * The ONE `@staff` mention grammar for a composer textarea — order notes and
 * the global New ticket both mount it. The textarea edits the friendly face
 * (`@Ana`); the picks ride beside it and `encodeNoteMentions` turns the face
 * into stored `@[Name](staff:ID)` tokens (`@/lib/orders/note-mentions`).
 *
 * Keys while the list is open: ↑/↓ walk, Tab or Enter fills the name, Esc
 * closes. Motion: the active-row highlight travels between rows (shared
 * `layoutId`), and on a pick the staffer's avatar flies from the row into the
 * host's {@link StaffMentionChips} strip while the name types in (Motion+
 * `Typewriter`). Reduced motion drops both to a cut.
 */

import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AtSign } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { Typewriter } from '@/design-system/motion/plus';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import {
  activeMentionQuery,
  encodeNoteMentions,
  parseNoteMentions,
  type PickedMention,
} from '@/lib/orders/note-mentions';
import type { StaffRecipient } from '@/lib/staff/staff-recipient';
import { cn } from '@/utils/_cn';

const MENTION_LIMIT = 6;

/** The staff picker roster — fetched the first time a `@` opens the list. */
function useStaffRoster(enabled: boolean) {
  return useQuery({
    queryKey: ['staff-picker'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StaffRecipient[]> => {
      const res = await fetch('/api/auth/staff-picker', { cache: 'no-store' });
      if (!res.ok) throw new Error(`staff ${res.status}`);
      const data = (await res.json()) as { staff?: StaffRecipient[] };
      return data.staff ?? [];
    },
  });
}

export interface StaffMentionField {
  /** Picks so far (state, for painting); `pickedRef` is the same list for synchronous encode. */
  picked: readonly PickedMention[];
  pickedRef: MutableRefObject<PickedMention[]>;
  open: boolean;
  matches: readonly StaffRecipient[];
  active: number;
  setActive: (index: number) => void;
  listId: string;
  /** Prefix for the shared `layoutId`s — one per field, so two composers never cross-animate. */
  layoutScope: string;
  /** Call from the textarea's `onChange`. */
  sync: (text: string, caret: number) => void;
  /** Call from `onSelect` — a caret move re-reads the query only while the list is open. */
  onSelect: (el: HTMLTextAreaElement) => void;
  /** Call first in `onKeyDown`; `true` means the list consumed the key. */
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Close the list (a blur: delay it so a listbox click picks first). */
  dismiss: () => void;
  pick: (staff: StaffRecipient) => void;
  /** Replace the picks (a reseeded or cleared draft). */
  reset: (picked: PickedMention[]) => void;
  /** Textarea ARIA for the combobox pattern. */
  ariaProps: {
    'aria-autocomplete': 'list';
    'aria-expanded': boolean;
    'aria-controls': string | undefined;
    'aria-activedescendant': string | undefined;
  };
}

export function useStaffMentionField({
  areaRef,
  textRef,
  onText,
  initialPicked = [],
  prefetch = false,
}: {
  areaRef: RefObject<HTMLTextAreaElement | null>;
  /** The live face text (the host keeps it in a ref so a pick never reads a stale render). */
  textRef: RefObject<string>;
  /** The host writes the new face (state + its ref). */
  onText: (next: string) => void;
  initialPicked?: PickedMention[];
  /** Load the roster on mount so the first `@` paints instantly (a composer opened to write, not a passive field). */
  prefetch?: boolean;
}): StaffMentionField {
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<PickedMention[]>(initialPicked);
  const pickedRef = useRef<PickedMention[]>(initialPicked);
  const roster = useStaffRoster(prefetch || mention !== null);
  const listId = useId();
  const layoutScope = useId();

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.trim().toLowerCase();
    return (roster.data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, MENTION_LIMIT);
  }, [mention, roster.data]);

  const open = mention !== null && matches.length > 0;

  const sync = useCallback((text: string, caret: number) => {
    setMention(activeMentionQuery(text, caret));
    setActive(0);
  }, []);

  const reset = useCallback((next: PickedMention[]) => {
    pickedRef.current = next;
    setPicked(next);
  }, []);

  const pick = useCallback(
    (staff: StaffRecipient) => {
      const area = areaRef.current;
      if (!area || !mention) return;
      const name = staff.name.trim();
      const text = textRef.current ?? '';
      const caret = area.selectionStart ?? text.length;
      const insert = `@${name} `;
      const next = text.slice(0, mention.start) + insert + text.slice(caret);
      if (!pickedRef.current.some((p) => p.staffId === staff.id)) {
        reset([...pickedRef.current, { staffId: staff.id, name }]);
      }
      onText(next);
      setMention(null);
      const at = mention.start + insert.length;
      requestAnimationFrame(() => {
        area.focus();
        area.setSelectionRange(at, at);
      });
    },
    [areaRef, mention, onText, reset, textRef],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!open) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + matches.length) % matches.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        pick(matches[active] ?? matches[0]);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMention(null);
        return true;
      }
      return false;
    },
    [active, matches, open, pick],
  );

  return {
    picked,
    pickedRef,
    open,
    matches,
    active,
    setActive,
    listId,
    layoutScope,
    sync,
    onSelect: (el) => {
      if (mention) sync(el.value, el.selectionStart ?? el.value.length);
    },
    onKeyDown,
    dismiss: () => setTimeout(() => setMention(null), 150),
    pick,
    reset,
    ariaProps: {
      'aria-autocomplete': 'list',
      'aria-expanded': open,
      'aria-controls': open ? listId : undefined,
      'aria-activedescendant': open ? `${listId}-${active}` : undefined,
    },
  };
}

const avatarLayoutId = (scope: string, staffId: number) => `${scope}-mention-avatar-${staffId}`;

/** The suggestion list under the textarea — position it from the host (`absolute … top-full`). */
export function StaffMentionListbox({ field, className }: { field: StaffMentionField; className?: string }) {
  const presence = useMotionPresence(motionPresence.dropdownPanel);
  const panelTransition = useMotionTransition(motionTransition.dropdownOpen);
  const track = useMotionTransition(motionTransition.armedTrack);
  const fly = useMotionTransition(motionTransition.chipColumnLayout);
  return (
    <AnimatePresence>
      {field.open ? (
        <motion.ul
          key="staff-mentions"
          id={field.listId}
          role="listbox"
          aria-label="Mention staff"
          initial={presence.initial}
          animate={presence.animate}
          exit={presence.exit}
          transition={panelTransition}
          className={cn(
            'z-20 w-60 overflow-hidden rounded-mode-control border border-mode-edge bg-mode-panel py-1 shadow-lg',
            className,
          )}
        >
          {field.matches.map((s, i) => (
            <li
              key={s.id}
              id={`${field.listId}-${i}`}
              role="option"
              aria-selected={i === field.active}
              onMouseDown={(event) => {
                event.preventDefault();
                field.pick(s);
              }}
              onMouseEnter={() => field.setActive(i)}
              className="relative flex cursor-pointer items-center gap-2 px-2 py-1 text-role-caption text-mode-ink"
            >
              {i === field.active ? (
                <motion.span
                  layoutId={`${field.layoutScope}-mention-active`}
                  transition={track}
                  aria-hidden
                  className="absolute inset-x-1 inset-y-0 rounded-mode-control bg-mode-hover"
                />
              ) : null}
              <motion.span
                layoutId={field.picked.some((p) => p.staffId === s.id) ? undefined : avatarLayoutId(field.layoutScope, s.id)}
                transition={fly}
                className="relative inline-flex"
              >
                <StaffAvatar staffId={s.id} name={s.name} colorHex={s.color_hex} size="xs" />
              </motion.span>
              <span className="relative min-w-0 flex-1 truncate">{s.name}</span>
            </li>
          ))}
        </motion.ul>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * The staff a draft will notify — only picks whose `@Name` is still in `text`
 * (the same rule `encodeNoteMentions` applies on save). A new pick lands with
 * its avatar flown in from the list row and its name typed.
 */
export function StaffMentionChips({ field, text, className }: { field: StaffMentionField; text: string; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  const fly = useMotionTransition(motionTransition.chipColumnLayout);
  const live = useMemo(() => {
    const ids = new Set(parseNoteMentions(encodeNoteMentions(text, field.picked)));
    return field.picked.filter((p) => ids.has(p.staffId));
  }, [field.picked, text]);
  if (live.length === 0) return null;
  return (
    <ul aria-label="Mentioned staff" className={cn('flex min-w-0 flex-wrap items-center gap-1', className)} data-testid="staff-mention-chips">
      <li aria-hidden className="text-role-micro text-text-faint">
        <AtSign className="h-3 w-3" />
      </li>
      <AnimatePresence initial={false}>
        {live.map((p) => (
          <motion.li
            key={p.staffId}
            layout
            transition={fly}
            exit={reduced ? undefined : { opacity: 0, scale: 0.9 }}
            className="inline-flex items-center gap-1 rounded-full border border-border-soft bg-surface-sunken py-0.5 pl-0.5 pr-2 text-role-micro font-semibold text-text-default"
            data-staff-id={p.staffId}
          >
            <motion.span layoutId={avatarLayoutId(field.layoutScope, p.staffId)} transition={fly} className="inline-flex">
              <StaffAvatar staffId={p.staffId} name={p.name} size="xs" />
            </motion.span>
            {reduced ? p.name : <Typewriter speed="fast">{p.name}</Typewriter>}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
