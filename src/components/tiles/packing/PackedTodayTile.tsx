'use client';

/**
 * Boxes packed by packer for one warehouse civil day (America/Los_Angeles).
 * Opened from the beam Packed button / launcher. Host-agnostic: no shell imports.
 */

import { useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  addDaysToDateKey,
  formatDateKeyMedium,
  getCurrentPSTDateKey,
} from '@/utils/date';
import {
  fetchPackerBoxCounts,
  type PackerBoxCountReport,
} from './packed-today-tile-data';

export function PackedTodayTile() {
  const today = getCurrentPSTDateKey();
  const [day, setDay] = useState(today);
  const [report, setReport] = useState<PackerBoxCountReport | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetchPackerBoxCounts(day)
      .then((next) => {
        if (!alive) return;
        setReport(next);
        setStatus('ok');
      })
      .catch(() => {
        if (!alive) return;
        setReport(null);
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [day]);

  const canNext = day < today;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-1 p-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Previous day"
          onClick={() => setDay((d) => addDaysToDateKey(d, -1) || d)}
        >
          <ChevronLeftIcon />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Boxes packed
          </div>
          <div className="text-sm">{formatDateKeyMedium(day, { weekday: 'long', withYear: true })}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Next day"
          disabled={!canNext}
          onClick={() => {
            if (!canNext) return;
            setDay((d) => addDaysToDateKey(d, 1) || d);
          }}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      {day !== today ? (
        <div className="px-3 pb-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDay(today)}>
            Today
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {status === 'loading' ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : null}
        {status === 'error' ? (
          <div className="text-sm text-muted-foreground">Could not load packing counts.</div>
        ) : null}
        {status === 'ok' && report && report.rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No boxes packed this day.</div>
        ) : null}
        {status === 'ok' && report && report.rows.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-condensed text-technical font-bold uppercase tracking-[0.14em]">Packer</th>
                <th className="py-1 text-right font-condensed text-technical font-bold uppercase tracking-[0.14em]">Boxes</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.packer}>
                  <td className="py-1">{row.packer}</td>
                  <td className="mono py-1 text-right">{row.boxesPacked}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="py-1.5">Total</td>
                <td className="mono py-1.5 text-right">{report.total}</td>
              </tr>
            </tfoot>
          </table>
        ) : null}
      </div>
    </div>
  );
}
