'use client';

/**
 * Global header "+ Add" — three ways in, one list of things to add, in two
 * labelled groups:
 *  - **Outbound** — `S` new sales order, `I` import a Square invoice.
 *  - **Inbound** — `P` new purchase order, `R` new return (both open the
 *    inbound-order form at `/incoming/new?type=…`, whose details differ by type).
 * Every surface paints a small muted group label above each group's rows.
 * The disclosure is the sidebar mode switcher's (NavModeSwitcher):
 *  - **Hover** (mouse) TEACHES the keys: a `KeyHintPopover` hangs under the
 *    pill, flush with its right edge — "Press [C], then" over hotkey-first rows
 *    (`[S] New sales order`, `[P] …`). Never pressed, never shades.
 *  - **Click**: a dropdown anchored under the pill with the grouped list only —
 *    no header row, no keys (hover already taught them); arrows + Enter.
 *  - **`C`** (outside a text field): a small card in the middle of the screen
 *    naming the NEXT key (`S`, `I`, `P`, `R`); Esc cancels. (No Ecwid row:
 *    storefront orders already arrive through the Ecwid API sync — owner
 *    2026-09-27.) Same grammar as `G` then a letter (NavGoKeys); ⌘K stays
 *    find. A scanner burst that starts with `C` never arms: the next wedge key
 *    lands before `C` settles.
 */

import { Fragment, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Plus, Receipt, RotateCcw, ShoppingCart } from '@/components/Icons';
import { KeyHintPopover, type KeyHintAt } from '@/components/sidebar/contextual/NavGoKeys';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { ChordKeys, ChordLeaderScope, KeyboardKey, Layer } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { GO_SCAN_BURST_MS } from '@/lib/keyboard/go-keys';
import { newInboundOrderHref } from '@/lib/inbound/new-inbound-order-path';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { NEW_SALES_ORDER_PATH } from '@/lib/orders/manual-order-draft';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { cn } from '@/utils/_cn';
import { HEADER_PILL_CLASS, TOP_CHROME_ICON_FACE } from './header-shell';

/** `C` waits this long before arming: a scanner burst's next key arrives sooner and cancels it. */
const ARM_SETTLE_MS = GO_SCAN_BURST_MS + 20;
/** How long the card waits for the next key — long enough to read it the first time. */
const ARMED_TIMEOUT_MS = 4000;

/** The leader key that arms the Add sequence. */
const LEADER = 'C';

/** The two groups every surface labels, in order. */
const ADD_GROUPS = ['Outbound', 'Inbound'] as const;
type AddGroup = (typeof ADD_GROUPS)[number];

type AddKey = { key: string; label: string; href: string; icon: ComponentType<{ className?: string }>; group: AddGroup };

/** One flat list (keys never collide: S, I, P, R); grouped for display by `ADD_KEY_GROUPS`. */
const NEXT_KEYS: ReadonlyArray<AddKey> = [
  { key: 's', label: 'New sales order', href: NEW_SALES_ORDER_PATH, icon: ShoppingCart, group: 'Outbound' },
  { key: 'i', label: 'Import a Square invoice', href: `${NEW_SALES_ORDER_PATH}?mode=import`, icon: Receipt, group: 'Outbound' },
  { key: 'p', label: 'New purchase order', href: newInboundOrderHref('PO'), icon: Package, group: 'Inbound' },
  { key: 'r', label: 'New return', href: newInboundOrderHref('RETURN'), icon: RotateCcw, group: 'Inbound' },
];

const ADD_KEY_GROUPS = ADD_GROUPS.map((group) => ({ group, keys: NEXT_KEYS.filter((n) => n.group === group) }));

/** Muted, left-aligned category label above each group — never an item. */
const GROUP_LABEL_CLASS = 'select-none px-2 pb-0.5 pt-1 text-left text-role-micro font-normal text-text-muted';

/** The hover hint's rows — hotkey first, the leader said once in the lead line. */
const HINT_ROWS = NEXT_KEYS.map((n) => ({ id: n.key, keys: [n.key.toUpperCase()], pressedId: `add:${n.key}`, label: n.label, icon: n.icon, group: n.group }));

/** The hover hint's lead line, sentence case: "Press [C], then". */
const HINT_LEAD = (
  <>
    Press <KeyboardKey size="xs">{LEADER}</KeyboardKey> then
  </>
);

export function GlobalHeaderAdd() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hintAt, setHintAt] = useState<KeyHintAt | null>(null);
  const armedRef = useRef(false);
  const timer = useRef<number | null>(null);

  const disarm = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    armedRef.current = false;
    setArmed(false);
  }, []);
  const arm = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    armedRef.current = true;
    setArmed(true);
    timer.current = window.setTimeout(disarm, ARMED_TIMEOUT_MS);
  }, [disarm]);
  const run = useCallback(
    (href: string) => {
      disarm();
      router.push(href);
    },
    [disarm, router],
  );

  useEffect(() => {
    let lastKeyAt = 0;
    let pending: number | null = null;
    const onKeyDown = (event: KeyboardEvent) => {
      const previousAt = lastKeyAt;
      lastKeyAt = event.timeStamp;
      if (pending !== null) {
        window.clearTimeout(pending);
        pending = null;
      }
      // Armed: the next key belongs to the sequence (capture phase, like `G`).
      if (armedRef.current) {
        if (event.key === 'Shift') return;
        const next = NEXT_KEYS.find((n) => n.key === event.key.toLowerCase());
        if (next && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          run(next.href);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          disarm();
        } else {
          disarm();
        }
        return;
      }
      if (
        event.key.toLowerCase() !== 'c'
        || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
        || event.repeat || event.isComposing || event.defaultPrevented
        || event.timeStamp - previousAt < GO_SCAN_BURST_MS
        || isEditableKeyTarget(event.target)
        || hasOpenOverlay()
        || document.querySelector('[role="dialog"][data-state="open"]')
      ) {
        return;
      }
      // No preventDefault: a wedge scan listener still gets this key if a burst follows.
      pending = window.setTimeout(() => {
        pending = null;
        arm();
      }, ARM_SETTLE_MS);
    };
    // A click that is not on the card itself cancels.
    const onPointerDown = (event: PointerEvent) => {
      if (armedRef.current && !(event.target instanceof Element && event.target.closest('[data-add-keys]'))) disarm();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      if (pending !== null) window.clearTimeout(pending);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      disarm();
    };
  }, [arm, disarm, run]);

  useEffect(
    () =>
      registerShortcutOverviewGroup({
        id: 'global-create',
        title: 'Add',
        rows: NEXT_KEYS.map((n) => ({ keys: ['C', n.key.toUpperCase()], label: n.label })),
      }),
    [],
  );

  return (
    <div className="flex h-full shrink-0 items-center px-1">
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open) {
            disarm();
            setHintAt(null);
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Add"
            aria-keyshortcuts="C"
            data-testid="global-add-button"
            onPointerEnter={(event) => {
              if (event.pointerType !== 'mouse' || menuOpen) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setHintAt({ right: window.innerWidth - rect.right, top: rect.bottom + 4 });
            }}
            onPointerLeave={() => setHintAt(null)}
            onPointerDown={() => setHintAt(null)}
            className={cn(HEADER_PILL_CLASS, 'group overflow-hidden pr-3.5')}
          >
            {/* Hover sheen: one light sweep across the pill; off under reduced motion. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-surface-card/80 to-transparent opacity-0 transition-[transform,opacity] duration-500 ease-out group-hover:translate-x-[400%] group-hover:opacity-100 motion-reduce:hidden"
            />
            <Plus className={cn(TOP_CHROME_ICON_FACE, 'relative size-4 transition-transform duration-150 group-hover:rotate-90 motion-reduce:transition-none')} aria-hidden />
            <span className="relative">Add</span>
          </button>
        </DropdownMenuTrigger>
        {/* The grouped list only: group labels, no header row, no keys — hover already taught them. */}
        <DropdownMenuContent align="end" className="min-w-[14rem]" data-testid="global-add-menu">
          {ADD_KEY_GROUPS.map(({ group, keys }, groupIndex) => (
            <Fragment key={group}>
              {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup data-testid={`global-add-menu-group-${group.toLowerCase()}`}>
                <DropdownMenuLabel className={GROUP_LABEL_CLASS}>{group}</DropdownMenuLabel>
                {keys.map((n) => {
                  const Icon = n.icon;
                  return (
                    <DropdownMenuItem
                      key={n.key}
                      onSelect={() => router.push(n.href)}
                      className="cursor-pointer gap-2 text-role-body"
                      data-testid={`global-add-menu-${n.key}`}
                    >
                      <Icon className="size-4 shrink-0 text-text-muted" />
                      {n.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <KeyHintPopover id="add" at={menuOpen ? null : hintAt} rows={HINT_ROWS} lead={HINT_LEAD} />
      <NextKeysCard on={armed} onRun={run} />
    </div>
  );
}

/** The small card in the middle of the screen: which key comes next. */
function NextKeysCard({ on, onRun }: { on: boolean; onRun: (href: string) => void }) {
  const presence = useMotionPresence(motionPresence.dropdownPanel);
  const transition = useMotionTransition(motionTransition.dropdownOpen);
  return (
    <Layer level="command" className="pointer-events-none fixed inset-0 flex items-center justify-center">
      <AnimatePresence>
        {on ? (
          <motion.div
            key="add-keys"
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            role="status"
            aria-live="polite"
            data-add-keys=""
            data-testid="global-add-keys"
            className={cn(
              'pointer-events-auto flex flex-col gap-0.5 border border-border-soft bg-surface-card p-1.5',
              DROPDOWN_SHELL_CORNER,
              elevationClass('raised', 'soft'),
            )}
          >
            <p className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-role-micro text-text-muted">
              <KeyboardKey size="xs">{LEADER}</KeyboardKey> Add — then press
            </p>
            <ChordLeaderScope leader={LEADER}>
            {ADD_KEY_GROUPS.map(({ group, keys }, groupIndex) => (
              <div key={group} role="group" aria-label={group} className={cn('flex flex-col gap-0.5', groupIndex > 0 && 'mt-1 border-t border-border-soft pt-1')}>
                <p className={GROUP_LABEL_CLASS}>{group}</p>
                {keys.map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    tabIndex={-1}
                    onClick={() => onRun(n.href)}
                    className={cn(
                      'ds-raw-button flex min-w-[15rem] cursor-pointer items-center gap-3 rounded-mode-control px-2 py-1.5 text-left text-role-body text-text-default hover:bg-surface-hover',
                      focusRing('control'),
                    )}
                    data-testid={`global-add-key-${n.key}`}
                  >
                    <ChordKeys keys={[LEADER, n.key.toUpperCase()]} size="sm" />
                    {n.label}
                  </button>
                ))}
              </div>
            ))}
            </ChordLeaderScope>
            <p className="px-2 pt-1 text-role-micro text-text-faint">
              <KeyboardKey size="xs">esc</KeyboardKey> cancel
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Layer>
  );
}
