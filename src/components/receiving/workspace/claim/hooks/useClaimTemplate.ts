import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClaimType } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { CLAIM_TYPE_LABEL } from '@/lib/receiving-claim-type';
import { resolveClaimSubjectIdentity } from '@/lib/zendesk-claim-subject-identity';
import {
  buildClaimSubject,
  type ClaimSubjectParts,
} from '@/lib/zendesk-claim-subject';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';

export interface ClaimCartonIdentityPatch {
  sourcePlatform?: string | null;
  receivingType?: string | null;
  isReturn?: boolean | null;
  returnPlatform?: string | null;
  catalogPlatformLabel?: string | null;
  catalogTypeLabel?: string | null;
}

export interface UseClaimTemplate {
  subject: string;
  description: string;
  previewLoading: boolean;
  /** True once the operator has manually edited subject or body. */
  edited: boolean;
  onSubjectChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  /** Re-fetch the server template and overwrite the editable fields. */
  resetTemplate: () => void;
  /**
   * Patch only the subject identity segment from carton platform/type.
   * Does not refetch body / PO / tracking. No-op when subject is touched or a
   * linked ticket owns the title.
   */
  applyCartonIdentity: (patch: ClaimCartonIdentityPatch) => void;
  /** Read the latest values without re-rendering (for submit/draft payloads). */
  readSubject: () => string;
  readDescription: () => string;
}

interface Params {
  open: boolean;
  /** Only fetch the preview on the create→internal step. */
  active: boolean;
  receivingId: number | null | undefined;
  lineId: number | null | undefined;
  claimType: ClaimType;
  /**
   * Seed carton identity for inline subject patches (Classify / claim selects).
   */
  initialSourcePlatform?: string | null;
  initialReceivingType?: string | null;
  initialIsReturn?: boolean | null;
  initialReturnPlatform?: string | null;
  /**
   * The link flow's already-linked ticket id. When set, the subject seeds
   * from THAT ticket's real title (not the generated PO template) — the
   * operator is updating an existing ticket, not naming a new one.
   */
  linkedTicketId?: number | null;
  /**
   * Subject already on the selected link candidate. Applied synchronously when
   * the ticket is picked so Subject does not wait on the thread API.
   */
  linkedTicketSubject?: string | null;
}

type CartonIdentityState = {
  sourcePlatform: string | null;
  receivingType: string | null;
  isReturn: boolean | null;
  returnPlatform: string | null;
  catalogPlatformLabel: string | null;
  catalogTypeLabel: string | null;
};

/** Owns the editable Zendesk ticket template. */
export function useClaimTemplate({
  open,
  active,
  receivingId,
  lineId,
  claimType,
  initialSourcePlatform = null,
  initialReceivingType = null,
  initialIsReturn = null,
  initialReturnPlatform = null,
  linkedTicketId,
  linkedTicketSubject,
}: Params): UseClaimTemplate {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [edited, setEdited] = useState(false);
  const subjectTouched = useRef(false);
  const descriptionTouched = useRef(false);
  // Bumped by resetTemplate to force the preview effect to re-run even when the
  // upstream inputs are unchanged.
  const [resetNonce, setResetNonce] = useState(0);
  const subjectRef = useRef('');
  const descriptionRef = useRef('');
  subjectRef.current = subject;
  descriptionRef.current = description;
  // Ref so in-flight preview `.then`s see the latest pick (stale closure race).
  const linkedTicketIdRef = useRef(linkedTicketId ?? null);
  linkedTicketIdRef.current = linkedTicketId ?? null;
  const claimTypeRef = useRef(claimType);
  claimTypeRef.current = claimType;
  /** Prior claim type — detect claim-only flips so Subject identity is preserved. */
  const prevClaimTypeRef = useRef<ClaimType | null>(null);
  const prevResetNonceRef = useRef(resetNonce);

  const identityRef = useRef<CartonIdentityState>({
    sourcePlatform: initialSourcePlatform,
    receivingType: initialReceivingType,
    isReturn: initialIsReturn,
    returnPlatform: initialReturnPlatform,
    catalogPlatformLabel: null,
    catalogTypeLabel: null,
  });

  /** Server-rendered subject parts — the only input the title is made from. */
  const subjectPartsRef = useRef<ClaimSubjectParts | null>(null);

  // Open-time carton identity only — live Platform/Type saves update the row
  // props; those must not re-clear Subject/Body (inline applyCartonIdentity +
  // receiving-package-updated own mid-session identity patches).
  const identitySeedRef = useRef({
    sourcePlatform: initialSourcePlatform,
    receivingType: initialReceivingType,
    isReturn: initialIsReturn,
    returnPlatform: initialReturnPlatform,
  });
  identitySeedRef.current = {
    sourcePlatform: initialSourcePlatform,
    receivingType: initialReceivingType,
    isReturn: initialIsReturn,
    returnPlatform: initialReturnPlatform,
  };

  // Clear the template when the panel opens or the carton/line changes — never
  // when Classify props drift mid-session after a Platform/Type save.
  useEffect(() => {
    if (!open) {
      prevClaimTypeRef.current = null;
      return;
    }
    const seed = identitySeedRef.current;
    setSubject('');
    setDescription('');
    setEdited(false);
    subjectTouched.current = false;
    descriptionTouched.current = false;
    prevClaimTypeRef.current = null;
    identityRef.current = {
      sourcePlatform: seed.sourcePlatform,
      receivingType: seed.receivingType,
      isReturn: seed.isReturn,
      returnPlatform: seed.returnPlatform,
      catalogPlatformLabel: null,
      catalogTypeLabel: null,
    };
  }, [open, receivingId, lineId]);

  /** Re-render the WHOLE title from the parts the server shipped plus the in-panel classify state. */
  const renderSubjectFromState = useCallback(() => {
    if (subjectTouched.current) return;
    if (linkedTicketIdRef.current) return;
    const parts = subjectPartsRef.current;
    if (!parts) return;
    const id = identityRef.current;
    setSubject(
      buildClaimSubject({
        ...parts,
        identity: resolveClaimSubjectIdentity({
          sourcePlatform: id.sourcePlatform,
          receivingType: id.receivingType,
          isReturn: id.isReturn,
          returnPlatform: id.returnPlatform,
          claimTypeLabel: CLAIM_TYPE_LABEL[claimTypeRef.current],
          catalogPlatformLabel: id.catalogPlatformLabel,
          catalogTypeLabel: id.catalogTypeLabel,
        }),
        claimTypeLabel: CLAIM_TYPE_LABEL[claimTypeRef.current],
      }),
    );
  }, []);

  const applyCartonIdentity = useCallback(
    (patch: ClaimCartonIdentityPatch) => {
      const cur = identityRef.current;
      const nextPlatform =
        patch.sourcePlatform !== undefined
          ? patch.sourcePlatform
          : cur.sourcePlatform;
      const nextType =
        patch.receivingType !== undefined ? patch.receivingType : cur.receivingType;
      const nextIsReturn =
        patch.isReturn !== undefined
          ? patch.isReturn
          : patch.receivingType !== undefined
            ? String(patch.receivingType ?? '').trim().toUpperCase() === 'RETURN'
            : cur.isReturn;
      const nextReturnPlatform =
        patch.returnPlatform !== undefined
          ? patch.returnPlatform
          : patch.sourcePlatform !== undefined && nextIsReturn
            ? returnPlatformForSource(String(patch.sourcePlatform ?? ''))
            : cur.returnPlatform;
      identityRef.current = {
        sourcePlatform: nextPlatform ?? null,
        receivingType: nextType ?? null,
        isReturn: nextIsReturn ?? null,
        returnPlatform: nextReturnPlatform ?? null,
        catalogPlatformLabel:
          patch.catalogPlatformLabel !== undefined
            ? patch.catalogPlatformLabel
            : cur.catalogPlatformLabel,
        catalogTypeLabel:
          patch.catalogTypeLabel !== undefined
            ? patch.catalogTypeLabel
            : cur.catalogTypeLabel,
      };
      renderSubjectFromState();
    },
    [renderSubjectFromState],
  );

  useEffect(() => {
    if (!open || !active || !receivingId) return;
    const claimTypeOnly =
      prevClaimTypeRef.current != null &&
      prevClaimTypeRef.current !== claimType &&
      prevResetNonceRef.current === resetNonce;
    prevClaimTypeRef.current = claimType;
    prevResetNonceRef.current = resetNonce;

    const ctrl = new AbortController();
    setPreviewLoading(true);
    fetch('/api/receiving/zendesk-claim/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receivingId,
        lineId,
        claimType,
      }),
      signal: ctrl.signal,
    })
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (!data?.success) return;
        if (data.subjectParts && typeof data.subjectParts === 'object') {
          subjectPartsRef.current = data.subjectParts as ClaimSubjectParts;
        }
        // Link flow: the picked ticket's real title owns Subject; the preview
        // may still refresh Body. Ref, not prop — a response started before the
        // pick must not clobber that title.
        if (!subjectTouched.current && !linkedTicketIdRef.current) {
          // ONE composer: re-render from the parts the server just shipped plus
          // the in-panel Platform/Type. A claim-type flip is not a special case
          // any more — it is the same render with a different label.
          if (subjectPartsRef.current) {
            renderSubjectFromState();
          } else if (typeof data.subject === 'string') {
            setSubject(data.subject);
          }
        }
        if (!descriptionTouched.current && typeof data.description === 'string') {
          setDescription(data.description);
        }
      })
      .catch((err) => {
        if ((err as Error)?.name !== 'AbortError') {
          // Preview is best-effort — operator can still type their own.
        }
      })
      .finally(() => setPreviewLoading(false));
    return () => {
      ctrl.abort();
    };
  }, [open, active, receivingId, lineId, claimType, resetNonce, renderSubjectFromState]);

  // Reclassify (platform / type) while claim is open — patch SUBJECT identity only.
  // Never bump resetNonce (that reloads body / PO / tracking and flashes compose).
  useEffect(() => {
    if (!open || !active || !receivingId) return;
    const onPackageUpdated = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          receiving_id?: number;
          source_platform?: string | null;
          intake_type?: string | null;
          is_return?: boolean;
          return_platform?: string | null;
        }>
      ).detail;
      if (Number(detail?.receiving_id) !== Number(receivingId)) return;
      // Identity-only events. Listing-url / PO pairing noise must not touch subject.
      if (
        detail.source_platform === undefined &&
        detail.intake_type === undefined &&
        detail.is_return === undefined &&
        detail.return_platform === undefined
      ) {
        return;
      }
      applyCartonIdentity({
        sourcePlatform:
          detail.source_platform !== undefined
            ? detail.source_platform
            : undefined,
        receivingType:
          detail.intake_type !== undefined ? detail.intake_type : undefined,
        isReturn: detail.is_return !== undefined ? detail.is_return : undefined,
        returnPlatform:
          detail.return_platform !== undefined
            ? detail.return_platform
            : undefined,
      });
    };
    window.addEventListener('receiving-package-updated', onPackageUpdated);
    return () => {
      window.removeEventListener('receiving-package-updated', onPackageUpdated);
    };
  }, [open, active, receivingId, applyCartonIdentity]);

  // Link: apply the candidate subject immediately (no network). Thread fetch
  // below is a fallback when the list row had no subject.
  useEffect(() => {
    if (!open || !active || !linkedTicketId) return;
    const fromCandidate =
      typeof linkedTicketSubject === 'string' ? linkedTicketSubject.trim() : '';
    if (!subjectTouched.current && fromCandidate) {
      setSubject(fromCandidate);
    }
  }, [open, active, linkedTicketId, linkedTicketSubject]);

  // Link flow fallback: once a ticket is linked with an empty candidate
  // subject, prefill from the thread API title. Body stays on the template.
  useEffect(() => {
    if (!open || !active || !linkedTicketId) return;
    const fromCandidate =
      typeof linkedTicketSubject === 'string' ? linkedTicketSubject.trim() : '';
    if (fromCandidate) return;
    const ctrl = new AbortController();
    fetch(`/api/receiving/zendesk-claim/thread?ticketId=${linkedTicketId}`, { signal: ctrl.signal })
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        const ticketSubject =
          typeof data?.ticket?.subject === 'string' ? data.ticket.subject.trim() : '';
        if (!subjectTouched.current && ticketSubject) {
          setSubject(ticketSubject);
        }
      })
      .catch(() => {
        /* best-effort — the generated/template subject still stands */
      });
    return () => {
      ctrl.abort();
    };
  }, [open, active, linkedTicketId, linkedTicketSubject, resetNonce]);

  const onSubjectChange = (v: string) => {
    subjectTouched.current = true;
    setEdited(true);
    setSubject(v);
  };

  const onDescriptionChange = (v: string) => {
    descriptionTouched.current = true;
    setEdited(true);
    setDescription(v);
  };

  const resetTemplate = () => {
    subjectTouched.current = false;
    descriptionTouched.current = false;
    setEdited(false);
    // Force a refetch so the fields repopulate from the server template.
    setResetNonce((n) => n + 1);
  };

  return {
    subject,
    description,
    previewLoading,
    edited,
    onSubjectChange,
    onDescriptionChange,
    resetTemplate,
    applyCartonIdentity,
    readSubject: () => subjectRef.current,
    readDescription: () => descriptionRef.current,
  };
}
