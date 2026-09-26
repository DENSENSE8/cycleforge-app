'use client';

/**
 * KioskReasonStep — step 0 of the kiosk repair flow: the step header with its
 * Add CTA opposite, an inline entry for a new reason, and the reason pills —
 * for every unit at once, or unit by unit.
 *
 * Self-contained on purpose. The entry's open/draft state, the All/Per/All
 * issues view and the device-authed vocabulary hook
 * ({@link useKioskSkuReasons}) belong to THIS step, not to the pane that
 * happens to show it — `KioskRepairPane` already carries the cart lines, the
 * form data, the gates and two other steps.
 *
 * ## Reasons are a LINE fact (2026-09-25)
 *
 * Operator: reasons are "contextual — all units, or per unit, with a
 * switcher". Each unit's reasons live on ITS cart line
 * (`RepairPayload.repairReasons`), which is the row the counter writes as that
 * unit's `repair_service.issue`. This step reads them off the devices it is
 * handed and writes them back through ONE callback naming the lines:
 *   - **All devices** — one set, written to every unit (the default, and the
 *     only face a single-device visit shows);
 *   - **Per device** — a switcher of units grouped by SKU (Device & quote's
 *     grouping); each unit picks from its OWN SKU's vocabulary;
 *   - **All issues** — a read view of every unit with its reasons; tapping a
 *     unit opens it under Per device.
 * Linked repairs never arrive here: `repairDevicesFromLines` drops them.
 *
 * Callers: `KioskRepairPane` (step 0). Affected API:
 * `/api/kiosk/repair/issues` via the hook. Schemas: none.
 * User: "there should be an add button top right as a CTA button so you would
 * be able to add a reason for repair for that SKU specifically".
 */

import { useState } from 'react';
import { Button } from '@/design-system/primitives';
import { Check, Plus } from '@/components/Icons';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { ReasonSelector } from '@/components/repair/ReasonSelector';
import { useKioskSkuReasons } from '@/components/repair/useKioskSkuReasons';
import {
  mergeReasonLabel,
  SKU_REASON_LABEL_MAX,
  visibleReasonBase,
} from '@/lib/repair/sku-reasons';
import {
  sharedRepairReasons,
  type KioskRepairDevice,
  type KioskRepairDeviceGroup,
} from '@/lib/kiosk/repair-devices';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { MOBILE_SCAN_ROW_CORNER, cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

type ReasonView = 'all' | 'unit' | 'issues';

/**
 * A unit's identity under its (often long, truncating) product title: the SKU
 * that groups it, and its number when that SKU has several units — the part
 * of the name that must never be the part an ellipsis eats.
 */
function unitTag(group: KioskRepairDeviceGroup, index: number): string {
  return [group.sku, group.units.length > 1 ? `Unit ${index + 1} of ${group.units.length}` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The set All devices applies when the units disagree: the unit on screen's,
 * or — when that one is still blank — the first unit that has answered, so
 * the toggle can never erase an answer by stamping an empty set over it.
 */
function adoptedReasons(units: readonly KioskRepairDevice[], active: KioskRepairDevice | undefined): string[] {
  if (active && active.repairReasons.length > 0) return active.repairReasons;
  return units.find((u) => u.repairReasons.length > 0)?.repairReasons ?? [];
}

export function KioskReasonStep({
  heading,
  groups,
  notes,
  onReasonsChange,
  onNotesChange,
}: {
  /** The step's own bold display header — rendered top-left, CTA opposite. */
  heading: string;
  /** The visit's units, grouped by product (`repairDeviceGroups`). */
  groups: readonly KioskRepairDeviceGroup[];
  /** Visit notes — one text for every unit, mirrored onto each line by the pane. */
  notes: string;
  /** Write `reasons` onto exactly these lines. The ONE reasons writer. */
  onReasonsChange: (lineIds: readonly string[], reasons: string[]) => void;
  onNotesChange: (notes: string) => void;
}) {
  const units = groups.flatMap((group) => group.units);
  const multi = units.length > 1;
  const shared = sharedRepairReasons(units);

  /*
   * Opens on All devices unless the lines already disagree (a resume after
   * per-device answers, or a unit added since) — then on Per device, at the
   * first unit still without a reason.
   */
  const [view, setView] = useState<ReasonView>(() => (multi && shared === null ? 'unit' : 'all'));
  const [activeLineId, setActiveLineId] = useState<string | null>(
    () => (units.find((u) => u.repairReasons.length === 0) ?? units[0])?.lineId ?? null,
  );
  const active = units.find((u) => u.lineId === activeLineId) ?? units[0];
  const allLineIds = units.map((u) => u.lineId);

  // A single unit has nothing to choose between: it is always All devices.
  const face: ReasonView = multi ? view : 'all';
  const allSkus = new Set(units.map((u) => u.sku ?? null));
  /*
   * Whose vocabulary is on screen. Per device: the unit's own SKU. All
   * devices: the SKU they share, else none — the endpoint then answers with
   * the org's global reasons, which every SKU's list also carries, so a pick
   * here is a label every unit knows.
   */
  const sourceSku =
    face === 'all'
      ? allSkus.size === 1
        ? ([...allSkus][0] ?? null)
        : null
      : (active?.sku ?? null);
  const targetIds = face === 'all' ? allLineIds : active ? [active.lineId] : [];
  const selectedReasons =
    face === 'all' ? (shared ?? adoptedReasons(units, active)) : (active?.repairReasons ?? []);

  const [entryOpen, setEntryOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { labels, adding, addReason } = useKioskSkuReasons(sourceSku);
  /*
   * A picked reason always has its pill. A set applied from another unit's
   * SKU (Per device → All devices) can hold a label this vocabulary lacks;
   * without this it would count toward the gate while no pill showed it.
   */
  const skuIssues = selectedReasons.every((r) => labels.includes(r))
    ? labels
    : selectedReasons.reduce<string[]>(
        (acc, reason) => mergeReasonLabel(acc, reason),
        [...visibleReasonBase(labels)],
      );

  /**
   * Switch views. Rule for Per device → All devices: ask nothing, and when
   * the units disagree apply the set on screen to every unit
   * ({@link adoptedReasons}). All devices → Per device writes nothing — every
   * unit already carries the shared set — and All issues is read-only.
   */
  const choose = (next: ReasonView) => {
    if (next === 'all' && shared === null) onReasonsChange(allLineIds, adoptedReasons(units, active));
    setEntryOpen(false);
    setView(next);
  };

  /**
   * Add a reason for THIS SKU and pick it.
   *
   * Selecting it is the point: the operator typed it while answering "Reason
   * for repair" for the device on the counter, so it is both a new vocabulary
   * row for the SKU and this repair's answer. One tap on the pill undoes the
   * selection; the row stays.
   *
   * Pill, selection and closing the entry all happen in ONE frame, before the
   * POST — the paint is the feedback. Waiting for the server first left the
   * pill on screen but unselected for the round trip, which reads as the tap
   * having missed. A failure takes the selection back with it (the hook rolls
   * back the pill itself and toasts).
   */
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const label = draft.trim();
    if (!label) return;
    const ids = targetIds;
    onReasonsChange(ids, mergeReasonLabel(selectedReasons, label));
    setDraft('');
    setEntryOpen(false);
    const saved = await addReason(label);
    if (!saved) onReasonsChange(ids, selectedReasons.filter((r) => r !== label));
  };

  const canAdd = face !== 'issues' && !!sourceSku;

  return (
    <>
      {/* ONE main header per step, top-left, in the display role at bold weight
          (operator 2026-09-14: "main header as a black font and text… like
          'reason for repair', top left"), with the Add CTA opposite it inside
          the same measure. `secondary`, not a second primary: the step's
          primary key is Continue, on the footer. */}
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
        <h2 className="min-w-0 text-left text-role-display font-bold text-text-default">
          {heading}
        </h2>
        <Button
          variant="secondary"
          size="md"
          icon={<Plus />}
          disabled={!canAdd}
          title={
            canAdd
              ? undefined
              : face === 'all' && multi
                ? 'Switch to Per device to add a reason to one SKU'
                : 'Pick a catalog service to add a reason to it'
          }
          onClick={() => setEntryOpen((open) => !open)}
          aria-expanded={entryOpen}
          data-testid="kiosk-repair-add-reason"
        >
          Add
        </Button>
      </div>

      <div className="bg-surface-card pb-4">
        {multi ? (
          <div className="flex flex-col gap-2 px-4 pb-3">
            {/* The ticket slider's track (`KioskTicketStep`): one sunken pill
                holding `KioskChip row` halves, the selected one a raised
                `thumb`. One control with a position, not three stacked pills. */}
            <div
              className={cn('flex items-stretch gap-1 bg-surface-sunken p-1', cornerClass('pill'))}
              role="group"
              aria-label="Reasons for"
            >
              {(
                [
                  ['all', 'All devices'],
                  ['unit', 'Per device'],
                  ['issues', 'All issues'],
                ] as const
              ).map(([id, label]) => (
                <div key={id} className="min-w-0 flex-1">
                  <KioskChip
                    face="row"
                    tone={face === id ? 'thumb' : 'idle'}
                    selected={face === id}
                    onClick={() => choose(id)}
                    className="justify-center text-center"
                    testId={`kiosk-repair-reason-mode-${id}`}
                  >
                    {label}
                  </KioskChip>
                </div>
              ))}
            </div>

            {face === 'unit' ? (
              // The UNIT switcher, in Device & quote's order: grouped by
              // product, numbered within a product. A Check marks a unit that
              // has its answer — glyph and text together, never colour alone.
              <div
                className={cn(
                  'grid grid-cols-2 gap-1 bg-surface-sunken p-1',
                  units.length <= 2 ? cornerClass('pill') : MOBILE_SCAN_ROW_CORNER,
                )}
                role="group"
                aria-label="Device"
              >
                {groups.flatMap((group) =>
                  group.units.map((unit, i) => {
                    const on = unit.lineId === active?.lineId;
                    return (
                      <KioskChip
                        key={unit.lineId}
                        face="row"
                        tone={on ? 'thumb' : 'idle'}
                        selected={on}
                        onClick={() => {
                          setEntryOpen(false);
                          setActiveLineId(unit.lineId);
                        }}
                        testId={`kiosk-repair-reason-unit-${allLineIds.indexOf(unit.lineId)}`}
                        ariaLabel={`${group.title} ${unitTag(group, i)}${unit.repairReasons.length > 0 ? ', has a reason' : ', no reason yet'}`}
                        trailing={
                          unit.repairReasons.length > 0 ? (
                            <Check className="h-4 w-4 shrink-0 text-text-default" aria-hidden />
                          ) : null
                        }
                      >
                        <span className="block truncate">{group.title}</span>
                        <span className={cn('block truncate', KIOSK_META)}>
                          {unitTag(group, i) || 'Custom device'}
                        </span>
                      </KioskChip>
                    );
                  }),
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {face === 'issues' ? (
          /* ALL ISSUES — every unit and what is wrong with it, the read view.
             A card per unit in `KioskTicketStep`'s candidate anatomy (hairline
             + row corner, title line, facts as meta chips); tapping one opens
             that unit under Per device. */
          <div className="flex flex-col gap-2 px-4" data-testid="kiosk-repair-reason-issues">
            {groups.flatMap((group) =>
              group.units.map((unit, i) => (
                <button
                  key={unit.lineId}
                  type="button"
                  className={cn(
                    'ds-raw-button flex w-full flex-col gap-2 border border-border-hairline bg-surface-card px-4 py-3 text-left transition-colors hover:bg-surface-hover active:bg-surface-hover',
                    MOBILE_SCAN_ROW_CORNER,
                  )}
                  onClick={() => {
                    setActiveLineId(unit.lineId);
                    setView('unit');
                  }}
                  data-testid="kiosk-repair-reason-issue-row"
                  data-line-id={unit.lineId}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold text-text-default">
                      {group.title}
                    </span>
                    <span className={cn('shrink-0', KIOSK_META)}>{unitTag(group, i)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {unit.repairReasons.length > 0 ? (
                      unit.repairReasons.map((reason) => (
                        <KioskChip key={reason} tone="issue">
                          {reason}
                        </KioskChip>
                      ))
                    ) : (
                      <KioskChip tone={notes.trim() ? 'idle' : 'warning'}>
                        {notes.trim() ? 'Notes only' : 'No reason yet'}
                      </KioskChip>
                    )}
                  </span>
                </button>
              )),
            )}
            {notes.trim() ? (
              <p className={cn('pt-1', KIOSK_META)}>Notes for every device: {notes.trim()}</p>
            ) : null}
          </div>
        ) : (
          <>
            {entryOpen ? (
              // A form, so the tablet keyboard's Go key commits — there is no
              // hardware Enter at the counter.
              <form onSubmit={submit} className="flex items-center gap-2 px-3 pb-3">
                <div className="min-w-0 flex-1">
                  <KioskEntryField
                    name="New reason for this device"
                    value={draft}
                    maxLength={SKU_REASON_LABEL_MAX}
                    testId="kiosk-repair-reason-draft"
                    onChange={setDraft}
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  loading={adding}
                  disabled={!draft.trim()}
                  data-testid="kiosk-repair-reason-save"
                >
                  Save
                </Button>
              </form>
            ) : null}
            <ReasonSelector
              appearance="pills"
              selectedReasons={selectedReasons}
              notes={notes}
              onReasonsChange={(reasons) => onReasonsChange(targetIds, reasons)}
              onNotesChange={onNotesChange}
              skuIssues={skuIssues}
            />
          </>
        )}
      </div>
    </>
  );
}
