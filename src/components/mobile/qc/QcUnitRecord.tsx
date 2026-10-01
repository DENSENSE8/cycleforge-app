'use client';

/**
 * One unit as the QC phone reads it — the shared record at phone width
 * (`MobileOrderRecord`'s anatomy, HANDOFF-record-ledger §laws),
 * F-pattern Context → Identity → Execution with one right lane:
 *
 *   band 1  CODE · condition ··················│ R-{carton}   ← the sticker scanned
 *   band 2  ▣ title ···························│ L-{line}
 *   band 3  SN {serial} · SKU ··················│ → next
 *
 * The state code leads so the verdict is read first; the lane's `R-` is the
 * handle printed on the unbox label, matched by eye. Code, colour and `→ next`
 * come from `QC_UNIT_LIFECYCLE` / `QC_UNIT_NEXT` for the caller's stage —
 * the unit's QC page passes the desk QC record's `qcUnitRecordState`, so the
 * phone and the desk say the same thing.
 */

import Link from 'next/link';
import { QC_UNIT_LIFECYCLE, STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_TITLE_CLASS,
  recordStateCodeClass,
} from '@/design-system/tokens/record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_SPINE_HATCH_CLASS } from '@/design-system/components/record-ledger/record-ledger-geometry';
import { recordInitials } from '@/design-system/components/record-ledger/RecordPhoto';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { conditionGradeTableLabel } from '@/lib/conditions';
import { QC_UNIT_NEXT, type QcUnitStage } from '@/lib/qc/unit-qc-stage';
import { cn } from '@/utils/_cn';

/** One touch band (36px) — three per record, 1px rule between. */
const BAND = 'flex min-h-9 min-w-0 items-center';
/** The right lane: one column down all three bands, hairline on the same pixel. */
const LANE = 'flex h-full w-28 shrink-0 items-center border-l border-mode-edge px-2';

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
  const next = QC_UNIT_NEXT[stage];
  const title = unit.title || unit.sku || 'Unknown item';

  return (
    <Link
      href={href}
      data-testid="qc-unit-record"
      data-state={stage}
      aria-label={`${face.label}, ${title}, serial ${unit.serialNumber}${unit.cartonId ? `, carton R-${unit.cartonId}` : ''}`}
      className={cn('relative flex border-b border-mode-ink bg-mode-panel active:bg-mode-hover', focusRing('cell'))}
    >
      <span
        aria-hidden
        className={cn('w-[5px] shrink-0 self-stretch', STATE_TONE_CLASSES[face.tone].dot, 'hatched' in face && face.hatched && RECORD_SPINE_HATCH_CLASS)}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        {/* Band 1 — context: state · condition ··· the scanned sticker */}
        <span className={cn(BAND, 'gap-2 border-b border-mode-rule pl-2')}>
          <span className={cn(RECORD_LABEL_CLASS, 'shrink-0', recordStateCodeClass(face))}>
            <span aria-hidden>{face.code}</span>
            <span className="sr-only">{face.label}</span>
          </span>
          {/* No grade → nothing: the code already says the stage (no "PAS · Passed" echo). */}
          <span className={cn(RECORD_LABEL_CLASS, 'min-w-0 flex-1 truncate', conditionGradeTextClass(unit.conditionGrade))}>
            {unit.conditionGrade ? conditionGradeTableLabel(unit.conditionGrade) : null}
          </span>
          <span className={cn(LANE, RECORD_ID_CLASS)}>
            <span className="truncate">{unit.cartonId ? `R-${unit.cartonId}` : '—'}</span>
          </span>
        </span>
        {/* Band 2 — identity: initials · title ··· line */}
        <span className={cn(BAND, 'gap-2 border-b border-mode-rule pl-1')}>
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-mode-rule bg-mode-well font-mono text-role-micro font-black text-mode-muted"
          >
            {recordInitials(title)}
          </span>
          <span className={cn(RECORD_TITLE_CLASS, 'flex-1')}>{title}</span>
          <span className={cn(LANE, RECORD_LABEL_CLASS, 'text-mode-muted')}>
            <span className="truncate">{unit.lineId ? `L-${unit.lineId}` : ''}</span>
          </span>
        </span>
        {/* Band 3 — execution: serial · SKU ··· next */}
        <span className={cn(BAND, 'gap-2 pl-2')}>
          <span className={cn(RECORD_LABEL_CLASS, 'min-w-0 flex-1 truncate text-mode-muted')}>
            SN <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{unit.serialNumber}</span>
          </span>
          <span className={cn(RECORD_ID_CLASS, 'max-w-[6rem] shrink-0 truncate')}>{unit.sku || '—'}</span>
          <span className={cn(LANE, RECORD_LABEL_CLASS, face.tone === 'danger' ? STATE_TONE_CLASSES.danger.text : 'text-mode-ink')}>
            <span className="truncate">{next ? `→ ${next}` : ''}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}
