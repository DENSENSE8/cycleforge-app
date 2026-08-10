'use client';

/**
 * Keyboard — personal shortcut settings (Phase 3, enablement/remap half).
 *
 * The discoverability half (the `?` cheat sheet, the `⌘;` leader reveal, the
 * wedge-safe `⌥`+letter panel shortcuts) is owned elsewhere; this section is the
 * one thing those lack — a Settings home for the ONE remappable global key (the
 * focus-scan hotkey) plus an honest pointer to the reference and the policy.
 *
 * Composes the `useScanHotkey` store SoT — never the scan-bar gear widget, which
 * is coupled to the bar's icon slot. Options come from
 * `FOCUS_SCAN_HOTKEY_OPTIONS` so a rendered choice can never fail the validator.
 */

import type { ReactNode } from 'react';
import { useScanHotkey } from '@/lib/scan-hotkey/useScanHotkey';
import {
  DEFAULT_FOCUS_SCAN_HOTKEY,
  FOCUS_SCAN_HOTKEY_OPTIONS,
} from '@/lib/schemas/staff-preferences';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

const FLUSH = cornerClass('flush');

export function KeyboardSection() {
  const { hotkey, setHotkey } = useScanHotkey();
  const active = hotkey || DEFAULT_FOCUS_SCAN_HOTKEY;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="sr-only">Keyboard</h2>
        <p className="mt-1 text-sm text-text-soft">
          Shortcut preferences for this account. Warehouse benches run keyboard-wedge
          scanners, so single-key actions stay behind a modifier — see the policy below.
        </p>
      </header>

      {/* Focus-scan hotkey — the one remappable global key. */}
      <section className="rounded-2xl border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="text-base font-semibold text-text-default">Focus-scan hotkey</h3>
        <p className="mt-1 text-xs text-text-soft">
          Reclaims focus on the active station scan field without clearing typed text.
          Next scan (clear + focus) is the fixed house chord <span className="font-mono">⌘.</span>
          — pick a non-typing reclaim key a wedge can emit and you rarely press by accident.
        </p>
        <div
          className="mt-4 flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="Focus-scan hotkey"
        >
          {FOCUS_SCAN_HOTKEY_OPTIONS.map((key) => {
            const selected = key === active;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setHotkey(key)}
                className={cn(
                  'ds-raw-button',
                  FLUSH,
                  focusRing('control', 'accent'),
                  'inline-flex min-w-[3rem] items-center justify-center border px-2.5 py-1.5 font-mono text-role-caption tabular-nums transition-colors',
                  selected
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-border-soft bg-surface-canvas text-text-soft hover:bg-surface-sunken hover:text-text-default',
                )}
                data-testid={`focus-scan-hotkey-${key}`}
                data-selected={selected ? '' : undefined}
              >
                {key}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-role-caption text-text-faint">
          Current: <span className="font-mono text-text-muted">{active}</span>
          {active !== DEFAULT_FOCUS_SCAN_HOTKEY ? (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => setHotkey(DEFAULT_FOCUS_SCAN_HOTKEY)}
                className="ds-raw-button text-blue-600 hover:underline"
                data-testid="focus-scan-hotkey-reset"
              >
                Reset to {DEFAULT_FOCUS_SCAN_HOTKEY}
              </button>
            </>
          ) : null}
        </p>
      </section>

      {/* Reference + wedge-safe policy — pointer, not a second binder. */}
      <section className="rounded-2xl border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="text-base font-semibold text-text-default">Shortcuts reference</h3>
        <ul className="mt-3 space-y-2 text-xs text-text-soft">
          <li className="flex items-baseline gap-2">
            <Kbd>?</Kbd>
            <span>Open the full keyboard-shortcuts reference from anywhere.</span>
          </li>
          <li className="flex items-baseline gap-2">
            <Kbd>⌘.</Kbd>
            <span>Next scan — clear + focus the station Ticket · Tracking · PO bar.</span>
          </li>
          <li className="flex items-baseline gap-2">
            <Kbd>⌘;</Kbd>
            <span>
              Arm keyboard navigation, then a region key (<Kbd inline>L</Kbd>{' '}
              <Kbd inline>M</Kbd> <Kbd inline>R</Kbd>) and a letter to jump.
            </span>
          </li>
          <li className="flex items-baseline gap-2">
            <Kbd>⌥</Kbd>
            <span>
              Single-key actions on scan surfaces require Alt (e.g. <Kbd inline>⌥P</Kbd>{' '}
              to print) — a bare key would fire mid-scan on a wedge bench.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Kbd({ children, inline }: { children: ReactNode; inline?: boolean }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center border border-border-default bg-surface-canvas font-mono text-role-micro uppercase tracking-widest text-text-muted',
        FLUSH,
        inline ? 'min-w-[1.25rem] px-1 py-0.5' : 'min-w-[1.5rem] px-1.5 py-0.5',
      )}
    >
      {children}
    </kbd>
  );
}
