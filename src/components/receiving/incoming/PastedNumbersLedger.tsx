'use client';

/**
 * The Inbound ledger while a list is pasted (`?ref_in=`): one card per pasted
 * NUMBER, in paste order, after the status (`?recon=`) and reason
 * (`?recon_reason=`) filters — HANDOFF-bulk-identify Features 1–3. A number
 * lines carry opens its purchase's record; a number nothing carries opens the
 * Check's facts. J / K walk the numbers; the triage keys act on the focused
 * (else hovered, else open) number:
 *
 *   ↵ open · ⌘/Ctrl+C copy · ⌘⌥C / Ctrl+Alt+C copy every shown number · R recheck · ⌫ remove from list
 *
 * X stays the face's check key (TriageCardList), so remove is ⌫ / Delete —
 * the popout's own remove key.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Copy, RefreshCw, Trash2 } from '@/components/Icons';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import {
  TriageCardList,
  type TriageFeed,
  type TriageSelectionPort,
} from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { RecordLedgerSummaryPane } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { ReceivingSelectionVerbs } from '@/components/receiving/ReceivingSelectionVerbs';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import type { RowGroup } from '@/lib/group-rows';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { COPY_HOTKEY, COPY_SHOWN_HOTKEY, hotkeyFires } from '@/lib/keyboard/key-registry';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import type { InboundCheck } from '@/lib/receiving/inbound-check-query';
import { pastedNumberPlaceholderId, pastedNumbers, removePastedNumbers } from '@/lib/receiving/pasted-numbers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { receivingLineMatchesQuery } from '@/lib/receiving/receiving-line-search';
import { filterEntriesByRecon, type ReconReason, type ReconStatus } from '@/lib/receiving/reconcile';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { clearSlotTableVisibleIds, publishSlotTableVisibleIds } from '@/lib/tables/slot-table-visible';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';
import {
  PastedNumberCard,
  pastedNumberCardModel,
  pastedNumberGroupKey,
  pastedNumberStatusFace,
  type PastedNumberCardModel,
  type PastedNumberRow,
} from './cards/PastedNumberCard';
import { useInboundDeliveryRecord } from '@/components/receiving/record/useInboundRecord';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { inboundPastedNumberModel } from '@/components/receiving/record/inbound-record-model';
import { incomingDeliverySummary } from './incoming-delivery-state';
import { IncomingStatusChips, type IncomingStatusChipSet } from './IncomingStatusChips';
import { PastedNumbersBanner } from './PastedNumbersBanner';

const VIEW = INCOMING_PIPELINE_VIEW;
const NO_FACE_CHIPS: readonly never[] = [];
const noFaceChipsOf = (): readonly never[] => NO_FACE_CHIPS;
const rowId = (row: PastedNumberRow): number => row.id;
const numberKeyOf = (row: PastedNumberRow): string => row.number.entry.key;
const purchaseKey = (row: ReceivingLineRow): string =>
  (row.zoho_purchaseorder_id || row.zoho_purchaseorder_number || row.source_order_id || '').trim();
/** A Find naming exactly one pasted number opens it. */
const numberExactFind = (query: string, card: PastedNumberCardModel) => card.number.entry.ref.toLowerCase() === query;

interface PastedNumbersLedgerProps {
  check: InboundCheck;
  /** `?recon=` / `?recon_reason=` — null when the chips cannot filter honestly (the cap). */
  status: ReconStatus | null;
  reason: ReconReason | null;
  /** Every loaded line of the pasted list (`view=reconcile`), before any filter. */
  rows: readonly ReceivingLineRow[];
  rowsLoading: boolean;
  emptyMessage: string;
  findValue: string;
  statusChips: IncomingStatusChipSet | null;
  /** One line above the list (the pasted list hit the row cap). */
  notice: string | null;
  /** `?openLine=` — a line id, or a number's placeholder id (negative). */
  selectedId: number | null;
  selectedIds: Set<number>;
  onOpenId: (id: number | null) => void;
  onToggleRow: (row: ReceivingLineRow) => void;
}

export function PastedNumbersLedger({
  check,
  status,
  reason,
  rows,
  rowsLoading,
  emptyMessage,
  findValue,
  statusChips,
  notice,
  selectedId,
  selectedIds,
  onOpenId,
  onToggleRow,
}: PastedNumbersLedgerProps) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const rootRef = useRef<HTMLDivElement>(null);

  // ── Numbers → groups (one card each) ──────────────────────────────────────
  const loading = check.loading || rowsLoading;
  const bands = useMemo((): [string, RowGroup<PastedNumberRow>[]][] => {
    if (loading) return [];
    const shown = status ? filterEntriesByRecon(check.entries, status, reason) : check.entries;
    const numbers = pastedNumbers(shown, rows, {
      query: findValue,
      matches: (row) => receivingLineMatchesQuery(row, findValue),
    });
    const groups = numbers.map((number): RowGroup<PastedNumberRow> => ({
      key: `num:${number.entry.key}`,
      rows:
        number.lines.length > 0
          ? number.lines.map((line) => ({ id: line.id, number, line }))
          : [{ id: pastedNumberPlaceholderId(number.entry.key), number, line: null }],
    }));
    return [['', groups]];
  }, [check.entries, findValue, loading, reason, rows, status]);

  const cut = useTriageCut({ statusKeys: NO_FACE_CHIPS, recordParams: VIEW.recordParams });
  const { filterBands } = cut;
  const cardBands = useMemo(() => filterBands(bands, pastedNumberGroupKey, noFaceChipsOf), [filterBands, bands]);
  const cards = useMemo(
    () => cardBands.flatMap(([, groups]) => groups.map(pastedNumberCardModel)),
    [cardBands],
  );
  const cardById = useMemo(() => {
    const map = new Map<number, PastedNumberCardModel>();
    for (const card of cards) for (const id of card.ids) map.set(id, card);
    return map;
  }, [cards]);
  const rowById = useMemo(() => {
    const map = new Map<number, PastedNumberRow>();
    for (const [, groups] of cardBands) for (const group of groups) for (const row of group.rows) map.set(row.id, row);
    return map;
  }, [cardBands]);

  // ── The open number (follows `?openLine=`) ────────────────────────────────
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedId == null) setOpenId(null);
    else if (rowById.has(selectedId)) setOpenId(selectedId);
  }, [rowById, selectedId]);
  const openRow = openId == null ? null : (rowById.get(openId) ?? null);
  useEffect(() => {
    // Left the shown list (removed, filtered out) — unless the URL already names the next one.
    if (openId != null && !openRow && (selectedId == null || !rowById.has(selectedId))) {
      setOpenId(null);
      onOpenId(null);
    }
  }, [onOpenId, openId, openRow, rowById, selectedId]);
  const open = useCallback(
    (row: PastedNumberRow) => {
      setOpenId(row.id);
      onOpenId(row.id);
    },
    [onOpenId],
  );
  const close = useCallback(() => {
    setOpenId(null);
    onOpenId(null);
  }, [onOpenId]);
  const openCard = openId == null ? null : (cardById.get(openId) ?? null);

  // J / K walk NUMBERS: one step per card (its lead), whichever of its lines is open.
  const cursorOrder = useMemo(
    () => [['', cards.map((card) => ({ key: card.key, rows: [card.lead] }))]] as [string, RowGroup<PastedNumberRow>[]][],
    [cards],
  );
  usePublishRecordCursor({
    surfaceId: 'incoming-pasted-numbers',
    scope: 'record',
    enabled: true,
    order: cursorOrder,
    openId: openRow?.id ?? null,
    getId: rowId,
    getGroupKey: numberKeyOf,
    openGroupKey: openRow ? numberKeyOf(openRow) : null,
    onOpen: open,
    onClose: close,
  });

  // ── Selection: lines in the host's store, placeholders held here ──────────
  const [checkedPlaceholders, setCheckedPlaceholders] = useState<ReadonlySet<number>>(() => new Set());
  const checkedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const id of selectedIds) if (rowById.has(id)) ids.add(id);
    for (const id of checkedPlaceholders) if (rowById.has(id)) ids.add(id);
    return ids;
  }, [checkedPlaceholders, rowById, selectedIds]);
  const togglePlaceholder = useCallback((id: number, on?: boolean) => {
    setCheckedPlaceholders((prev) => {
      const next = new Set(prev);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const selection = useMemo(
    (): TriageSelectionPort<PastedNumberRow> => ({
      ids: checkedIds,
      toggle: (row) => (row.line ? onToggleRow(row.line) : togglePlaceholder(row.id)),
      toggleGroup: (ids, on) => {
        for (const id of ids) {
          const row = rowById.get(id);
          if (!row || checkedIds.has(id) === on) continue;
          if (row.line) onToggleRow(row.line);
          else togglePlaceholder(id, on);
        }
      },
      setAll: (on) => {
        emitToggleAll(RECEIVING_SELECTION_SCOPE, on ? 'all' : 'none');
        setCheckedPlaceholders(on ? new Set(cards.filter((card) => !card.receipt).map((card) => card.lead.id)) : new Set());
      },
      publishVisible: (ids) => {
        publishSlotTableVisibleIds(RECEIVING_SELECTION_SCOPE, ids);
        return () => clearSlotTableVisibleIds(RECEIVING_SELECTION_SCOPE);
      },
    }),
    [cards, checkedIds, onToggleRow, rowById, togglePlaceholder],
  );
  const checkedCards = useMemo(() => cards.filter((card) => card.ids.some((id) => checkedIds.has(id))), [cards, checkedIds]);

  // ── Verbs ─────────────────────────────────────────────────────────────────
  const copyText = useCallback(async (text: string, what: string) => {
    if (await copyToClipboard(text)) toast.success(`Copied ${what}`);
    else toast.error('Could not copy');
  }, []);
  const copyShown = useCallback(() => {
    if (cards.length === 0) return;
    void copyText(cards.map((card) => card.number.entry.ref).join('\n'), cards.length === 1 ? '1 number' : `${cards.length} numbers`);
  }, [cards, copyText]);
  const recheck = useCallback(
    (card: PastedNumberCardModel) => {
      const { ref } = card.number.entry;
      toast.message(`Checking ${ref} again`);
      check.recheck(ref).then(
        () => toast.success(`Rechecked ${ref}`),
        (error: unknown) => toast.error(error instanceof Error ? error.message : `Could not recheck ${ref}`),
      );
    },
    [check],
  );
  const remove = useCallback(
    (removed: readonly PastedNumberCardModel[]) => {
      if (removed.length === 0) return;
      const before = window.location.search;
      const keys = new Set(removed.map((card) => card.number.entry.key));
      const params = new URLSearchParams(before);
      removePastedNumbers(params, keys);
      // Triage walks on: the open number leaving opens the next one shown.
      if (openCard && keys.has(openCard.number.entry.key)) {
        const at = cards.indexOf(openCard);
        const next = [...cards.slice(at + 1), ...cards.slice(0, at).reverse()].find((card) => !keys.has(card.number.entry.key));
        if (next) params.set('openLine', String(next.lead.id));
        else params.delete('openLine');
      }
      for (const card of removed) {
        for (const id of card.ids) {
          const row = rowById.get(id);
          if (row?.line && selectedIds.has(id)) onToggleRow(row.line);
        }
      }
      setCheckedPlaceholders((prev) => new Set([...prev].filter((id) => !removed.some((card) => card.ids.includes(id)))));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      const what = removed.length === 1 ? removed[0]!.number.entry.ref : `${removed.length} numbers`;
      toast.undo(`Removed ${what} from the list`, {
        onUndo: () => router.replace(`${pathname}${before}`, { scroll: false }),
      });
    },
    [cards, onToggleRow, openCard, pathname, rowById, router, selectedIds],
  );

  const numberVerbs = useCallback(
    (card: PastedNumberCardModel): RecordActionVerb[] => [
      { id: 'number-copy', label: 'Copy number', icon: <Copy aria-hidden />, run: () => void copyText(card.number.entry.ref, card.number.entry.ref) },
      { id: 'number-recheck', label: 'Recheck', icon: <RefreshCw aria-hidden />, run: () => recheck(card) },
      { id: 'number-remove', label: 'Remove from list', icon: <Trash2 aria-hidden />, run: () => remove([card]) },
    ],
    [copyText, recheck, remove],
  );

  // ── Keys on the focused (else hovered, else open) number ──────────────────
  const latest = useRef({ cardById, openCard, copyText, copyShown, recheck, remove });
  latest.current = { cardById, openCard, copyText, copyShown, recheck, remove };
  useEffect(() => {
    const cardUnderCursor = (target: EventTarget | null): PastedNumberCardModel | null => {
      const root = rootRef.current;
      const focused = target instanceof Element && root?.contains(target) ? target.closest(`[${DESK_RECORD_KEY_ATTR}]`) : null;
      const hovered = root?.querySelectorAll(`[${DESK_RECORD_KEY_ATTR}]:hover`);
      const element = focused ?? (hovered && hovered.length > 0 ? hovered[hovered.length - 1]! : null);
      const key = element ? Number(element.getAttribute(DESK_RECORD_KEY_ATTR)) : NaN;
      return (Number.isFinite(key) ? latest.current.cardById.get(key) : undefined) ?? latest.current.openCard;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      if (hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const key = event.key;
      const { copyText: copy, copyShown: copyAll, recheck: ask, remove: drop } = latest.current;
      // Copy is ⌘/Ctrl+C (⌘⌥C / Ctrl+Alt+C every shown number) — C is create app-wide (`key-registry`).
      if (hotkeyFires(COPY_SHOWN_HOTKEY, event)) {
        event.preventDefault();
        copyAll();
        return;
      }
      const copying = hotkeyFires(COPY_HOTKEY, event);
      if (!copying && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) return;
      const lower = key.toLowerCase();
      if (!copying && lower !== 'r' && key !== 'Backspace' && key !== 'Delete') return;
      const card = cardUnderCursor(event.target);
      if (!card) return;
      event.preventDefault();
      if (copying) void copy(card.number.entry.ref, card.number.entry.ref);
      else if (lower === 'r') ask(card);
      else drop([card]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── The record plane ──────────────────────────────────────────────────────
  const openLine = openRow?.line ?? null;
  const openLines = useMemo(() => {
    if (!openLine) return [];
    const key = purchaseKey(openLine);
    return key ? rows.filter((row) => purchaseKey(row) === key) : [openLine];
  }, [openLine, rows]);
  const openNumber = openRow?.number ?? null;
  const openFace = openNumber ? pastedNumberStatusFace(openNumber.entry) : null;
  const recordSubtitle = openNumber && openFace ? (openLine ? `${openNumber.entry.ref} · ${openFace.face}` : openFace.face) : undefined;
  // A number with lines opens its purchase's record; one nothing on file
  // carries opens the Check's answer — the same inbound record either way.
  const delivery = useInboundDeliveryRecord({ row: openLine, lines: openLines, onRemoved: close });
  const numberModel =
    openRow && !openLine ? inboundPastedNumberModel(openRow.number, check.rowsByKey.get(openRow.number.entry.key) ?? null) : null;
  const lead = openCard ? numberVerbs(openCard) : [];
  const slot = useRecordSlot(
    delivery?.model ?? numberModel,
    delivery
      ? [...delivery.verbs, ...lead.map((verb) => ({ ...verb, placement: 'overflow' as const }))]
      : lead.map((verb) => (verb.id === 'number-remove' ? { ...verb, placement: 'overflow' as const } : verb)),
    `${openCard?.number.entry.ref ?? 'Number'} actions`,
    'inbound-record',
  );
  const summary = useMemo(() => incomingDeliverySummary(rows, 'pipeline'), [rows]);

  // ── The face ──────────────────────────────────────────────────────────────
  const family = useMemo(
    () => ({
      ...triageFamily(VIEW, {
        rowId,
        groupKey: pastedNumberGroupKey,
        cardModel: pastedNumberCardModel,
        exactFind: numberExactFind,
        renderCard: (props) => <PastedNumberCard {...props} />,
      }),
      noun: { one: 'number', many: 'numbers' },
      listLabel: 'Pasted numbers',
    }),
    [],
  );
  const painted = useMemo(() => cardBands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [cardBands]);
  const feed: TriageFeed<PastedNumberRow> = {
    bands: cardBands,
    allBands: bands,
    painted,
    sectioned: false,
    total: cards.length,
    loading,
    fetching: loading,
    serverPages: { page: 1, pageCount: 1, pageSize: Math.max(1, cards.length), onPage: () => {} },
    search: { value: findValue, pending: false },
    selection,
    open: { id: openRow?.id ?? null, open, close },
  };

  const bulkLead = useMemo<RecordActionVerb[]>(
    () =>
      checkedCards.length === 0
        ? []
        : [
            {
              id: 'numbers-copy',
              label: 'Copy numbers',
              icon: <Copy aria-hidden />,
              run: () =>
                void copyText(
                  checkedCards.map((card) => card.number.entry.ref).join('\n'),
                  checkedCards.length === 1 ? '1 number' : `${checkedCards.length} numbers`,
                ),
            },
            { id: 'numbers-remove', label: 'Remove from list', icon: <Trash2 aria-hidden />, run: () => remove(checkedCards) },
          ],
    [checkedCards, copyText, remove],
  );

  return (
    <div ref={rootRef} data-testid="incoming-deliveries-ledger" data-face="numbers" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1">
        <TriageCardList
          family={family}
          feed={feed}
          cut={cut}
          record={{
            title: slot?.title ?? 'Number',
            subtitle: recordSubtitle,
            actions: slot?.actions,
            noun: 'number',
            showIndex: false,
            testId: 'incoming-deliveries-ledger-record',
            summary: <RecordLedgerSummaryPane summary={summary} />,
            view: slot?.view ?? null,
            strip: null,
          }}
          summary={statusChips ? <IncomingStatusChips set={statusChips} /> : null}
          bulk={<ReceivingSelectionVerbs noun="numbers" lead={bulkLead} />}
          banner={
            <PastedNumbersBanner
              reasons={statusChips?.reasons ?? null}
              checking={check.checking}
              pasted={check.entries.length}
              answered={check.answered}
              notice={notice}
            />
          }
          searchEmpty={null}
          allClear={<TriageAllClear title={emptyMessage} detail="No pasted number is in this status." />}
        />
      </div>
    </div>
  );
}
