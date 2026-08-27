'use client';

/**
 * Far-right GlobalHeader control that opens the assistant right-rail occupant.
 * Sits after clipboard / phone / kiosk / inbox so the toggle lines up with the
 * edge it owns (MasterNav collapse is far-left; this is far-right).
 *
 * Seeds the composer from the current {@link GlobalHeaderSearch} draft when
 * non-empty — same handoff as when Sparkles lived beside Search.
 */

import { Sparkles } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { useAssistantDockControls } from '@/components/assistant/AssistantProvider';
import { getGlobalHeaderSearchDraft } from '@/lib/global-header-search-query';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

export function GlobalHeaderAssistantButton({
  size = 'md',
  iconClassName = TOP_CHROME_ICON_FACE,
  wrapClassName = HEADER_ICON_WRAP,
}: {
  size?: 'md' | 'touch';
  iconClassName?: string;
  wrapClassName?: string;
} = {}) {
  const assistant = useAssistantDockControls();
  if (!assistant.enabled) return null;

  const openAssistant = () => {
    const next = !assistant.open;
    assistant.setOpen(next);
    if (!next) return;
    const trimmed = getGlobalHeaderSearchDraft().trim();
    if (trimmed) {
      assistant.seedComposer(trimmed, { autoSend: false });
    } else {
      assistant.focusComposer();
    }
  };

  return (
    <div className={wrapClassName}>
      <HoverTooltip
        label={assistant.open ? 'Close assistant (⌘J)' : 'Open assistant (⌘J)'}
        asChild
      >
        <IconButton
          type="button"
          size={size}
          ariaLabel={assistant.open ? 'Close assistant' : 'Open assistant'}
          aria-expanded={assistant.open}
          onClick={openAssistant}
          className={cn(
            HEADER_ICON_BTN_CLASS,
            assistant.open && cn(HEADER_ICON_BTN_OPEN_CLASS, 'text-blue-600'),
          )}
          icon={<Sparkles className={iconClassName} />}
        />
      </HoverTooltip>
    </div>
  );
}
