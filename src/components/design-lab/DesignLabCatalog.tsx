'use client';

/**
 * The Design Lab catalog — a launcher, not a showroom.
 *
 * Every card opens a REAL product route against QA fixtures, once per skin
 * generation. Nothing here renders a component in isolation: the deleted
 * `design-demo` zoo proved that a gallery cannot show a scan focus trap, an
 * overlay stack, or a slot-table header sort, which is exactly what a reskin
 * has to survive.
 *
 * Sign-off notes are per-viewpoint and live in localStorage — a QA sitting is
 * not worth a migration, and "Copy sign-off" emits the markdown block that goes
 * into docs/warehouse-os/RESKIN-LAB.md when a wave passes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DESIGN_LAB_SECTIONS,
  DESIGN_LAB_SECTION_LABELS,
  viewpointsForSection,
  type DesignLabSection,
  type DesignLabViewpoint,
} from '@/lib/design-lab/catalog';
import { DESIGN_LAB_SPLIT_HREF } from '@/lib/design-lab/constants';
import { readReskinPreference, withReskinParam } from '@/lib/theme/reskin';
import { RESKIN_GROUP_IDS, type ReskinGroupId } from '@/design-system/themes/reskin';

const NOTES_KEY = 'ds-reskin-notes';

type Verdict = 'pass' | 'fail' | null;
type NoteMap = Record<string, { verdict: Verdict; note: string }>;

function readNotes(): NoteMap {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? (JSON.parse(raw) as NoteMap) : {};
  } catch {
    return {};
  }
}

function splitHref(route: string): string {
  return `${DESIGN_LAB_SPLIT_HREF}?href=${encodeURIComponent(route)}`;
}

export function DesignLabCatalog() {
  const [notes, setNotes] = useState<NoteMap>({});
  const [copied, setCopied] = useState(false);
  // The After link opens whatever the HUD has live, so a card follows the
  // groups under judgement instead of always forcing all nine.
  const [selection, setSelection] = useState<readonly ReskinGroupId[]>(RESKIN_GROUP_IDS);

  useEffect(() => {
    setNotes(readNotes());
    const live = readReskinPreference();
    setSelection(live.length > 0 ? live : RESKIN_GROUP_IDS);
  }, []);

  const persist = useCallback((next: NoteMap) => {
    setNotes(next);
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(next));
    } catch {
      /* private mode — the run still works, the ledger just is not remembered */
    }
  }, []);

  const setVerdict = useCallback(
    (id: string, verdict: Verdict) => {
      const current = notes[id] ?? { verdict: null, note: '' };
      persist({ ...notes, [id]: { ...current, verdict: current.verdict === verdict ? null : verdict } });
    },
    [notes, persist],
  );

  const setNote = useCallback(
    (id: string, note: string) => {
      const current = notes[id] ?? { verdict: null, note: '' };
      persist({ ...notes, [id]: { ...current, note } });
    },
    [notes, persist],
  );

  const tally = useMemo(() => {
    let pass = 0;
    let fail = 0;
    for (const entry of Object.values(notes)) {
      if (entry.verdict === 'pass') pass += 1;
      if (entry.verdict === 'fail') fail += 1;
    }
    return { pass, fail };
  }, [notes]);

  const copyLedger = useCallback(async () => {
    const lines: string[] = [`| Viewpoint | Route | Verdict | Note |`, `| --- | --- | --- | --- |`];
    for (const section of DESIGN_LAB_SECTIONS) {
      for (const v of viewpointsForSection(section)) {
        const entry = notes[v.id];
        if (!entry?.verdict && !entry?.note) continue;
        lines.push(
          `| ${v.label} | \`${v.route}\` | ${entry.verdict ?? '—'} | ${entry.note.replace(/\|/g, '\\|') || '—'} |`,
        );
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard denied — the table is still on screen to transcribe */
    }
  }, [notes]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-role-caption text-text-muted">
          {tally.pass} pass · {tally.fail} fail · {Object.keys(notes).length} noted
        </span>
        <Button variant="outline" size="sm" onClick={copyLedger}>
          {copied ? 'Copied' : 'Copy sign-off markdown'}
        </Button>
      </div>

      {DESIGN_LAB_SECTIONS.map((section) => (
        <Section
          key={section}
          section={section}
          notes={notes}
          selection={selection}
          onVerdict={setVerdict}
          onNote={setNote}
        />
      ))}
    </div>
  );
}

function Section({
  section,
  notes,
  selection,
  onVerdict,
  onNote,
}: {
  section: DesignLabSection;
  notes: NoteMap;
  selection: readonly ReskinGroupId[];
  onVerdict: (id: string, verdict: Verdict) => void;
  onNote: (id: string, note: string) => void;
}) {
  const viewpoints = viewpointsForSection(section);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-role-eyebrow font-semibold uppercase tracking-wide text-text-faint">
        {DESIGN_LAB_SECTION_LABELS[section]}
        <span className="ml-2 tabular-nums text-text-faint">{viewpoints.length}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {viewpoints.map((v) => (
          <ViewpointCard
            key={v.id}
            viewpoint={v}
            entry={notes[v.id]}
            selection={selection}
            onVerdict={onVerdict}
            onNote={onNote}
          />
        ))}
      </div>
    </section>
  );
}

function ViewpointCard({
  viewpoint,
  entry,
  selection,
  onVerdict,
  onNote,
}: {
  viewpoint: DesignLabViewpoint;
  entry: { verdict: Verdict; note: string } | undefined;
  selection: readonly ReskinGroupId[];
  onVerdict: (id: string, verdict: Verdict) => void;
  onNote: (id: string, note: string) => void;
}) {
  const verdict = entry?.verdict ?? null;
  return (
    <article
      className={cn(
        'flex flex-col gap-3 border bg-surface-card p-4',
        cornerClass('field'),
        verdict === 'pass'
          ? 'border-border-success'
          : verdict === 'fail'
            ? 'border-border-danger'
            : 'border-border-soft',
      )}
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-role-body font-semibold text-text-default">{viewpoint.label}</h3>
        <code className="text-role-micro text-text-soft">{viewpoint.route}</code>
      </header>

      <p className="text-role-caption text-text-muted">{viewpoint.exercise}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <LaunchLink href={withReskinParam(viewpoint.route, [])} label="Before" />
        <LaunchLink href={withReskinParam(viewpoint.route, selection)} label="After" />
        <LaunchLink href={splitHref(viewpoint.route)} label="Split" />
      </div>

      <div className="flex items-center gap-1.5">
        <VerdictButton
          active={verdict === 'pass'}
          tone="pass"
          onClick={() => onVerdict(viewpoint.id, 'pass')}
        />
        <VerdictButton
          active={verdict === 'fail'}
          tone="fail"
          onClick={() => onVerdict(viewpoint.id, 'fail')}
        />
        <Input
          type="text"
          value={entry?.note ?? ''}
          onChange={(e) => onNote(viewpoint.id, e.target.value)}
          placeholder="What broke?"
          aria-label={`Sign-off note for ${viewpoint.label}`}
          className="h-8 min-w-0 flex-1 bg-surface-canvas text-role-caption"
        />
      </div>
    </article>
  );
}

function LaunchLink({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href} target="_blank" rel="noreferrer">
        {label}
      </Link>
    </Button>
  );
}

function VerdictButton({
  active,
  tone,
  onClick,
}: {
  active: boolean;
  tone: 'pass' | 'fail';
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        active && tone === 'pass' && 'border-border-success bg-surface-success text-text-success',
        active && tone === 'fail' && 'border-border-danger bg-surface-danger text-text-danger',
      )}
    >
      {tone === 'pass' ? 'Pass' : 'Fail'}
    </Button>
  );
}
