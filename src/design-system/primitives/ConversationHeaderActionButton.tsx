'use client';

/**
 * Circular conversation-header action — Link · Details · Open · inspector.
 * Hard DS primitive; compose on every ticket / thread header cluster.
 */

import type { ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import {
  CONVERSATION_HEADER_ACTION_BTN,
  CONVERSATION_HEADER_ACTION_BTN_ACTIVE,
} from './conversation-chrome';

export function ConversationHeaderActionButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
  expanded,
  'data-testid': testId,
  'data-density': density,
  className,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Disclosure triggers only (details popover). */
  expanded?: boolean;
  'data-testid'?: string;
  'data-density'?: 'header' | 'station';
  className?: string;
}) {
  return (
    <HoverTooltip label={label} asChild>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active || undefined}
        aria-expanded={expanded}
        data-testid={testId}
        data-density={density}
        className={cn(
          CONVERSATION_HEADER_ACTION_BTN,
          active && CONVERSATION_HEADER_ACTION_BTN_ACTIVE,
          disabled && 'opacity-40',
          className,
        )}
      >
        {icon}
      </button>
    </HoverTooltip>
  );
}
