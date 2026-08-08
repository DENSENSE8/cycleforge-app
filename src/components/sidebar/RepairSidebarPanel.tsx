'use client';

/**
 * Repair sidebar — Favorites quick-pick + intake overlay host.
 *
 * Active / Done tabs, list search, and Add live in `RepairWorkspaceHeader` on
 * the right pane (dashboard Incoming/Outbound chrome recipe). This panel keeps
 * the Favorites rail and owns the full-screen intake form opened via `?new=true`
 * or a favorite "Start Repair".
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Loader2 } from '@/components/Icons';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { useBodyScrollLock } from '@/design-system/hooks';
import { useRepairNewParam } from '@/hooks/useRepairNewParam';
import { toast } from '@/lib/toast';
import {
  RepairIntakeForm,
  type RepairFormData,
  type RepairSubmitResult,
} from '@/components/repair';
import { FavoritesWorkspaceSection } from '@/components/sidebar/FavoritesWorkspaceSection';
import type { FavoriteSkuRecord } from '@/lib/favorites/sku-favorites';
import { sectionLabel, cardTitle } from '@/design-system/tokens/typography/presets';
import {
  buildDraftFromFavorite,
  fetchFavoriteIntakeContext,
} from '@/components/repair/repair-favorite-intake';
import { parseRepairTab } from '@/lib/walk-in/history-modes';

interface RepairSidebarPanelProps {
  embedded?: boolean;
  hideSectionHeader?: boolean;
}

const REPAIR_SUBMIT_TIMEOUT_MS = 60_000;

export function RepairSidebarPanel({ embedded = false, hideSectionHeader = false }: RepairSidebarPanelProps) {
  const searchParams = useSearchParams();
  const { newPulse, clearPulse } = useRepairNewParam();
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [isFetchingFavorite, setIsFetchingFavorite] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [intakeDraft, setIntakeDraft] = useState<Partial<RepairFormData> | undefined>(undefined);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<number | null>(null);
  // Idempotency key for the in-flight intake submission. Persists across failed
  // retries (so a replay dedupes the Zendesk ticket) and is cleared on success.
  const repairIdemKey = useRef<string | null>(null);

  const activeTab = parseRepairTab(searchParams.get('tab'));
  const showFavorites = activeTab === 'active' || activeTab === 'incoming';

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // One-shot: paint intake from optimistic/URL pulse, then strip `?new=`.
  useEffect(() => {
    if (!newPulse) return;
    setIntakeDraft(undefined);
    setSelectedFavoriteId(null);
    setShowIntakeForm(true);
    clearPulse();
  }, [newPulse, clearPulse]);

  useBodyScrollLock(isMounted && showIntakeForm);

  const handleCloseForm = () => {
    setShowIntakeForm(false);
    setIntakeDraft(undefined);
    setSelectedFavoriteId(null);
  };

  const handleSubmitForm = async (data: RepairFormData): Promise<RepairSubmitResult | null> => {
    if (!repairIdemKey.current) repairIdemKey.current = safeRandomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REPAIR_SUBMIT_TIMEOUT_MS);
    try {
      const response = await fetch('/api/repair/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': repairIdemKey.current,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let result: Record<string, unknown>;
      try {
        result = await response.json();
      } catch {
        throw new Error(
          response.ok
            ? 'Invalid response from server. Please try again.'
            : `Failed to submit repair (${response.status}). Please try again.`,
        );
      }

      if (response.ok && result.success) {
        repairIdemKey.current = null;
        const ticketUrl: string | null =
          typeof result.zendeskTicketUrl === 'string' ? result.zendeskTicketUrl : null;
        const ticketSuffix = result.zendeskTicketNumber
          ? ` — ticket ${result.zendeskTicketNumber}`
          : '';
        toast.success(`Repair ${result.rsNumber ?? ''} submitted${ticketSuffix}`.trim(), {
          action: ticketUrl
            ? { label: 'Open', onClick: () => window.open(ticketUrl, '_blank', 'noopener') }
            : undefined,
        });
        if (result.signatureWarning) {
          toast.warning(`Repair submitted, but: ${String(result.signatureWarning)}`);
        }
        return {
          id: Number(result.id),
          rsNumber: (result.rsNumber as string | number | null | undefined) ?? null,
          zendeskTicketNumber: (result.zendeskTicketNumber as string | null | undefined) ?? null,
          zendeskTicketUrl: ticketUrl,
        };
      }

      const message =
        typeof result.error === 'string' && result.error.trim()
          ? result.error
          : typeof result.details === 'string' && result.details.trim()
            ? result.details
            : `Failed to submit repair form (${response.status}). Please try again.`;
      throw new Error(message);
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          'Submission timed out. The repair may already have been saved — check the Active repairs list before submitting again.',
        );
      }
      if (error instanceof Error) throw error;
      throw new Error('Error submitting repair form. Please try again.');
    }
  };

  const handleUseFavorite = async (favorite: FavoriteSkuRecord) => {
    setIsFetchingFavorite(true);
    try {
      const { ecwidProduct, skuReasons } = await fetchFavoriteIntakeContext(favorite);
      setSelectedFavoriteId(favorite.id);
      setIntakeDraft(buildDraftFromFavorite(favorite, ecwidProduct, skuReasons));
      setShowIntakeForm(true);
    } finally {
      setIsFetchingFavorite(false);
    }
  };

  const content = (
    <SidebarShell
      className="bg-surface-card"
      headerAbove={
        !hideSectionHeader ? (
          <div className={`border-b border-border-hairline ${SIDEBAR_GUTTER} pt-4 pb-3`}>
            <p className={`${sectionLabel} text-orange-500`}>Repair</p>
            <h2 className={`mt-1 ${cardTitle}`}>Repairs</h2>
          </div>
        ) : null
      }
      bodyClassName="relative pb-4"
    >
      {isFetchingFavorite && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-surface-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-orange-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className={sectionLabel}>Loading…</span>
          </div>
        </div>
      )}

      {showFavorites ? (
        <FavoritesWorkspaceSection
          workspaceKey="repair"
          accent="orange"
          title="Favorites"
          description=""
          emptyLabel="No repair favorites yet — tap + to add a common repair"
          useLabel="Start Repair"
          allowRepairDefaults
          inlineRows
          onUseFavorite={handleUseFavorite}
          searchSkuSuffixFilter="-RS"
          fuzzyTitleSearch
          searchResultsMaxHeightClass="max-h-72"
        />
      ) : (
        <div className={`${SIDEBAR_GUTTER} py-6`}>
          <p className="text-role-caption text-text-faint">
            Favorites are available on the Active queue.
          </p>
        </div>
      )}
    </SidebarShell>
  );

  const intakeOverlay =
    isMounted && showIntakeForm
      ? createPortal(
          <div className="fixed inset-0 z-panelOverlay bg-surface-card">
            <RepairIntakeForm
              onClose={handleCloseForm}
              onSubmit={handleSubmitForm}
              initialData={intakeDraft}
              favoriteSkuId={selectedFavoriteId}
            />
          </div>,
          document.body,
        )
      : null;

  if (embedded) {
    return (
      <>
        <div className={`h-full overflow-hidden ${appChromeClass}`}>{content}</div>
        {intakeOverlay}
      </>
    );
  }

  return (
    <>
      <aside className={`h-full overflow-hidden border-r border-border-soft ${appChromeClass}`}>{content}</aside>
      {intakeOverlay}
    </>
  );
}
