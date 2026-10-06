'use client';

/**
 * Resolve, guarded — the flow the record's status verb (top-right) unfolds.
 * The item's blockers (an unanswered customer message, an overdue follow-up,
 * a reply copied but not confirmed sent, …) are listed in their own words;
 * resolving is refused while any remain unless the staffer chooses Override
 * AND types the reason. A post-purchase check-in resolves through how it
 * ended — Happy or Had an issue (operator 2026-10-05) — and, once chased,
 * also offers "Close — no response" (reason required). Who resolved it and
 * why is the status verb's own line once it is resolved.
 */

import { useState } from 'react';
import { CircleSlash } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { TextField } from '@/design-system/primitives/TextField';
import { CHECK_IN_OUTCOMES, SUPPORT_RESOLVE_BLOCKER_LABEL, type CheckInOutcome, type SupportItemView, type SupportResolveBlocker } from '@/lib/support/conversation/model';
import { toast } from '@/lib/toast';
import {
  CHECK_IN_OUTCOME_LABEL,
  supportCanCloseNoResponse,
  supportResolveLabel,
  supportResolveRequest,
} from '@/lib/support/record/support-record-model';
import { SupportRequestError, useSupportItemActions } from '@/lib/support/record/use-support-item';

export function SupportResolve({ item, onOpenChange }: { item: SupportItemView; onOpenChange: (open: boolean) => void }) {
  const { resolve } = useSupportItemActions(item.id);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  // A 409 answers with the server's current blockers; they replace the cached list until the bundle refetches.
  const [serverBlockers, setServerBlockers] = useState<SupportResolveBlocker[] | null>(null);
  const blockers = serverBlockers ?? item.resolveBlockers;
  const label = supportResolveLabel(item);

  const submit = (disposition?: 'resolved' | 'no_response_closed', outcome?: CheckInOutcome) => {
    const request = supportResolveRequest({ blockers, override, reason, disposition, outcome });
    if (!request.ok) {
      toast.error(request.error);
      return;
    }
    resolve.mutate(request.body, {
      onSuccess: () => {
        setReason('');
        setOverride(false);
        setServerBlockers(null);
        onOpenChange(false);
      },
      onError: (err) => {
        if (err instanceof SupportRequestError && err.blockers.length > 0) setServerBlockers(err.blockers);
        toast.error(err.message);
      },
    });
  };

  const canCloseNoResponse = supportCanCloseNoResponse(item.checkIn);
  const blocked = blockers.length > 0;

  return (
    <section aria-label={label} className="flex flex-col gap-2 p-3" data-testid="support-resolve-flow">
      <p className="text-role-data font-semibold text-text-default">{label}</p>
      {blocked ? (
        <ul className="flex flex-col gap-1" aria-label="Blockers" data-testid="support-resolve-blockers">
          {blockers.map((b) => (
            <li key={b} className="flex items-center gap-1.5 text-role-caption text-text-danger" data-testid={`support-resolve-blocker-${b}`}>
              <CircleSlash aria-hidden className="size-3.5 shrink-0" />
              {SUPPORT_RESOLVE_BLOCKER_LABEL[b]}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-role-caption text-text-muted">Nothing is waiting on this item.</p>
      )}
      {blocked ? (
        <label className="flex items-center gap-2 text-role-caption text-text-default">
          <Checkbox checked={override} onCheckedChange={(v) => setOverride(v === true)} data-testid="support-resolve-override" />
          Override — resolve anyway
        </label>
      ) : null}
      {blocked && override ? (
        <TextField
          label="Why it resolves anyway"
          value={reason}
          onChange={setReason}
          multiline
          rows={2}
          data-testid="support-resolve-override-reason"
        />
      ) : !blocked ? (
        <TextField
          label={canCloseNoResponse ? 'Reason (required to close without a response)' : 'Resolution note (optional)'}
          value={reason}
          onChange={setReason}
          multiline
          rows={2}
          data-testid="support-resolve-reason"
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        {canCloseNoResponse ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={!reason.trim() || (blocked && !override)}
            loading={resolve.isPending && resolve.variables?.checkInDisposition === 'no_response_closed'}
            onClick={() => submit('no_response_closed')}
            data-testid="support-close-no-response"
          >
            Close — no response
          </Button>
        ) : null}
        {item.checkIn ? (
          <div role="group" aria-label="Resolve as — how the check-in ended" className="flex items-center gap-2" data-testid="support-resolve-outcome">
            <span className="text-role-caption text-text-muted">Resolve as</span>
            {CHECK_IN_OUTCOMES.map((outcome) => (
              <Button
                key={outcome}
                variant={outcome === 'happy' ? 'success' : 'warning'}
                size="sm"
                disabled={resolve.isPending || (blocked && (!override || !reason.trim()))}
                loading={resolve.isPending && resolve.variables?.checkInOutcome === outcome}
                onClick={() => submit('resolved', outcome)}
                data-testid={`support-resolve-outcome-${outcome}`}
              >
                {CHECK_IN_OUTCOME_LABEL[outcome]}
              </Button>
            ))}
          </div>
        ) : (
          <Button
            variant="success"
            size="sm"
            disabled={blocked && (!override || !reason.trim())}
            loading={resolve.isPending}
            onClick={() => submit()}
            data-testid="support-resolve-confirm"
          >
            {label}
          </Button>
        )}
      </div>
    </section>
  );
}
