'use client';

import { Camera, Check, Smartphone, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import {
  PREPACK_EVIDENCE_LABEL,
  missingPackageEvidence,
  requiredPrepackEvidence,
  type PrepackEvidenceKind,
  type PrepackKitPart,
  type PrepackUnit,
} from '@/lib/prepack/types';

/** The key a serial rides the URL and the label by: its minted unit id, else its OEM serial. */
export function unitKeyOf(unit: PrepackUnit): string {
  return unit.unitUid || unit.serialNumber;
}

/** The serials in the package being built, each removable before Print. */
export function PackageSerialList({ units, onRemove }: { units: readonly PrepackUnit[]; onRemove: (unitId: number) => void }) {
  if (units.length === 0) return null;
  return (
    <ul className="divide-y divide-mode-rule border-y border-mode-rule" aria-label="Serials in this package" data-testid="prepack-package">
      {units.map((unit) => (
        <li key={unit.id} className="flex items-center gap-3 bg-surface-card px-3 py-2" data-testid="prepack-package-serial">
          <span className="min-w-0 flex-1">
            <span className="block break-all font-mono text-sm font-semibold text-mode-ink">{unit.serialNumber}</span>
            <span className="block text-role-caption text-text-muted">
              {unit.unitUid ? `${unit.unitUid} · ` : ''}
              {unit.currentStatus === 'UNKNOWN'
                ? 'New to CycleForge — received when you print'
                : unit.title || unit.sku || 'No product yet'}
            </span>
          </span>
          <Button
            variant="ghost"
            size="md"
            icon={<X />}
            ariaLabel={`Remove ${unitKeyOf(unit)}`}
            onClick={() => onRemove(unit.id)}
            data-testid="prepack-package-remove"
          />
        </li>
      ))}
    </ul>
  );
}

/** Evidence rows: one serial photo per serial, then the package's condition (and contents) photos, counted across members. */
export function PackageEvidenceList({
  units,
  kitPartCount,
  onPhone,
  sending,
  onCapture,
}: {
  units: readonly PrepackUnit[];
  kitPartCount: number;
  onPhone: boolean;
  sending: boolean;
  onCapture: (kind: PrepackEvidenceKind, target: PrepackUnit) => void;
}) {
  const lead = units[0];
  if (!lead) return null;
  const gaps = missingPackageEvidence(units, kitPartCount);
  const rows = [
    ...units.map((unit) => ({
      id: `serial-${unit.id}`,
      kind: 'serial' as const,
      target: unit,
      label: units.length > 1 ? `${PREPACK_EVIDENCE_LABEL.serial} · ${unitKeyOf(unit)}` : PREPACK_EVIDENCE_LABEL.serial,
      count: unit.evidence.serial ?? 0,
      testId: units.length > 1 ? `prepack-evidence-serial-${unit.id}` : 'prepack-evidence-serial',
    })),
    ...requiredPrepackEvidence(kitPartCount)
      .filter((kind) => kind !== 'serial')
      .map((kind) => ({
        id: kind,
        kind,
        target: lead,
        label: PREPACK_EVIDENCE_LABEL[kind],
        count: units.reduce((sum, unit) => sum + (unit.evidence[kind] ?? 0), 0),
        testId: `prepack-evidence-${kind}`,
      })),
  ];
  return (
    <>
      <ul className="divide-y divide-mode-rule border-y border-mode-rule" aria-label="Package evidence" data-testid="prepack-evidence">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 bg-surface-card px-3 py-3" data-testid={row.testId}>
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full ${row.count > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-sunken text-text-muted'}`}
              aria-hidden
            >
              {row.count > 0 ? <Check className="size-3.5" /> : <Camera className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-all text-sm font-semibold text-mode-ink">{row.label}</span>
              <span className="block text-role-caption text-text-muted">
                {row.count === 0 ? 'Required' : row.count === 1 ? '1 photo' : `${row.count} photos`}
              </span>
            </span>
            <Button
              variant={row.count > 0 ? 'secondary' : 'primary'}
              size="md"
              icon={onPhone ? <Camera /> : <Smartphone />}
              onClick={() => onCapture(row.kind, row.target)}
              loading={!onPhone && sending}
            >
              {onPhone ? (row.count > 0 ? 'Add' : 'Take') : 'On phone'}
            </Button>
          </li>
        ))}
      </ul>
      {gaps.length > 0 ? (
        <p className="text-role-caption text-text-muted">
          Still needed: {Array.from(new Set(gaps.map((gap) => PREPACK_EVIDENCE_LABEL[gap.kind]))).join(', ')}. Counts update as each photo uploads.
        </p>
      ) : null}
    </>
  );
}

/** Every expected piece marked Included or Missing; `A` (desk) marks them all Included. */
export function ContentsChecklist({
  parts,
  decisions,
  onPhone,
  onDecide,
}: {
  parts: readonly PrepackKitPart[];
  decisions: Readonly<Record<number, boolean | undefined>>;
  onPhone: boolean;
  /** `null` part = every part. */
  onDecide: (partId: number | null, included: boolean) => void;
}) {
  if (parts.length === 0) {
    return (
      <p className="break-words rounded-mode-control border border-mode-rule bg-surface-card p-3 text-role-caption text-text-muted">
        This catalog SKU has no expected parts. Continue to the label.
      </p>
    );
  }
  return (
    <>
      <HoverTooltip label="Mark every part Included" shortcut="A" disabled={onPhone} asChild>
        <Button variant="secondary" size="md" icon={<Check />} onClick={() => onDecide(null, true)} data-testid="prepack-all-included">
          All included
        </Button>
      </HoverTooltip>
      <ul className="divide-y divide-mode-rule border-y border-mode-rule" aria-label="Expected contents">
        {parts.map((part) => {
          const decision = decisions[part.id];
          return (
            <li key={part.id} className="space-y-3 bg-surface-card px-3 py-3" data-testid="prepack-kit-part">
              <div>
                <p className="break-words text-sm font-semibold text-mode-ink">
                  {part.qtyRequired > 1 ? `${part.qtyRequired} × ` : ''}{part.componentName}
                </p>
                <p className="break-words text-role-caption text-text-muted">
                  {part.componentType.charAt(0) + part.componentType.slice(1).toLowerCase()}
                  {part.componentType === 'REMOTE' && part.componentSku ? ` · ${part.componentSku}` : ''}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={decision === true ? 'success' : 'secondary'}
                  size="lg"
                  icon={decision === true ? <Check /> : undefined}
                  onClick={() => onDecide(part.id, true)}
                >
                  Included
                </Button>
                <Button variant={decision === false ? 'danger' : 'secondary'} size="lg" onClick={() => onDecide(part.id, false)}>
                  Missing
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
