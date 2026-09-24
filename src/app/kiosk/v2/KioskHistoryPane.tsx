'use client';

/**
 * History — the staff book on the counter tablet.
 *
 * Callers: `KioskShell` (the `history` staff tile on `KioskCommandMenu`).
 * Affected API: GET `/api/kiosk/visit`, GET/PATCH `/api/kiosk/visit/[id]`,
 *   GET `/api/kiosk/repair/[id]`, POST `/api/kiosk/visit/[id]/label-printed`,
 *   GET `/api/kiosk/visit/[id]/receipt`, GET
 *   `/api/kiosk/staff-for-stepup?scope=signin`.
 * Data schemas: none of its own.
 * User: "a history of every transaction on the tablet, with the receipt, who
 *   repaired it, the parts, the signatures — and reprint" — and 2026-09-23:
 *   *"if I were to create a repair service it will then show up in the history
 *   tab so I would be able to view it."*
 *
 * ## A row is a KEY, not a number
 *
 * The rail unions counter visits with standalone repairs, so a selection is
 * `visit:19` / `repair:4799`. {@link fetchKioskHistoryDetail} routes on that
 * key; the receipt, edit and label-stamp actions read `openVisitId`, which is
 * null on a repair row — those routes are transaction-scoped and have nothing
 * to aim at.
 *
 * ## The door is a SIGN-IN, not a PIN
 *
 * Nothing renders until someone says who they are, through
 * `KioskStaffSignInSheet` — `StaffPickerList`, the same roster the desk's
 * `SwitchStaffSheet` mounts, and pinless for the same reason it is
 * (operator 2026-09-22: *"Staff PIN — History no need, just staff sign in text
 * at the top. Remove the pin, use the same pinless sign in for the switching
 * staff — this is dogfood."*).
 *
 * What that buys is ATTRIBUTION, not authorization: the picked `staffId` is
 * what the reprint and edit audit rows name. Nothing here can move money —
 * payment keeps its PIN pad (`KioskPaymentStepUpSheet`), which is the one act
 * where a claim is not good enough.
 *
 * The door still matters on its own terms: Phase 4 refuses History on the
 * attract/customer face, and the staff tile is filtered out of the command
 * menu there (`showStaffTools={false}`).
 *
 * Idle signs out after {@link IDLE_SIGN_OUT_MS} — an unattended counter must
 * not keep the last staffer's name on the next person's reprint.
 *
 * ## The face owns its own trail controls
 *
 * The shell passes its header band down as {@link KioskHistoryPane}'s
 * `chrome` slot instead of painting a `History` title into it (operator
 * 2026-09-22: *"remove the top left history text its already in the drop
 * down"*). The query hook stays HERE, where the rail reads it, and the search
 * glyph + kind filter render into that one band through `KioskHistoryTrail` —
 * a lift of the controls, not of the state, and never a second band.
 *
 * ## Closing is free
 *
 * History owns no cart and sets no `active_command`, so leaving it returns the
 * operator to whatever command was already running, mid-visit, untouched.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { KioskStaffSignInSheet } from '@/components/kiosk/KioskStaffSignInSheet';
import { toast } from '@/lib/toast';
import { KIOSK_CENTRE_SURFACE } from '@/app/kiosk/kiosk-chrome';
import { useKioskVisitHistory } from '@/lib/kiosk/history/useKioskVisitHistory';
import {
  fetchKioskHistoryDetail,
  openKioskRepairPaperwork,
  openKioskVisitReceipt,
  parseKioskHistoryKey,
  patchKioskVisit,
  stampKioskLabelPrinted,
  type KioskStaffActor,
  type KioskVisitDetail,
  type KioskVisitEditInput,
} from '@/lib/kiosk/history/kiosk-history-client';
import { KioskHistoryDetail } from './KioskHistoryDetail';
import { KioskHistoryRail } from './KioskHistoryRail';
import { KioskHistoryTrail } from './KioskHistoryTrail';

/** Idle window before the face signs the staffer out. */
const IDLE_SIGN_OUT_MS = 5 * 60 * 1000;

export function KioskHistoryPane({
  onClose,
  chrome,
}: {
  onClose: () => void;
  /**
   * The shell's ONE header band, handed down so this face can seat its search
   * glyph and kind filter beside the command dropdown. `null` before sign-in:
   * there is nothing to find yet, and the band still carries the way out.
   */
  chrome: (center: ReactNode) => ReactNode;
}) {
  const [actor, setActor] = useState<KioskStaffActor | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<KioskVisitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const history = useKioskVisitHistory();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOut = useCallback(() => {
    setActor(null);
    setDetail(null);
    setSelectedKey(null);
  }, []);

  /** Any deliberate act re-arms the idle clock; inactivity is what signs out. */
  const touch = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(signOut, IDLE_SIGN_OUT_MS);
  }, [signOut]);

  useEffect(() => {
    if (!actor) return;
    touch();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [actor, touch]);

  /**
   * THE RIGHT PANE IS NEVER BLANK (operator 2026-09-23: *"it must never display
   * empty states like this — it should always display a selection of the most
   * recent one"*).
   *
   * A master/detail face that opens on "select a record" spends the operator's
   * first tap on a question the list already answers: the newest record is what
   * they want in nine cases out of ten, and it is row one. Square's iPad
   * transaction list and Polaris' index/detail pages both open on the first
   * row for exactly this reason.
   *
   * It re-points, not just seeds: after a search the previously open record is
   * usually not in the result set any more, and leaving it open beside a rail
   * that no longer lists it is the same blank-stare problem wearing a record.
   * So the rule is "the selection is always a row the rail is showing", which
   * is also why this watches `history.rows` and not just the first load.
   *
   * `history.loading` gates it: during the refetch the rail holds the PREVIOUS
   * page, and re-pointing at its row one would open a record the operator is
   * about to stop seeing.
   */
  useEffect(() => {
    if (!actor || history.loading) return;
    const first = history.rows[0];
    if (!first) {
      if (selectedKey !== null) setSelectedKey(null);
      return;
    }
    if (selectedKey != null && history.rows.some((row) => row.key === selectedKey)) return;
    setSelectedKey(first.key);
  }, [actor, history.loading, history.rows, selectedKey]);

  /**
   * The counter transaction behind the open row, when there is one. A
   * standalone repair has none — receipt, edit and label stamp all hang off the
   * VISIT routes, so they are unavailable rather than aimed at an id that
   * belongs to the other book.
   */
  const openVisitId = (() => {
    const handle = parseKioskHistoryKey(selectedKey);
    return handle?.source === 'visit' ? handle.id : null;
  })();

  // Detail for the selected row. Aborted on re-select so a slow record cannot
  // land on top of a faster one the operator picked after it.
  useEffect(() => {
    if (selectedKey == null || !actor) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    void (async () => {
      try {
        const next = await fetchKioskHistoryDetail(selectedKey, controller.signal);
        if (controller.signal.aborted) return;
        setDetail(next);
      } catch (err) {
        if (controller.signal.aborted) return;
        setDetailError(err instanceof Error ? err.message : 'Could not load that record.');
        setDetail(null);
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    })();
    return () => controller.abort();
  }, [selectedKey, actor]);

  const onPrintReceipt = useCallback(
    (staffCopy: boolean) => {
      if (openVisitId == null) return;
      touch();
      openKioskVisitReceipt(openVisitId, { staffCopy });
    },
    [openVisitId, touch],
  );

  const onPrintPaperwork = useCallback(
    (repairId: number) => {
      touch();
      openKioskRepairPaperwork(repairId);
    },
    [touch],
  );

  const onPrintLabel = useCallback(
    async (repairId: number) => {
      if (selectedKey == null || !actor) return;
      touch();
      setBusy(true);
      try {
        // The paper is already going: `printRepairLabel` fired in the detail
        // pane. This records it, so a failure here is reported as an unrecorded
        // reprint — never as a failed print, which would send the operator to
        // press the button again.
        //
        // `openVisitId` is null on a standalone ticket, which selects the
        // repair-keyed stamp: the visit route's ownership check can never pass
        // for a repair with no transaction under it.
        const result = await stampKioskLabelPrinted({ visitId: openVisitId, repairId, actor });
        setDetail(await fetchKioskHistoryDetail(selectedKey));
        toast(result.alreadyPrinted ? 'Label reprinted.' : 'Label printed.');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'The reprint was not recorded.');
      } finally {
        setBusy(false);
      }
    },
    [actor, openVisitId, selectedKey, touch],
  );

  const onSave = useCallback(
    async (edit: KioskVisitEditInput) => {
      if (openVisitId == null || !actor) return;
      touch();
      setBusy(true);
      try {
        const saved = await patchKioskVisit({ visitId: openVisitId, actor, edit });
        setDetail({ visit: saved.visit, repair: null, provenance: saved.provenance });
        // The rail paints the customer name and the ticket, so an identity edit
        // that is not re-queried leaves the list disagreeing with the record
        // open beside it.
        history.refresh();
        toast(saved.changed.length > 0 ? 'Visit updated.' : 'Nothing changed.');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not save that change.');
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [actor, history, openVisitId, touch],
  );

  if (!actor) {
    return (
      <div className={KIOSK_CENTRE_SURFACE} data-testid="kiosk-history-locked">
        {chrome(null)}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-semibold tracking-tight text-text-default">
            Staff sign in
          </p>
          <p className="text-sm text-text-soft">
            History shows past customers — say who is working this counter.
          </p>
        </div>
        <KioskStaffSignInSheet
          open
          onClose={onClose}
          onPick={(staff) => setActor({ staffId: staff.id, name: staff.name })}
          blurb="Past visits and their paperwork. Nothing is charged from this face."
        />
      </div>
    );
  }

  return (
    <div
      className={KIOSK_CENTRE_SURFACE}
      data-testid="kiosk-history-pane"
      onPointerDownCapture={touch}
    >
      {chrome(
        <KioskHistoryTrail
          search={history.search}
          onSearchChange={history.setSearch}
          kind={history.kind}
          onKindChange={history.setKind}
        />,
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <KioskHistoryRail
          rows={history.rows}
          loading={history.loading}
          loadingMore={history.loadingMore}
          hasMore={history.hasMore}
          error={history.error}
          search={history.search}
          relaxed={history.relaxed}
          relaxedTerm={history.relaxedTerm}
          onLoadMore={history.loadMore}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
        />
        <KioskHistoryDetail
          detail={detail}
          loading={detailLoading}
          error={detailError}
          busy={busy}
          onPrintReceipt={onPrintReceipt}
          onPrintPaperwork={onPrintPaperwork}
          onPrintLabel={(repairId) => void onPrintLabel(repairId)}
          onSave={onSave}
        />
      </div>
    </div>
  );
}
