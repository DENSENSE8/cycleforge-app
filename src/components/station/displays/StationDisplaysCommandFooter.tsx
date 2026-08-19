'use client';

/**
 * Station Displays leaf-command footer — dismiss `→|` plus opt-in `/` palette.
 *
 * Never mounts `TechRailSearchBar` / `Filter displays…` — that band is the
 * default leaf/index footer; this stage replaces it with `/` + hide.
 * Wedge-safe: refuse-in-input · scan-burst · overlay yield · no bare digit binds.
 * Esc closes the palette first (caller owns stack Esc after).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ChevronRight } from '@/components/Icons';
import {
  HeaderChromeMenu,
  HeaderChromeMenuEmpty,
  HeaderChromeMenuItem,
} from '@/components/layout/header-chrome-menu';
import {
  SIDEBAR_RAIL_TRAILING_TRACK_CLASS,
  STATION_COLUMN_FOOTER_BAND_FACE,
} from '@/components/layout/header-shell';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { isKeyboardRegionOwner } from '@/lib/keyboard/keyboard-region-owner';
import { hasOpenOverlay, pushOverlay } from '@/lib/overlay-stack/store';
import { cn } from '@/utils/_cn';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import {
  formatDisplaysFooterSlash,
  type DisplaysFooterCommand,
} from './displays-footer-command';
import { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';

/** Inter-key gap below this = scanner burst — do not open `/`. */
const COMMAND_SCAN_BURST_MS = 30;

export function StationDisplaysCommandFooter({
  commands,
  open,
  onOpenChange,
  onClose,
  className,
}: {
  commands: DisplaysFooterCommand[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onClose: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastKeyTsRef = useRef(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\/+/, '');
    if (!q) return commands;
    return commands.filter((c) => {
      const slash = c.slash.toLowerCase();
      const label = c.label.toLowerCase();
      const face = formatDisplaysFooterSlash(c.slash).toLowerCase();
      return slash.includes(q) || label.includes(q) || face.includes(q);
    });
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setCursor(0);
      return;
    }
    setCursor(0);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (cursor >= filtered.length) setCursor(Math.max(0, filtered.length - 1));
  }, [cursor, filtered.length]);

  // Overlay claim while the palette is open — ambient keyboards stand down.
  useEffect(() => {
    if (!open) return;
    return pushOverlay();
  }, [open]);

  const runCommand = useCallback(
    (cmd: DisplaysFooterCommand) => {
      if (cmd.disabled) return;
      onOpenChange(false);
      try {
        cmd.onAction();
      } catch {
        /* leaf handler errors must not break the footer */
      }
    },
    [onOpenChange],
  );

  // `/` opens when Right owns keyboard; refuse input · burst · foreign overlays.
  useEffect(() => {
    if (commands.length === 0) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!isKeyboardRegionOwner('right')) return;
      if (isEditableKeyTarget(e.target)) return;
      // Yield when another overlay already owns the keyboard (not our palette).
      if (!open && hasOpenOverlay()) return;

      const now = e.timeStamp || performance.now();
      const gap = now - lastKeyTsRef.current;
      lastKeyTsRef.current = now;
      if (gap > 0 && gap < COMMAND_SCAN_BURST_MS) return;

      if (open) return; // already open — let the field handle `/` as query text
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(true);
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [commands.length, open, onOpenChange]);

  const onFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = filtered[cursor];
      if (hit) runCommand(hit);
    }
  };

  return (
    <div
      data-testid="station-displays-command-footer"
      data-command-open={open ? 'true' : 'false'}
      style={{ '--cf-density': '1' } as CSSProperties}
      className={cn(
        'relative gap-2 bg-surface-card py-0 pl-3 pr-0',
        STATION_COLUMN_FOOTER_BAND_FACE,
        className,
      )}
    >
      {open ? (
        <div
          className="absolute inset-x-0 bottom-full z-20 mb-0"
          data-testid="station-displays-command-palette"
        >
          <HeaderChromeMenu ariaLabel="Displays leaf commands" className="w-full min-w-0 border-t">
            {filtered.length === 0 ? (
              <HeaderChromeMenuEmpty>No matching commands</HeaderChromeMenuEmpty>
            ) : (
              filtered.map((cmd, i) => (
                <HeaderChromeMenuItem
                  key={cmd.id}
                  icon={<ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                  label={`${formatDisplaysFooterSlash(cmd.slash)} · ${cmd.label}`}
                  active={i === cursor}
                  disabled={cmd.disabled}
                  onClick={() => runCommand(cmd)}
                  onMouseEnter={() => setCursor(i)}
                />
              ))
            )}
          </HeaderChromeMenu>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 items-center">
        {open ? (
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFieldKeyDown}
            placeholder="Command…"
            aria-label="Filter leaf commands"
            className={cn(
              'min-w-0 flex-1 bg-transparent py-1.5 text-role-caption text-text-default outline-none placeholder:text-text-muted',
              focusRing('control', 'accent'),
            )}
            data-testid="station-displays-command-input"
          />
        ) : (
          <button
            type="button"
            data-testid="station-displays-command-open"
            className={cn(
              'ds-raw-button flex min-w-0 flex-1 items-center gap-1.5 rounded-none px-0 py-1.5 text-left',
              focusRing('control', 'accent'),
            )}
            onClick={() => onOpenChange(true)}
            aria-expanded={false}
            aria-label="Open displays commands"
          >
            <span className="font-mono text-role-caption text-text-muted" aria-hidden>
              /
            </span>
            <span className="truncate text-role-caption text-text-muted">
              Commands · {commands.length}
            </span>
          </button>
        )}
      </div>

      <div className={SIDEBAR_RAIL_TRAILING_TRACK_CLASS}>
        <StationDisplaysEdgeToggle variant="column-close" onClick={onClose} />
      </div>
    </div>
  );
}
