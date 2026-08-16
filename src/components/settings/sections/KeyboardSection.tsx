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
 * is coupled to the bar's icon slot. Preset chips come from
 * `FOCUS_SCAN_HOTKEY_OPTIONS`; any other bindable key is set via “Press a key…”.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useScanHotkey } from '@/lib/scan-hotkey/useScanHotkey';
import {
  DEFAULT_FOCUS_SCAN_HOTKEY,
  FOCUS_SCAN_HOTKEY_OPTIONS,
  isBindableFocusScanHotkey,
} from '@/lib/schemas/staff-preferences';
import { NEXT_SCAN_CHORD_LABEL } from '@/lib/scan-hotkey/store';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';


const FLUSH = cornerClass('flush');

export function KeyboardSection() {
  const { hotkey, setHotkey, setCapturing } = useScanHotkey();
  const active = hotkey || DEFAULT_FOCUS_SCAN_HOTKEY;
  const isPreset = (FOCUS_SCAN_HOTKEY_OPTIONS as readonly string[]).includes(active);
  const [capturingCustom, setCapturingCustom] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    if (!capturingCustom) {
      setCapturing(false);
      return;
    }
    setCapturing(true);
    setCaptureError(null);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturingCustom(false);
        setCaptureError(null);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        setCaptureError(`Next scan is fixed at ${NEXT_SCAN_CHORD_LABEL} — pick a reclaim key`);
        return;
      }
      if (isBindableFocusScanHotkey(e.key)) {
        setHotkey(e.key);
        setCapturingCustom(false);
        setCaptureError(null);
        return;
      }
      setCaptureError('That key is reserved — try another');
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setCapturing(false);
    };
  }, [capturingCustom, setHotkey, setCapturing]);

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
      <Panel radius="2xl">
        <h3 className="text-base font-semibold text-text-default">Focus-scan hotkey</h3>
        <p className="mt-1 text-xs text-text-soft">
          Reclaims focus on the active station scan field without clearing typed text.
          Next scan (clear + focus) is the fixed house chord <span className="font-mono">⌘.</span>
          — presets below are wedge-safe mid-field; any other key binds but yields while typing.
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
                onClick={() => {
                  setCapturingCustom(false);
                  setHotkey(key);
                }}
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
          <button
            type="button"
            role="radio"
            aria-checked={!isPreset || capturingCustom}
            onClick={() => {
              setCaptureError(null);
              setCapturingCustom(true);
            }}
            className={cn(
              'ds-raw-button',
              FLUSH,
              focusRing('control', 'accent'),
              'inline-flex min-w-[3rem] items-center justify-center border px-2.5 py-1.5 font-mono text-role-caption tabular-nums transition-colors',
              !isPreset || capturingCustom
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-border-soft bg-surface-canvas text-text-soft hover:bg-surface-sunken hover:text-text-default',
            )}
            data-testid="focus-scan-hotkey-custom"
            data-selected={!isPreset || capturingCustom ? '' : undefined}
          >
            {capturingCustom ? 'Press…' : !isPreset ? active : 'Other…'}
          </button>
        </div>
        <p
          className={cn(
            'mt-3 text-role-caption',
            captureError ? 'font-medium text-rose-600' : 'text-text-faint',
          )}
        >
          {captureError ?? (
            <>
              Current: <span className="font-mono text-text-muted">{active}</span>
              {active !== DEFAULT_FOCUS_SCAN_HOTKEY ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => {
                      setCapturingCustom(false);
                      setHotkey(DEFAULT_FOCUS_SCAN_HOTKEY);
                    }}
                    className="ds-raw-button text-blue-600 hover:underline"
                    data-testid="focus-scan-hotkey-reset"
                  >
                    Reset to {DEFAULT_FOCUS_SCAN_HOTKEY}
                  </button>
                </>
              ) : null}
              {capturingCustom ? ' · Esc to cancel' : null}
            </>
          )}
        </p>
      </Panel>

      {/* Reference + wedge-safe policy — pointer, not a second binder. */}
      <Panel radius="2xl">
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
      </Panel>
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
