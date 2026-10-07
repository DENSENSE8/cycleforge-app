'use client';

/**
 * Products › Import products CSV — the staged file, as the catalog will take
 * it. Stands in for the catalog list while `?import=csv` holds a draft. The
 * server plans (`POST /api/sku-catalog/import`): `[OLD]` rows dropped, each
 * SKU with its leading zeros, every row New / Title differs / In catalog /
 * Duplicate / No SKU / No title. The page header carries the import's verbs
 * (they act on the whole file, never on checked rows): "Add N products" adds
 * the New rows only — a SKU already in the catalog keeps its own title;
 * "Download cleaned CSV" is the file as it should have been; "Cancel" drops
 * the staged file.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { Download, Plus, X } from '@/components/Icons';
import { useQuery } from '@tanstack/react-query';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { IncomingStatusChips, type IncomingStatusChipSet } from '@/components/receiving/incoming/IncomingStatusChips';
import type { RowGroup } from '@/lib/group-rows';
import {
  CATALOG_IMPORT_OUTCOME_LABELS,
  cleanedCatalogCsv,
  type CatalogImportOutcome,
  type CatalogImportPlanRow,
} from '@/lib/sku/catalog-import';
import { catalogImportRowsOf, postCatalogImport } from '@/lib/sku/catalog-import-descriptor';
import type { TableImportDraft } from '@/lib/tables/import/staging-store';
import { PRODUCTS_CATALOG_IMPORT_VIEW } from '@/lib/triage/views';
import { toast } from '@/lib/toast';

const VIEW = PRODUCTS_CATALOG_IMPORT_VIEW;
const NO_CHIPS: readonly never[] = [];
const rowId = (row: CatalogImportPlanRow): number => row.line;
const CHECKING_REASON = 'Checking the file against the catalog';

const OUTCOME_FACE: Readonly<Record<CatalogImportOutcome, RecordStateFace>> = {
  new: { id: 'new', code: 'NEW', label: CATALOG_IMPORT_OUTCOME_LABELS.new, tone: 'info', icon: 'package' },
  title_differs: { id: 'title_differs', code: 'DIF', label: CATALOG_IMPORT_OUTCOME_LABELS.title_differs, tone: 'warning', icon: 'package-search' },
  present: { id: 'present', code: 'CAT', label: CATALOG_IMPORT_OUTCOME_LABELS.present, tone: 'success', icon: 'check' },
  duplicate: { id: 'duplicate', code: 'DUP', label: CATALOG_IMPORT_OUTCOME_LABELS.duplicate, tone: 'danger', icon: 'package-x' },
  padding_twin: { id: 'padding_twin', code: 'TWN', label: CATALOG_IMPORT_OUTCOME_LABELS.padding_twin, tone: 'warning', icon: 'package-search' },
  no_sku: { id: 'no_sku', code: 'NSK', label: CATALOG_IMPORT_OUTCOME_LABELS.no_sku, tone: 'danger', icon: 'package-x' },
  no_title: { id: 'no_title', code: 'NTL', label: CATALOG_IMPORT_OUTCOME_LABELS.no_title, tone: 'danger', icon: 'package-x' },
  old: { id: 'old', code: 'OLD', label: CATALOG_IMPORT_OUTCOME_LABELS.old, tone: 'neutral', icon: 'circle-pause' },
};

/** Chip order: what will change first, then what needs a person, then what is left alone. */
const CHIP_ORDER: readonly CatalogImportOutcome[] = ['new', 'title_differs', 'padding_twin', 'duplicate', 'no_sku', 'no_title', 'present', 'old'];

type ImportRowModel = { key: string; ids: readonly number[]; lead: CatalogImportPlanRow };

function CatalogImportRowImpl(props: TriageCardSlotProps<CatalogImportPlanRow, ImportRowModel>) {
  const row = props.model.lead;
  const face = useMemo<TriageRowFace>(
    () => ({
      state: OUTCOME_FACE[row.outcome],
      identity: row.sku || row.rawSku || '—',
      identityCopy: row.sku || row.rawSku ? { value: (row.sku || row.rawSku)!, tone: 'sku' } : undefined,
      identityWidth: 'code',
      title: row.title || 'No title in the file',
      facts: [
        {
          id: 'was',
          label: row.padded ? 'Was' : undefined,
          value: row.padded ? row.rawSku : null,
          copy: row.padded && row.rawSku ? { value: row.rawSku, tone: 'sku' } : undefined,
          width: 'short',
          tone: 'muted',
        },
        row.outcome === 'padding_twin'
          ? {
              id: 'catalog',
              label: 'Catalog SKU',
              value: row.twinSku,
              copy: row.twinSku ? { value: row.twinSku, tone: 'sku' } : undefined,
              width: 'short',
              tone: 'warn',
            }
          : {
              id: 'catalog',
              label: row.outcome === 'title_differs' ? 'Catalog' : undefined,
              value: row.outcome === 'title_differs' ? row.catalogTitle : null,
              width: 'long',
              tone: 'warn',
              tip: row.catalogTitle ?? undefined,
            },
        {
          id: 'zoho',
          label: row.zohoItemId ? 'Zoho' : undefined,
          value: row.zohoItemId ? { kind: 'code', text: `…${row.zohoItemId.slice(-6)}`, title: `Zoho item ${row.zohoItemId}` } : null,
          copy: row.zohoItemId ? { value: row.zohoItemId, display: `…${row.zohoItemId.slice(-6)}`, tone: 'id' } : undefined,
          width: 'short',
        },
      ],
      next: row.outcome === 'new' ? { label: 'Add' } : null,
      aria: {
        row: `Row ${row.line}, ${OUTCOME_FACE[row.outcome].label}, ${row.sku || 'no SKU'}, ${row.title}`,
        open: `Row ${row.line}`,
        check: `Select row ${row.line}`,
      },
    }),
    [row],
  );
  return <TriageRow {...props} face={face} testIdPrefix={VIEW.testIdPrefix} />;
}

const CatalogImportRow = memo(CatalogImportRowImpl);

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function CatalogImportReview({
  draft,
  onClose,
  onApplied,
}: {
  draft: TableImportDraft;
  onClose: () => void;
  onApplied: () => void;
}) {
  const inputRows = useMemo(() => catalogImportRowsOf(draft), [draft]);
  const planQuery = useQuery({
    queryKey: ['catalog-import-plan', draft.fileName, draft.rows.length, draft.mapping],
    queryFn: () => postCatalogImport(inputRows, false),
    staleTime: Infinity,
    retry: false,
  });
  const plan = planQuery.data?.plan ?? null;
  const [outcome, setOutcome] = useState<CatalogImportOutcome | null>(null);
  const [applying, setApplying] = useState(false);

  const visibleRows = useMemo(
    () => (plan ? plan.rows.filter((row) => outcome == null || row.outcome === outcome) : []),
    [outcome, plan],
  );

  const chipSet = useMemo<IncomingStatusChipSet>(
    () => ({
      label: 'Filter by outcome',
      disabledReason: null,
      chords: false,
      testIdPrefix: 'catalog-import-outcome',
      onToggle: (id) => setOutcome((current) => (current === id ? null : (id as CatalogImportOutcome))),
      chips: CHIP_ORDER.filter((id) => !plan || plan.summary[id] > 0).map((id) => ({
        id,
        label: CATALOG_IMPORT_OUTCOME_LABELS[id],
        count: plan ? plan.summary[id] : null,
        tone: OUTCOME_FACE[id].tone,
        active: outcome === id,
      })),
    }),
    [outcome, plan],
  );

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      const { applied } = await postCatalogImport(inputRows, true);
      const added = applied?.inserted ?? 0;
      toast.success(added === 1 ? 'Added 1 product to the catalog' : `Added ${added} products to the catalog`);
      onApplied();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setApplying(false);
    }
  }, [inputRows, onApplied]);

  const newCount = plan?.summary.new ?? 0;
  const downloadCleaned = useCallback(() => {
    if (!plan) return;
    const name = draft.fileName.replace(/\.(csv|tsv|txt)$/i, '');
    download(`${name} (cleaned).csv`, cleanedCatalogCsv(draft.headers, draft.rows, draft.mapping, plan));
  }, [draft, plan]);
  // The import's verbs act on the whole staged file (the New rows, the cleaned
  // file, the draft itself), never on checked rows — page header actions, not the select bar.
  const importActions = useMemo(
    () => (
      <div className="flex shrink-0 items-center gap-2" data-testid="catalog-import-actions">
        <DeskHeaderAction type="button" variant="ghost" size="sm" icon={<X aria-hidden />} onClick={onClose} data-testid="catalog-import-cancel">
          Cancel
        </DeskHeaderAction>
        <DeskHeaderAction
          type="button"
          variant="secondary"
          size="sm"
          icon={<Download aria-hidden />}
          disabled={!plan}
          title={plan ? undefined : CHECKING_REASON}
          onClick={downloadCleaned}
          data-testid="catalog-import-cleaned"
        >
          Download cleaned CSV
        </DeskHeaderAction>
        <DeskHeaderAction
          type="button"
          variant="primary"
          size="sm"
          icon={<Plus aria-hidden />}
          loading={applying}
          disabled={!plan || newCount === 0}
          title={!plan ? CHECKING_REASON : newCount === 0 ? 'Nothing new to add' : undefined}
          onClick={() => void apply()}
          data-testid="catalog-import-apply"
        >
          {newCount === 1 ? 'Add 1 product' : `Add ${newCount} products`}
        </DeskHeaderAction>
      </div>
    ),
    [apply, applying, downloadCleaned, newCount, onClose, plan],
  );

  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const allBands = useMemo<[string, RowGroup<CatalogImportPlanRow>[]][]>(
    () => (visibleRows.length ? [['rows', visibleRows.map((row) => ({ key: String(row.line), rows: [row] }))]] : []),
    [visibleRows],
  );
  const selection = useLocalTriageSelection(rowId);
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId,
        groupKey: (group: RowGroup<CatalogImportPlanRow>) => group.key,
        cardModel: (group: RowGroup<CatalogImportPlanRow>): ImportRowModel => ({ key: group.key, ids: [group.rows[0]!.line], lead: group.rows[0]! }),
        exactFind: (query: string, model: ImportRowModel) => model.lead.sku.toLowerCase() === query || model.lead.rawSku.toLowerCase() === query,
        renderCard: (props: TriageCardSlotProps<CatalogImportPlanRow, ImportRowModel>) => <CatalogImportRow {...props} />,
      }),
    [],
  );
  const feed: TriageFeed<CatalogImportPlanRow> = {
    bands: allBands,
    allBands,
    painted: visibleRows,
    sectioned: false,
    total: visibleRows.length,
    loading: planQuery.isPending,
    fetching: planQuery.isFetching || applying,
    search: { value: '', pending: false },
    selection,
    open: { id: null, open: () => undefined, close: () => undefined },
  };

  const missingColumns = [!draft.mapping.sku && 'SKU', !draft.mapping.title && 'Name'].filter(Boolean);
  const padded = plan?.summary.padded ?? 0;
  const banner = (
    <div className="flex flex-col gap-2" data-testid="catalog-import-banner">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 truncate text-role-body font-semibold text-mode-ink" title={draft.fileName}>
          {draft.fileName}
        </span>
        <span className="text-role-caption text-mode-muted" data-testid="catalog-import-explain">
          {plan
            ? `${plan.summary.rows} rows · ${plan.summary.old} old dropped · ${padded} SKU${padded === 1 ? '' : 's'} given back leading zeros · existing catalog titles are never changed`
            : `${CHECKING_REASON}…`}
        </span>
      </div>
      {missingColumns.length > 0 ? (
        <EvidenceNotice tone="warn">The file has no {missingColumns.join(' or ')} column — every row will be reported, none added.</EvidenceNotice>
      ) : null}
      {planQuery.isError ? <EvidenceNotice tone="warn">{(planQuery.error as Error).message}</EvidenceNotice> : null}
    </div>
  );

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col" data-testid="catalog-import-review">
      {/* The page's own split CTA (NavPageActions: Add product · Import products CSV) holds the
          primary slot; the import's verbs ride the overall slot, left of it. */}
      <DeskActionSlotRegistrar role="overall">{importActions}</DeskActionSlotRegistrar>
      <TriageCardList
        density="row"
        family={family}
        feed={feed}
        cut={cut}
        summary={<IncomingStatusChips set={chipSet} />}
        bulk={null}
        banner={banner}
        searchEmpty={outcome ? <TriageAllClear title="No rows with this outcome" detail="Press the chip again to see every row." /> : null}
        allClear={<TriageAllClear title="No rows in this file" detail="Pick a CSV with a SKU and a Name column." />}
        record={{ title: 'Row', noun: VIEW.noun.one, testId: 'catalog-import-record', summary: null, strip: null, view: null, showIndex: false }}
      />
    </main>
  );
}
