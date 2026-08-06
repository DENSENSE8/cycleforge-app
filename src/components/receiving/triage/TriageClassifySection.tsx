'use client';

/**
 * Classify controls — Urgency / Platform / Type.
 *
 * Shared by Arrival + Unbox Classify Displays. Flush plane on the push column
 * (no WorkspaceCard glass island) — same recipe as Package Pairing bare chrome.
 * Dimension eyebrows left; expanded options stay a **names list** (tone on the
 * active row). Collapsed value chip shows the identity face (platform mark /
 * type glyph / urgency). Carton **banner** is icon+name via `InlinePillPicker`
 * — tab icon option grids are deferred:
 * docs/todo/classify-option-icon-faces-handoff.md.
 *
 * Accordion: CSS `grid-template-rows` (not AnimatePresence exit) so switching
 * from an open row to another never stacks two option lists (layout jump).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Flag, Globe, Tag } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  INLINE_PILL_ICON_FACE,
  type InlinePillOption,
} from '../workspace/line-edit/InlinePillPicker';
import {
  platformClassifyOptions,
  typeClassifyOptions,
  urgencyClassifyOptions,
} from '../workspace/line-edit/classify-pill-options';
import { receivingPriorityRank, receivingPriorityTone } from '../workspace/line-edit/receiving-priority';
import { priorityOverrideTier } from '@/lib/receiving/priority-override';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import type { UnboxLineController } from '../workspace/line-edit/unbox-line-controller';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

type ClassifyPicker = 'urgency' | 'platform' | 'type';

type ClassifyExpandDimension = ClassifyPicker;

/** Flush Displays body — sits in the push column `px-4`; no glass card island. */
const CLASSIFY_FLUSH_HOST_CLASS = cn('min-h-0', cornerClass('flush'));

const DIMENSION_ICON: Record<ClassifyPicker, ReactNode> = {
  urgency: <Flag className="h-3.5 w-3.5" />,
  platform: <Globe className="h-3.5 w-3.5" />,
  type: <Tag className="h-3.5 w-3.5" />,
};

const RANK_TO_TIER: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3 };

export function TriageClassifySection({
  row,
  c,
  expandDimension = null,
  expandRequestId = 0,
}: {
  row: ReceivingLineRow;
  c: UnboxLineController;
  /**
   * Header bookmark handoff — open this dimension's names list when the host
   * switches to Classify (or bumps {@link expandRequestId} while already here).
   */
  expandDimension?: ClassifyExpandDimension | null;
  /** Monotonic bump so a closed row can be re-opened from the header pill. */
  expandRequestId?: number;
}) {
  const isUnmatched = row.receiving_source === 'unmatched';
  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();
  const [openPicker, setOpenPicker] = useState<ClassifyPicker | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const openPickerRef = useRef<ClassifyPicker | null>(openPicker);
  openPickerRef.current = openPicker;

  useEffect(() => {
    if (expandDimension == null) return;
    // Already expanded on this dimension — don't re-set / re-scroll (header
    // re-click while the Classify dropdown is open).
    if (openPickerRef.current === expandDimension) return;
    setOpenPicker(expandDimension);
    const t = window.setTimeout(() => {
      document
        .getElementById(`triage-classify-${expandDimension}-options`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 50);
    return () => window.clearTimeout(t);
  }, [expandDimension, expandRequestId]);

  const derivedRank = receivingPriorityRank(isUnmatched, c.sourcePlatform, false);
  const derivedTone = receivingPriorityTone(derivedRank);
  const overrideMeta = priorityOverrideTier(c.priorityTier);
  const urgencyValue = c.priorityTier != null ? String(c.priorityTier) : 'auto';
  const effectiveUrgencyLabel = overrideMeta ? overrideMeta.label : derivedTone.label;
  const effectiveUrgencyClass = overrideMeta ? overrideMeta.activeClass : derivedTone.className;
  const derivedTierEquivalent =
    c.priorityTier == null ? (RANK_TO_TIER[derivedRank] ?? null) : null;

  const urgencyOptions = urgencyClassifyOptions({
    derivedLabel: derivedTone.label,
    derivedTierEquivalent,
    autoActiveClass: 'border-border-default bg-surface-card text-text-muted',
  });
  // When Auto is selected, collapsed face still shows effective urgency tone.
  const urgencyOptionsWithEffective: InlinePillOption[] = urgencyOptions.map((o) =>
    o.value === 'auto'
      ? { ...o, activeClass: effectiveUrgencyClass }
      : o,
  );

  const platformOptions = platformClassifyOptions({
    catalogOptions: platformCatalog.options,
    isUnmatched,
  });
  const typeOptions = typeClassifyOptions({ catalogOptions: typeCatalog.options });

  const platformActive = platformOptions.find((o) => o.value === c.sourcePlatform);
  const typeActive = typeOptions.find((o) => o.value === c.receivingType);
  const urgencyActive = urgencyOptionsWithEffective.find((o) => o.value === urgencyValue);
  const platformLabel =
    platformActive?.label ?? (isUnmatched ? 'Unfound' : 'Select…');
  const typeLabel = typeActive?.label ?? 'Select…';

  const platformSet = isUnmatched
    ? true // Unfound '' is a real classification on unmatched cartons
    : c.sourcePlatform.trim().length > 0;
  const typeSet = c.receivingType.trim().length > 0;

  const handleUrgencySelect = (v: string) => {
    void c.handlePrioritySelect(v === 'auto' ? null : Number(v));
    setOpenPicker(null);
  };

  useEffect(() => {
    if (openPicker == null) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      // Header classify pills live outside this section — ignore them so a
      // re-click does not close-then-reopen the already-open dimension.
      if (
        t instanceof Element &&
        t.closest('[data-testid="carton-context-classify-pills"]')
      ) {
        return;
      }
      if (rootRef.current && !rootRef.current.contains(t)) {
        setOpenPicker(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPicker(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openPicker]);

  return (
    <div className={CLASSIFY_FLUSH_HOST_CLASS}>
      <div
        ref={rootRef}
        role="list"
        data-testid="triage-classify-checklist"
        className="divide-y divide-border-hairline"
      >
        <ClassifyDimension
          id="urgency"
          label="Urgency"
          valueLabel={effectiveUrgencyLabel}
          valueFace={urgencyActive?.face}
          valueTone={effectiveUrgencyClass}
          set
          open={openPicker === 'urgency'}
          onToggle={() => setOpenPicker((p) => (p === 'urgency' ? null : 'urgency'))}
          options={urgencyOptionsWithEffective}
          selectedValue={urgencyValue}
          onSelect={handleUrgencySelect}
        />
        <ClassifyDimension
          id="platform"
          label="Platform"
          valueLabel={platformLabel}
          valueFace={platformActive?.face}
          valueTone={platformActive?.activeClass}
          set={platformSet}
          open={openPicker === 'platform'}
          onToggle={() => setOpenPicker((p) => (p === 'platform' ? null : 'platform'))}
          options={platformOptions}
          selectedValue={c.sourcePlatform}
          disabled={row.receiving_id == null}
          onSelect={(next) => {
            c.setSourcePlatform(next);
            void c.savePlatform(next, {
              isReturn: String(c.receivingType ?? '').trim().toUpperCase() === 'RETURN',
            });
            setOpenPicker(null);
          }}
        />
        <ClassifyDimension
          id="type"
          label="Type"
          valueLabel={typeLabel}
          valueFace={typeActive?.face}
          valueTone={typeActive?.activeClass}
          set={typeSet}
          open={openPicker === 'type'}
          onToggle={() => setOpenPicker((p) => (p === 'type' ? null : 'type'))}
          options={typeOptions}
          selectedValue={c.receivingType}
          onSelect={(next) => {
            c.setReceivingType(next);
            void c.saveType(next);
            setOpenPicker(null);
          }}
        />
      </div>
    </div>
  );
}

function ClassifyDimension({
  id,
  label,
  valueLabel,
  valueFace,
  valueTone,
  set,
  open,
  onToggle,
  options,
  selectedValue,
  onSelect,
  disabled = false,
}: {
  id: ClassifyPicker;
  label: string;
  valueLabel: string;
  valueFace?: ReactNode;
  valueTone?: string;
  set: boolean;
  open: boolean;
  onToggle: () => void;
  options: InlinePillOption[];
  selectedValue: string;
  onSelect: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="listitem"
      className={cn(disabled && 'pointer-events-none opacity-50', open && 'bg-surface-hover/40')}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`triage-classify-${id}-options`}
        aria-label={`${label}: ${valueLabel} — click to ${open ? 'collapse' : 'classify'}`}
        title={options.find((o) => o.value === selectedValue)?.title}
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-2.5 inset-cozy text-left',
          focusRing('control', 'accent'),
        )}
      >
        <span
          className={cn(
            'grid h-5 w-5 shrink-0 place-items-center transition-colors',
            cornerClass('flush'),
            set ? 'text-text-muted' : 'text-text-faint',
          )}
          aria-hidden
        >
          {DIMENSION_ICON[id]}
        </span>
        <span className="min-w-0 flex-1 truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          {label}
        </span>
        {/* Keep the identity chip mounted while open — hiding it caused a
            horizontal jump when switching accordion rows. */}
        {set && valueFace ? (
          <span className={cn(INLINE_PILL_ICON_FACE, valueTone)} aria-hidden>
            <span className="grid place-items-center">{valueFace}</span>
          </span>
        ) : (
          <span
            className={cn(
              'max-w-[50%] truncate text-role-caption font-semibold',
              set ? 'text-text-default' : 'text-text-faint',
            )}
          >
            {valueLabel}
          </span>
        )}
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-faint transition-transform duration-150 ease-out motion-reduce:transition-none',
            open && 'rotate-90',
          )}
          aria-hidden
        />
      </button>

      {/* grid-template-rows: only one row is 1fr at a time — no AnimatePresence
          exit stacking (that was the open→open jump). */}
      <div
        id={`triage-classify-${id}-options`}
        role="radiogroup"
        aria-label={label}
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              'pb-2 pl-9 pr-2 transition-opacity duration-150 ease-out motion-reduce:transition-none',
              open ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
          >
            <div className="flex flex-col gap-0.5">
              {options.map((opt) => {
                const isActive = opt.value === selectedValue;
                return (
                  <button
                    key={opt.value || '__none__'}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    tabIndex={open ? 0 : -1}
                    title={opt.title ?? opt.label}
                    onClick={() => onSelect(opt.value)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors',
                      cornerClass('flush'),
                      focusRing('control', 'accent'),
                      isActive
                        ? opt.activeClass ??
                            'bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-200'
                        : 'text-text-default hover:bg-surface-hover',
                    )}
                  >
                    <span className="text-role-caption font-semibold">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
