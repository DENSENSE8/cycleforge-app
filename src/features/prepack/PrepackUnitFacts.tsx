'use client';

import { useQuery } from '@tanstack/react-query';
import { UnitPackPhotoPeek } from '@/components/packer/UnitPackPhotoPeek';
import { Check, X } from '@/components/Icons';
import { PREPACK_EVIDENCE_KINDS, PREPACK_EVIDENCE_LABEL, PREPACK_PROVENANCE_LABEL } from '@/lib/prepack/types';
import { fetchPrepackUnit } from './prepack-client';

/** Saved prepack state shared by the unit hub and the existing pack station. */
export function PrepackUnitFacts({ unitRef, compact = false }: { unitRef: string; compact?: boolean }) {
  const query = useQuery({
    queryKey: ['prepack-unit-facts', unitRef],
    queryFn: async () => (await fetchPrepackUnit(unitRef)).unit,
    enabled: Boolean(unitRef.trim()),
    staleTime: 10_000,
  });
  const unit = query.data;
  if (query.isPending) return <p className="px-mode-page py-4 text-sm font-semibold text-text-muted">Loading prepack facts…</p>;
  if (query.error || !unit) return null;

  const stamp = unit.prepackedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(unit.prepackedAt))
    : null;

  return (
    <section aria-label="Prepack facts" className="divide-y divide-mode-rule" data-testid="prepack-unit-facts">
      <div className={compact ? 'space-y-1 py-2' : 'space-y-1 px-mode-page py-3'}>
        <p className="text-role-eyebrow font-semibold text-text-muted">Prepack</p>
        <p className="break-words text-sm font-semibold text-text-default">
          {stamp ? `Prepacked ${stamp}` : 'Not prepacked'}
        </p>
        {stamp ? (
          <p className="break-words text-role-caption text-text-muted">
            {unit.prepackedByName || 'Unknown staff'}
            {unit.prepackLocationCode ? ` · ${unit.prepackLocationCode}` : ''}
            {unit.packageUid ? ` · package ${unit.packageUid} (${unit.packageSerials.length} serials)` : ''}
          </p>
        ) : null}
        {stamp ? (
          <p className="break-words text-role-caption text-text-muted" data-testid="prepack-unit-grade">
            {unit.conditionGrade ? unit.conditionGrade.replace(/_/g, ' ') : 'No grade'}
            {' · '}
            {unit.refurbProvenance ? PREPACK_PROVENANCE_LABEL[unit.refurbProvenance] : 'Provenance not recorded'}
            {' · '}
            {PREPACK_EVIDENCE_KINDS.map((kind) => `${PREPACK_EVIDENCE_LABEL[kind]} ${unit.evidence[kind] ?? 0}`).join(' · ')}
          </p>
        ) : null}
      </div>

      {unit.contents.length > 0 ? (
        <ul aria-label="Prepack contents" className="divide-y divide-mode-rule">
          {unit.contents.map((part, index) => (
            <li key={`${part.id}:${index}`} className={`flex items-start gap-3 ${compact ? 'py-2' : 'px-mode-page py-2.5'}`}>
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${part.included ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {part.included ? <Check className="size-3.5" /> : <X className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold text-text-default">
                  {part.componentName}{part.qtyRequired > 1 ? ` ×${part.qtyRequired}` : ''}
                </span>
                <span className="block break-words text-role-caption text-text-muted">
                  {part.included ? 'Included' : 'Missing'} · {part.componentType.charAt(0) + part.componentType.slice(1).toLowerCase()}
                  {part.componentSku ? ` · ${part.componentSku}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {unit.prepackedAt ? (
        <div className={compact ? 'pt-3' : 'px-mode-page py-3'}>
          <p className="mb-2 text-role-caption font-semibold text-text-muted">Prepack photos</p>
          <UnitPackPhotoPeek serialUnitId={unit.id} preferSource="prepack" />
        </div>
      ) : null}
    </section>
  );
}
