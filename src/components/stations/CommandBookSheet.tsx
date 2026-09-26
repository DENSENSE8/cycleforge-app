'use client';

import { useMemo } from 'react';

import { Printer } from '@/components/Icons';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';
import { Button } from '@/design-system/primitives';
import { Gs1DataMatrix } from '@/components/barcode/Gs1DataMatrix';
import { printStationCommandLabel } from '@/lib/print/printStationCommandLabel';
import {
  buildCommandBook,
  type CommandBookEntry,
} from '@/lib/stations/command-book';
import { CommandAliasEditor } from './CommandAliasEditor';
import { cn } from '@/utils/_cn';

/** The command book — every scannable `CMD-*` string, one page you can print, bind and scan straight off the paper. */

const MATRIX_PX = 128;

function BookRow({ entry }: { entry: CommandBookEntry }) {
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-6 border-b border-border-soft py-4',
        // Never split a code across a page fold — half a matrix is unscannable
        // and half an instruction is worse.
        'break-inside-avoid',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-mono text-role-body font-bold uppercase tracking-wide text-text-strong">
          {entry.code}
        </p>
        <p className="mt-1 text-role-body font-semibold text-text-default">{entry.label}</p>
        <p className="mt-0.5 text-role-caption text-text-soft">{entry.effect}</p>
        {entry.writes ? (
          <p className="mt-1 text-role-caption font-semibold uppercase tracking-wider text-amber-700">
            Scan the unit first · this is written to the audit log
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2">
        <div style={{ width: MATRIX_PX, height: MATRIX_PX }}>
          <Gs1DataMatrix
            value={entry.code}
            symbology="datamatrix"
            fill
            quietZone={2}
            ariaLabel={`${entry.label} barcode`}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="print:hidden"
          onClick={() => printStationCommandLabel({ code: entry.code, label: entry.label })}
        >
          <Printer className="h-3.5 w-3.5" />
          2×1 sticker
        </Button>
      </div>
    </li>
  );
}

export function CommandBookSheet() {
  const sections = useMemo(() => buildCommandBook(), []);
  const total = sections.reduce((n, s) => n + s.entries.length, 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <SettingsSectionHeader
            title="Scan command book"
            belowSlot={
              <p className="text-role-body text-text-soft">
                {total} codes. Print this page, bind it, and scan straight off the paper.
                Every code here is the exact string the scanner reads — nothing is
                abbreviated for the page.
              </p>
            }
          />
        </div>
        <Button
          variant="primary"
          className="shrink-0 print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
          Print book
        </Button>
      </div>

      {sections.map((section) => (
        <section key={section.family} className="mb-10 break-inside-avoid-page">
          <h2 className="text-role-heading font-bold text-text-strong">{section.title}</h2>
          <p className="mt-1 mb-2 text-role-caption text-text-soft">{section.blurb}</p>
          <ul className="border-t border-border-soft">
            {section.entries.map((entry) => (
              <BookRow key={entry.code} entry={entry} />
            ))}
          </ul>
        </section>
      ))}

      <CommandAliasEditor />
    </div>
  );
}
