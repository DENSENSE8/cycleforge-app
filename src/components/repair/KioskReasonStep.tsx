'use client';

/**
 * KioskReasonStep — step 0 of the kiosk repair flow: the step header with its
 * Add CTA opposite, an inline entry for a new reason, and the reason pills.
 *
 * Self-contained on purpose. The entry's open/draft state and the device-authed
 * vocabulary hook ({@link useKioskSkuReasons}) belong to THIS step, not to the
 * pane that happens to show it — `KioskRepairPane` already carries the cart
 * line, the form data, the gates and two other steps.
 *
 * Callers: `KioskRepairPane` (step 0). Affected API:
 * `/api/kiosk/repair/issues` via the hook. Schemas: none.
 * User: "there should be an add button top right as a CTA button so you would
 * be able to add a reason for repair for that SKU specifically".
 */

import { useCallback, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { Plus } from '@/components/Icons';
import { KioskEntryField } from '@/components/kiosk/KioskCustomerIntake';
import { ReasonSelector } from '@/components/repair/ReasonSelector';
import { useKioskSkuReasons } from '@/components/repair/useKioskSkuReasons';
import { mergeReasonLabel, SKU_REASON_LABEL_MAX } from '@/lib/repair/sku-reasons';

export function KioskReasonStep({
  heading,
  sourceSku,
  selectedReasons,
  notes,
  onReasonsChange,
  onNotesChange,
}: {
  /** The step's own bold display header — rendered top-left, CTA opposite. */
  heading: string;
  /** SKU the reason is scoped to. Null (e.g. an "Other" pick) disables Add. */
  sourceSku: string | null;
  selectedReasons: string[];
  notes: string;
  onReasonsChange: (reasons: string[]) => void;
  onNotesChange: (notes: string) => void;
}) {
  const [entryOpen, setEntryOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { labels: skuIssues, adding, addReason } = useKioskSkuReasons(sourceSku);

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
  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const label = draft.trim();
      if (!label) return;
      onReasonsChange(mergeReasonLabel(selectedReasons, label));
      setDraft('');
      setEntryOpen(false);
      const saved = await addReason(label);
      if (!saved) onReasonsChange(selectedReasons.filter((r) => r !== label));
    },
    [addReason, draft, onReasonsChange, selectedReasons],
  );

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
          disabled={!sourceSku}
          title={sourceSku ? undefined : 'Pick a catalog service to add a reason to it'}
          onClick={() => setEntryOpen((open) => !open)}
          aria-expanded={entryOpen}
          data-testid="kiosk-repair-add-reason"
        >
          Add
        </Button>
      </div>

      <div className="bg-surface-card pb-4">
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
          onReasonsChange={onReasonsChange}
          onNotesChange={onNotesChange}
          skuIssues={skuIssues}
        />
      </div>
    </>
  );
}
