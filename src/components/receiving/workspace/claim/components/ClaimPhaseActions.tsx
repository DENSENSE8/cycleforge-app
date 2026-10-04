import type { ReactNode } from 'react';
import { Copy, Link2, Loader2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, FloatingActionFooter } from '@/design-system/primitives';
import { FLOATING_ACTION_DISABLED_FACE } from '@/design-system/tokens/dock-clearance';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimBackupStep } from './ClaimBackupStep';

function ActionsRow({
  children,
  leading,
}: {
  children: ReactNode;
  /** Left-side context (e.g. backup note beside File / Update). */
  leading?: ReactNode;
}) {
  return (
    <FloatingActionFooter
      layout="cluster"
      leading={leading}
      data-testid="claim-phase-actions"
    >
      {children}
    </FloatingActionFooter>
  );
}

function SellerActions({ c }: { c: ReceivingClaimController }) {
  const { seller } = c;
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="md"
        className={FLOATING_ACTION_DISABLED_FACE}
        disabled={!seller.sellerMessage.trim()}
        onClick={() => void seller.handleCopySellerMessage()}
        icon={<Copy className="h-4 w-4" />}
      >
        Copy
      </Button>
      <Button
        type="button"
        variant="primary"
        size="md"
        depth
        className={FLOATING_ACTION_DISABLED_FACE}
        onClick={() => void seller.finishSellerStep()}
        disabled={
          seller.aiLoading ||
          (c.mode === 'link' && c.linkUpdateStatus !== 'posted')
        }
      >
        Finish seller msg
      </Button>
    </>
  );
}

type ClaimPhase = 'ticket' | 'filed' | 'seller';

/**
 * Resolve which primary CTA the sticky footer should show from claim lifecycle
 * (not scroll position). Create and Link share one compose surface — Link uses
 * a single Link & send CTA (no separate Find-phase Link).
 */
function resolveClaimFooterPhase(c: ReceivingClaimController): ClaimPhase | null {
  const isCreate = c.mode === 'create';
  const createFiled = isCreate && !!c.filedTicket;
  const linkPosted = !isCreate && c.linkUpdateStatus === 'posted';
  const isFiledPhase = createFiled || linkPosted;

  if (!isFiledPhase) return 'ticket';
  if (c.step === 'seller' && c.sellerStepApplicable) return 'seller';
  return 'filed';
}

/** Phase primary CTAs on the floating footer. No Cancel; dismiss via header X / Displays →|. */
function ClaimPhaseActions({
  c,
  phase,
  onContinueToSeller,
}: {
  c: ReceivingClaimController;
  phase: ClaimPhase;
  onContinueToSeller?: () => void;
}) {
  const { search } = c;
  const isCreate = c.mode === 'create';

  if (phase === 'ticket') {
    const backupLeading = <ClaimBackupStep />;
    if (isCreate) {
      if (c.filedTicket) return null;
      const fileDisabled =
        c.submitting || c.archiveSubmitting || !c.row.receiving_id || !c.composeComplete;
      const fileButton = (
        <Button
          type="button"
          variant="danger"
          size="md"
          depth
          className={FLOATING_ACTION_DISABLED_FACE}
          onClick={c.submitInternal}
          disabled={fileDisabled}
          icon={
            c.submitting || c.archiveSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-3.5 w-3.5" />
            )
          }
        >
          {c.submitting
            ? 'Filing…'
            : c.archiveSubmitting
              ? 'Saving photos…'
              : 'File ticket →'}
        </Button>
      );
      return (
        <ActionsRow leading={backupLeading}>
          <HoverTooltip
            label="Add a subject and body first"
            asChild
            disabled={c.composeComplete}
          >
            {fileButton}
          </HoverTooltip>
        </ActionsRow>
      );
    }

    if (c.linkUpdateStatus === 'posted') return null;
    const busy =
      c.linkCommitStatus === 'linking' || c.linkUpdateStatus === 'posting';
    const linkDisabled =
      busy ||
      !c.row.receiving_id ||
      !search.selectedTicket ||
      !c.composeComplete;
    const linkButton = (
      <Button
        type="button"
        variant={search.selectedTicket ? 'danger' : 'primary'}
        size="md"
        depth
        className={FLOATING_ACTION_DISABLED_FACE}
        onClick={() => void c.submitLinkAndUpdate()}
        disabled={linkDisabled}
        icon={
          busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )
        }
      >
        {c.linkCommitStatus === 'linking'
          ? 'Linking…'
          : c.linkUpdateStatus === 'posting'
            ? 'Saving photos…'
            : search.selectedTicket
              ? `Link & send #${search.selectedTicket.id} →`
              : 'Choose a ticket'}
      </Button>
    );
    const tip = !search.selectedTicket
      ? 'Pick an existing ticket first'
      : !c.composeComplete
        ? 'Add a subject and body first'
        : '';
    return (
      <ActionsRow leading={backupLeading}>
        <HoverTooltip label={tip || 'Link & send'} asChild disabled={!tip}>
          {linkButton}
        </HoverTooltip>
      </ActionsRow>
    );
  }

  if (phase === 'filed') {
    if (c.sellerStepApplicable) {
      return (
        <ActionsRow>
          <Button
            type="button"
            variant="primary"
            size="md"
            depth
            onClick={() => {
              c.continueToSeller();
              onContinueToSeller?.();
            }}
          >
            Continue to seller →
          </Button>
        </ActionsRow>
      );
    }
    return (
      <ActionsRow>
        <Button type="button" variant="primary" size="md" depth onClick={c.onClose}>
          Done
        </Button>
      </ActionsRow>
    );
  }

  return (
    <ActionsRow>
      <SellerActions c={c} />
    </ActionsRow>
  );
}

/** Floating footer — backup note (ticket phase) + phase CTA (no Cancel). */
export function ClaimActionFooter({
  c,
  onContinueToSeller,
}: {
  c: ReceivingClaimController;
  onContinueToSeller?: () => void;
}) {
  const phase = resolveClaimFooterPhase(c);
  if (!phase) return null;
  return (
    <ClaimPhaseActions
      c={c}
      phase={phase}
      onContinueToSeller={onContinueToSeller}
    />
  );
}
