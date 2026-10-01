export interface HandlingUnitQcCounts {
  totalUnits: number;
  testedUnits: number;
  holdUnits: number;
}

export type HandlingUnitQcStage = 'empty' | 'pending' | 'partial' | 'cleared' | 'hold';

/**
 * One client-safe interpretation of an LPN's member-unit rollup. The database
 * status remains the physical container lifecycle; this projection describes
 * QC without pretending that CLOSED means prepacked.
 */
export function handlingUnitQcFace(counts: HandlingUnitQcCounts): {
  stage: HandlingUnitQcStage;
  label: string;
  next: 'Add units' | 'Start QC' | 'Continue QC' | 'Resolve hold' | 'Prepack';
  tone: 'neutral' | 'info' | 'success' | 'danger';
} {
  const total = Math.max(0, counts.totalUnits);
  const tested = Math.min(total, Math.max(0, counts.testedUnits));
  const holds = Math.min(total, Math.max(0, counts.holdUnits));
  if (total === 0) return { stage: 'empty', label: 'Empty', next: 'Add units', tone: 'neutral' };
  if (holds > 0) return { stage: 'hold', label: `${holds} on hold`, next: 'Resolve hold', tone: 'danger' };
  if (tested === 0) return { stage: 'pending', label: 'QC pending', next: 'Start QC', tone: 'neutral' };
  if (tested < total) return { stage: 'partial', label: `${tested}/${total} QC`, next: 'Continue QC', tone: 'info' };
  return { stage: 'cleared', label: `${total}/${total} QC`, next: 'Prepack', tone: 'success' };
}
