'use client';

/**
 * Isolation harness for the **right-rail industrial flush** (Cybertruck / WMS)
 * Displays push column — renders `StationDisplaysPushStack` on the Root Index
 * with mock rows so the index chrome can be eyeballed and Playwright-shot
 * WITHOUT auth.
 *
 * Open http://localhost:3050/design-demo/displays-flush (dev / preview only —
 * the `/design-demo/*` layout 404s in production, so this never ships).
 *
 * What to verify (no login needed):
 *  1. Top icon band carries a bottom hairline against the index below it.
 *  2. Group eyebrow is LABEL ……… action count — no Collapse, no kbd chip.
 *  3. Rows: 2px transparent accent rail → accent + pulsing chevron when armed;
 *     the icon column never moves between states.
 *  4. Clicking a row drills to its leaf (sticky Back); Esc pops back to index.
 */

import { useState } from 'react';
import { Barcode, FileText, Images, Link2, MessageSquare, Package } from '@/components/Icons';
import { TabDisplay } from '@/design-system/components';
import type { SectionTab } from '@/design-system/components';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import {
  StationDisplaysPushStack,
  STATION_DISPLAY_INDEX,
  type DisplayIndexRow,
} from '@/components/station/displays';
import { PhotosDisplayHost } from '@/components/receiving/workspace/line-edit/PhotosDisplayHost';
import type { UnboxPhotoAction } from '@/components/receiving/workspace/line-edit/unbox-side-tabs';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { cn } from '@/utils/_cn';

/** Mock carton row — Move/Send fetch behind the 401'd API and render empty; the
 *  flush chrome (segment · search · list · empty bands) is what we verify. */
const MOCK_ROW = { id: 1, receiving_id: 1 } as ReceivingLineRow;

/** A representative flush body: full-bleed hairline rows, no card island. */
function FlushList({ rows }: { rows: string[] }) {
  return (
    <ul className="divide-y divide-border-hairline">
      {rows.map((r) => (
        <li
          key={r}
          className={cn(
            'flex items-center justify-between py-2 text-role-caption text-text-default',
            DISPLAYS_BODY_INSET,
          )}
        >
          <span className="truncate">{r}</span>
          <span className="font-mono tabular-nums text-text-soft">…{r.length}0492</span>
        </li>
      ))}
    </ul>
  );
}

/** A nested verb strip + flush body — mirrors PhotosDisplayHost / LinkageDisplayHost. */
function VerbBody({
  verbs,
  rows,
}: {
  verbs: { id: string; label: string; icon: (p: { className?: string }) => JSX.Element }[];
  rows: string[];
}) {
  const [active, setActive] = useState(verbs[0]?.id ?? '');
  return (
    <div className="flex min-h-0 flex-col gap-0">
      <div className="shrink-0">
        <TabDisplay
          tabs={verbs}
          activeTab={active}
          onTabChange={setActive}
          density="nested"
          fit="fill"
          appearance="underline"
          aria-label="Verb actions"
        />
      </div>
      {/* No section eyebrow — the verb tab already names this body. Restating
          it ("Link" tab → "LINK" heading) is the double-title redundancy the
          condensed Cybertruck grammar forbids. */}
      <div className="min-h-0 flex-1">
        <FlushList rows={rows} />
      </div>
    </div>
  );
}

/** Mirrors a real matched carton so the Root Index reads like the bench. */
const INDEX_ROWS: DisplayIndexRow[] = [
  { id: 'ticket', label: 'Ticket', subtitle: 'Claim needed', tone: 'action', group: 'verification' },
  { id: 'photos', label: 'Photos', subtitle: '10 photos', tone: 'ok', group: 'verification' },
  { id: 'linkage', label: 'Pairing', subtitle: 'Paired', tone: 'ok', group: 'verification' },
  { id: 'classify', label: 'Classify', subtitle: 'PO', tone: 'ok', group: 'verification' },
  { id: 'inventory', label: 'Inventory', subtitle: '1/1 received', tone: 'ok', group: 'assets' },
  { id: 'staging', label: 'Listings', subtitle: 'Listing links', tone: 'neutral', group: 'assets' },
  { id: 'units', label: 'Units', subtitle: '1 serial', tone: 'ok', group: 'assets' },
];

export default function DisplaysFlushDemoPage() {
  const [active, setActive] = useState<string>(STATION_DISPLAY_INDEX);
  const [photoAction, setPhotoAction] = useState<UnboxPhotoAction>('move');

  const tabs: SectionTab[] = [
    {
      id: 'ticket',
      label: 'Ticket',
      icon: MessageSquare,
      content: (
        <VerbBody
          verbs={[
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'claim', label: 'Claim', icon: FileText },
          ]}
          rows={['Damaged in transit', 'Wrong item received', 'Missing accessory']}
        />
      ),
    },
    {
      id: 'photos',
      label: 'Photos',
      icon: Images,
      content: (
        <PhotosDisplayHost
          row={MOCK_ROW}
          action={photoAction}
          onActionChange={setPhotoAction}
        />
      ),
    },
    {
      id: 'linkage',
      label: 'Pairing',
      icon: Link2,
      content: (
        <VerbBody
          verbs={[
            { id: 'link', label: 'Link', icon: Link2 },
            { id: 'note', label: 'Zoho', icon: FileText },
          ]}
          rows={['PO-48213 · Sony WH-1000XM5', 'PO-48219 · Bose QC45', 'Unmatched · scan a PO']}
        />
      ),
    },
    {
      id: 'classify',
      label: 'Classify',
      icon: Barcode,
      content: (
        <div className={cn('pt-3', DISPLAYS_BODY_INSET)}>
          <FlushList rows={['New', 'Open box', 'Used - Good', 'For parts']} />
        </div>
      ),
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: Package,
      content: (
        <div className={cn('pt-3', DISPLAYS_BODY_INSET)}>
          <FlushList rows={['PO-48213 · 1 of 1 received', 'Zoho note · synced']} />
        </div>
      ),
    },
    {
      id: 'staging',
      label: 'Listings',
      icon: Barcode,
      priority: 'overflow',
      content: (
        <div className={cn('pt-3', DISPLAYS_BODY_INSET)}>
          <FlushList rows={['Bay A-01', 'Bay A-02', 'Returns bin']} />
        </div>
      ),
    },
    {
      id: 'units',
      label: 'Units',
      icon: Barcode,
      priority: 'overflow',
      content: (
        <div className={cn('pt-3', DISPLAYS_BODY_INSET)}>
          <FlushList rows={['SN-77190492', 'SN-77190493', 'SN-77190494']} />
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-[100dvh] w-full bg-surface-canvas">
      {/* Sunken center stand-in — the push column should abut this flush. */}
      <div className="flex min-w-0 flex-1 items-center justify-center bg-surface-sunken">
        <p className="text-role-caption text-text-soft">
          center work surface — Displays push column abuts flush on the right →
        </p>
      </div>
      <StationDisplaysPushStack
        ariaLabel="Displays flush demo"
        testId="displays-flush-demo"
        storageKey="design-demo-displays-flush-width"
        resizeTestId="displays-flush-demo-resize"
        tabs={tabs}
        indexRows={INDEX_ROWS}
        activeTab={active}
        onTabChange={setActive}
        onClose={() => setActive(STATION_DISPLAY_INDEX)}
      />
    </div>
  );
}
