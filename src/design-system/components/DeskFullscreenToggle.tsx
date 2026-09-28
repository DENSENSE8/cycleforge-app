'use client';

/**
 * ⤢ — the desk stage's full-screen viewpoint, the LAST control on a list's bar
 * (owner 2026-09-27: "the most top right button"). Expanded = any view but
 * In place (`DeskStageValue.fullscreen`): the stage drops its page gutters and
 * the list keeps its place on the left. Same chord as the view switch's
 * In place ⇄ Split, taught through the one hotkey hint ({@link HotkeyTooltip}).
 * Renders nothing off a desk stage.
 */

import { Maximize2, Minimize2 } from '@/components/Icons';
import { HotkeyTooltip } from '@/components/ui/HotkeyTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { DESK_SPLIT_SHORTCUT_HINT, useDeskStageOptional } from './DeskStageContext';

export function DeskFullscreenToggle({ className }: { className?: string }) {
  const stage = useDeskStageOptional();
  if (!stage) return null;
  const expanded = stage.fullscreen;
  return (
    <HotkeyTooltip action={expanded ? 'Exit full screen' : 'Expand to full screen'} chord={DESK_SPLIT_SHORTCUT_HINT} placement="above">
      <button
        type="button"
        aria-pressed={expanded}
        aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
        aria-keyshortcuts="Control+Shift+S Meta+Shift+S"
        data-testid="desk-fullscreen-toggle"
        onClick={() => stage.setView(expanded ? 'in-place' : 'split')}
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-sunken hover:text-text-default',
          expanded && 'text-text-default',
          focusRing('control'),
          className,
        )}
      >
        {expanded ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
      </button>
    </HotkeyTooltip>
  );
}
