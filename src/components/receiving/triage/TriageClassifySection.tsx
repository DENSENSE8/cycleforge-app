'use client';

/**
 * Classify controls for the triage Overview tab — platform / type / urgency
 * pickers. The SectionTabsSlider eyebrow owns the "Classify" label — this
 * body is unlabeled so we don't double the title.
 */

import { useState } from 'react';
import { WorkspaceCard } from '@/design-system/components';
import { InlinePillPicker, type InlinePillOption } from '../workspace/line-edit/InlinePillPicker';
import { receivingPriorityRank, receivingPriorityTone } from '../workspace/line-edit/receiving-priority';
import { PRIORITY_OVERRIDE_TIERS, priorityOverrideTier } from '@/lib/receiving/priority-override';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import type { UnboxLineController } from '../workspace/line-edit/unbox-line-controller';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function TriageClassifySection({
  row,
  c,
}: {
  row: ReceivingLineRow;
  c: UnboxLineController;
}) {
  const isUnmatched = row.receiving_source === 'unmatched';
  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();
  const [openPicker, setOpenPicker] = useState<'urgency' | 'platform' | 'type' | null>(null);

  const derivedRank = receivingPriorityRank(isUnmatched, c.sourcePlatform, false);
  const derivedTone = receivingPriorityTone(derivedRank);
  const overrideMeta = priorityOverrideTier(c.priorityTier);
  const urgencyValue = c.priorityTier != null ? String(c.priorityTier) : 'auto';
  const effectiveUrgencyLabel = overrideMeta ? overrideMeta.label : derivedTone.label;
  const effectiveUrgencyClass = overrideMeta
    ? overrideMeta.activeClass
    : `${derivedTone.className} border-transparent`;
  const RANK_TO_TIER: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3 };
  const derivedTierEquivalent =
    c.priorityTier == null ? (RANK_TO_TIER[derivedRank] ?? null) : null;

  const urgencyOptions: InlinePillOption[] = [
    {
      value: 'auto',
      label: 'Auto',
      title: `Auto — follows platform (${derivedTone.label})`,
      activeClass: 'border-border-default bg-surface-card text-text-muted',
      inactiveClass:
        'border-border-soft bg-surface-card/70 text-text-soft hover:border-border-default hover:bg-surface-hover',
    },
    ...PRIORITY_OVERRIDE_TIERS.map((t) => ({
      value: String(t.value),
      label: t.label,
      title:
        derivedTierEquivalent === t.value
          ? `${t.title} — current (auto from platform); click to pin`
          : t.title,
      activeClass: t.activeClass,
      inactiveClass: derivedTierEquivalent === t.value ? t.activeClass : t.inactiveClass,
    })),
  ];

  const platformOptions: InlinePillOption[] = [
    ...(isUnmatched
      ? [
          {
            value: '',
            label: 'Unfound',
            title: 'No Zoho PO matched this carton',
            activeClass: 'border-amber-600 bg-amber-500 text-white',
            inactiveClass:
              'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
          } as InlinePillOption,
        ]
      : []),
    ...platformCatalog.options.map((o) => ({ value: o.value, label: o.label })),
  ];
  const typeOptions: InlinePillOption[] = typeCatalog.options
    .filter((o) => o.value !== 'PICKUP')
    .map((o) => ({ value: o.value, label: o.label }));

  return (
    <WorkspaceCard variant="glass" overflow="visible">
      <div className="flex flex-wrap items-center gap-2">
        <InlinePillPicker
          ariaLabel="Urgency"
          options={urgencyOptions}
          value={urgencyValue}
          onSelect={(v) => void c.handlePrioritySelect(v === 'auto' ? null : Number(v))}
          collapsedLabel={effectiveUrgencyLabel}
          collapsedClass={effectiveUrgencyClass}
          open={openPicker === 'urgency'}
          onOpenChange={(o) => setOpenPicker(o ? 'urgency' : null)}
        />
        <InlinePillPicker
          ariaLabel="Platform"
          options={platformOptions}
          value={c.sourcePlatform}
          onSelect={(next) => {
            c.setSourcePlatform(next);
            void c.savePlatform(next);
          }}
          open={openPicker === 'platform'}
          onOpenChange={(o) => setOpenPicker(o ? 'platform' : null)}
          disabled={row.receiving_id == null}
          placeholder={isUnmatched ? 'Unfound' : 'Platform'}
        />
        <InlinePillPicker
          ariaLabel="Type"
          options={typeOptions}
          value={c.receivingType}
          onSelect={(next) => {
            c.setReceivingType(next);
            void c.saveType(next);
          }}
          open={openPicker === 'type'}
          onOpenChange={(o) => setOpenPicker(o ? 'type' : null)}
          placeholder="Type"
        />
      </div>
    </WorkspaceCard>
  );
}
