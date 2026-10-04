'use client';

/**
 * One unit as V2 mobile reads it: sentence-case state and condition first,
 * then product identity, then the exact serial / SKU and receiving lineage.
 * The industrial three-band code face deliberately stays off the phone.
 */

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { QC_UNIT_LIFECYCLE, STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { conditionGradeTableLabel } from '@/lib/conditions';
import type { QcUnitStage } from '@/lib/qc/unit-qc-stage';
import { cn } from '@/utils/_cn';

export interface QcUnitRecordFacts {
  stage: QcUnitStage;
  title: string | null;
  serialNumber: string;
  sku: string | null;
  conditionGrade: string | null | undefined;
  cartonId: number | null;
  lineId: number | null;
}

export function QcUnitRecord({ unit, href }: { unit: QcUnitRecordFacts; href: string }) {
  const { stage } = unit;
  const face = QC_UNIT_LIFECYCLE[stage];
  const title = unit.title || unit.sku || 'Unknown item';
  const condition = unit.conditionGrade ? conditionGradeTableLabel(unit.conditionGrade) : 'Condition not recorded';
  const receiving = [unit.cartonId ? `Receiving R-${unit.cartonId}` : null, unit.lineId ? `Line L-${unit.lineId}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <DetailSummaryCard
      href={href}
      testId="qc-unit-record"
      dataState={stage}
      ariaLabel={`${face.label}, ${condition}, ${title}, serial ${unit.serialNumber}${unit.cartonId ? `, receiving R-${unit.cartonId}` : ''}`}
      eyebrow={
        <>
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', STATE_TONE_CLASSES[face.tone].dot)} aria-hidden />
          <span className={cn('text-role-body font-semibold', STATE_TONE_CLASSES[face.tone].text)}>{face.label}</span>
          <span className={cn('min-w-0 truncate text-role-caption', conditionGradeTextClass(unit.conditionGrade))}>{condition}</span>
        </>
      }
      title={title}
      lines={[
        { text: `Serial ${unit.serialNumber}`, mono: true },
        ...(unit.sku ? [{ text: `SKU ${unit.sku}`, mono: true }] : []),
      ]}
      foot={receiving}
      chip={null}
    />
  );
}
