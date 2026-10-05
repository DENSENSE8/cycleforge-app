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
import { CheckCircle, Copy, Flag, Phone, RefreshCw, Search, Trash2, X } from '@/components/Icons';
import { DESK_RECORD_KEY_ATTR } from '@/design-system/components/DeskRecordPlane';
import {
  TriageCardList,
  type TriageFeed,
  type TriageSelectionPort,
} from '@/design-system/components/triage-card-list/TriageCardList';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { useTriageDensity } from '@/design-system/components/triage-card-list/triage-density';
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
import { filterEntriesByRecon, type ReconEntry, type ReconReason, type ReconStatus } from '@/lib/receiving/reconcile';
import {
  INBOUND_FOLLOWUP_LABELS,
  inboundFollowupKey,
  type InboundFollowupTag,
} from '@/lib/receiving/inbound-followups';
import { useInboundFollowups, useSetInboundFollowup } from '@/lib/receiving/inbound-followups-query';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { clearDataTableVisibleIds, publishDataTableVisibleIds } from '@/lib/tables/data-table-visible-rows';
import { INCOMING_PIPELINE_VIEW } from '@/lib/triage/views';
import { toast } from '@/lib/toast';
import { copyToClipboard } from '@/utils/_dom';
import {
  PastedNumberActionsContext,
  PastedNumberCard,
  pastedNumberCardModel,
  pastedNumberGroupKey,
  pastedNumberStatusFace,
  type PastedNumberActions,
  type PastedNumberCardModel,
  type PastedNumberRow,
} from './cards/PastedNumberCard';
import { PastedNumberLine } from './cards/PastedNumberLine';
import { FOLLOWUP_KEYS } from './cards/pasted-number-faces';
import { useInboundDeliveryRecord } from '@/components/receiving/record/useInboundRecord';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { inboundPastedNumberModel } from '@/components/receiving/record/inbound-record-model';
import { incomingDeliverySummary } from './incoming-delivery-state';
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
/** The follow-up's key: the order when the Check named one, so a PO and its tracking share one tag. */
const followupKeyOf = (entry: ReconEntry): string => inboundFollowupKey({ poNumber: entry.poNumber, ref: entry.ref });
const FOLLOWUP_ICON = { need_claim: Flag, double_check: Search, chasing_seller: Phone, acknowledged: CheckCircle } as const;

interface PastedNumbersLedgerProps {
  check: InboundCheck;
  /** `?recon=` / `?recon_reason=` (the sidebar's `pastedListBuckets`) — null when they cannot filter honestly (the cap). */
  status: ReconStatus | null;
  reason: ReconReason | null;
  /** Every loaded line of the pasted list (`view=reconcile`), before any filter. */
  rows: readonly ReceivingLineRow[];
  rowsLoading: boolean;
  emptyMessage: string;
  findValue: string;
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
  // Compact (one row) or Full (cards) — the operator's choice, Compact until picked.
  const [density, setDensity] = useTriageDensity('incoming.pasted', 'row');
  const followupKeys = useMemo(() => check.entries.map(followupKeyOf), [check.entries]);
  const followups = useInboundFollowups(followupKeys);
  const setFollowup = useSetInboundFollowup();
  const bands = useMemo((): [string, RowGroup<PastedNumberRow>[]][] => {
    if (loading) return [];
    const shown = status ? filterEntriesByRecon(check.entries, status, reason) : check.entries;
    const numbers = pastedNumbers(shown, rows, {
      query: findValue,
      matches: (row) => receivingLineMatchesQuery(row, findValue),
    });
    const groups = numbers.map((number): RowGroup<PastedNumberRow> => {
      const followup = followups.get(followupKeyOf(number.entry)) ?? null;
      return {
        key: `num:${number.entry.key}`,
        rows:
          number.lines.length > 0
            ? number.lines.map((line) => ({ id: line.id, number, line, followup }))
            : [{ id: pastedNumberPlaceholderId(number.entry.key), number, line: null, followup }],
      };
    });
    return [['', groups]];
  }, [check.entries, findValue, followups, loading, reason, rows, status]);

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
        publishDataTableVisibleIds(RECEIVING_SELECTION_SCOPE, ids);
        return () => clearDataTableVisibleIds(RECEIVING_SELECTION_SCOPE);
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

  // A tag lands on every number's order at once (a PO and its tracking share one key).
  const tag = useCallback(
    (tagged: readonly PastedNumberCardModel[], next: InboundFollowupTag | null) =>
      setFollowup([...new Set(tagged.map((card) => followupKeyOf(card.number.entry)))], next),
    [setFollowup],
  );
  const followupVerbs = useCallback(
    (targets: readonly PastedNumberCardModel[], idPrefix: string): RecordActionVerb[] => [
      ...(['need_claim', 'double_check', 'chasing_seller', 'acknowledged'] as const).map((id, index) => {
        const Icon = FOLLOWUP_ICON[id];
        return {
          id: `${idPrefix}-${id}`,
          label: `${INBOUND_FOLLOWUP_LABELS[id]} (${index + 1})`,
          icon: <Icon aria-hidden />,
          run: () => tag(targets, id),
        };
      }),
      ...(targets.some((card) => card.followup)
        ? [{ id: `${idPrefix}-clear`, label: 'Clear follow-up (0)', icon: <X aria-hidden />, run: () => tag(targets, null) }]
        : []),
    ],
    [tag],
  );
  const numberVerbs = useCallback(
    (card: PastedNumberCardModel): RecordActionVerb[] => [
      ...followupVerbs([card], 'number'),
      { id: 'number-copy', label: 'Copy number', icon: <Copy aria-hidden />, run: () => void copyText(card.number.entry.ref, card.number.entry.ref) },
      { id: 'number-recheck', label: 'Recheck', icon: <RefreshCw aria-hidden />, run: () => recheck(card) },
      { id: 'number-remove', label: 'Remove from list', icon: <Trash2 aria-hidden />, run: () => remove([card]) },
    ],
    [copyText, followupVerbs, recheck, remove],
  );
  const actions = useMemo<PastedNumberActions>(
    () => ({
      // A note with no tag yet acknowledges the number: someone has looked at it.
      saveNote: (card, text) =>
        setFollowup([followupKeyOf(card.number.entry)], card.followup?.tag ?? 'acknowledged', text.trim() || null),
    }),
    [setFollowup],
  );

  // ── Keys on the checked numbers, else the focused (else hovered, else open) one ──
  const latest = useRef({ cardById, openCard, checkedCards, copyText, copyShown, recheck, remove, tag });
  latest.current = { cardById, openCard, checkedCards, copyText, copyShown, recheck, remove, tag };
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
      const { copyText: copy, copyShown: copyAll, recheck: ask, remove: drop, tag: mark, checkedCards: checked } = latest.current;
      // Copy is ⌘/Ctrl+C (⌘⌥C / Ctrl+Alt+C every shown number) — C is create app-wide (`key-registry`).
      if (hotkeyFires(COPY_SHOWN_HOTKEY, event)) {
        event.preventDefault();
        copyAll();
        return;
      }
      const copying = hotkeyFires(COPY_HOTKEY, event);
      if (!copying && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) return;
      // 1–4 tag, 0 clears — the checked numbers when any, else the one under the cursor.
      if (!copying && key in FOLLOWUP_KEYS) {
        const card = checked.length > 0 ? null : cardUnderCursor(event.target);
        const targets = checked.length > 0 ? checked : card ? [card] : [];
        if (targets.length === 0) return;
        event.preventDefault();
        mark(targets, FOLLOWUP_KEYS[key] ?? null);
        return;
      }
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
      ? [...delivery.verbs, ...lead]
      : lead,
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
        renderCard: (props) => (density === 'row' ? <PastedNumberLine {...props} /> : <PastedNumberCard {...props} />),
      }),
      noun: { one: 'number', many: 'numbers' },
      listLabel: 'Pasted numbers',
    }),
    [density],
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
            ...followupVerbs(checkedCards, 'numbers'),
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
    [checkedCards, copyText, followupVerbs, remove],
  );

  return (
    <div ref={rootRef} data-testid="incoming-deliveries-ledger" data-face="numbers" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PastedNumberActionsContext.Provider value={actions}>
        <div className="flex min-h-0 min-w-0 flex-1">
          <TriageCardList
            densityControl={{ value: density, onChange: setDensity }}
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
            // No chips: the buckets and their reasons are the sidebar's (`pastedListBuckets`).
            summary={null}
            bulk={<ReceivingSelectionVerbs noun="numbers" lead={bulkLead} />}
            banner={
              <PastedNumbersBanner
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
      </PastedNumberActionsContext.Provider>
    </div>
  );
}
