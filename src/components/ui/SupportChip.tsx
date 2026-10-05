'use client';

/**
 * A Support state chip (message disposition / delivery, purpose, work flags) — the house badge with a
 * glyph beside the word, never colour alone. One face for the desk record and the phone sheet.
 */

import { AlertTriangle, CheckCheck, Clock3, MinusCircle, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SupportChipTone } from '@/lib/support/record/support-record-model';

const TONE_GLYPH: Readonly<Record<SupportChipTone, LucideIcon | null>> = {
  default: null,
  secondary: MinusCircle,
  success: CheckCheck,
  warning: Clock3,
  destructive: AlertTriangle,
};

export function SupportChip({ tone, label, testId }: { tone: SupportChipTone; label: string; testId?: string }) {
  const Glyph = TONE_GLYPH[tone];
  return (
    <Badge variant={tone} data-testid={testId}>
      {Glyph ? <Glyph aria-hidden /> : null}
      {label}
    </Badge>
  );
}
