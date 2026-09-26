'use client';

import { FileText } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

/** Paperwork toggle for the repair intake flow. */

interface RepairPaperworkSheetProps {
  /** Whether the paperwork view is currently shown. */
  active: boolean;
  /** Flip between the step body and the document view. */
  onToggle: () => void;
  /** When true, the control is inert (e.g. no product selected yet). */
  disabled?: boolean;
}

export function RepairPaperworkSheet({
  active,
  onToggle,
  disabled = false,
}: RepairPaperworkSheetProps) {
  const label = disabled
    ? 'Select a product to preview paperwork'
    : active
      ? 'Hide repair paperwork'
      : 'View repair paperwork';

  return (
    <HoverTooltip label={label} asChild>
      <IconButton
        size="lg"
        icon={<FileText className="h-4 w-4" />}
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={active}
        ariaLabel={label}
        className={`rounded-none border transition-colors ${
          active
            ? 'border-border-strong bg-surface-inverse text-white'
            : 'border-border-soft text-text-soft hover:border-border-strong hover:text-text-default'
        }`}
      />
    </HoverTooltip>
  );
}
