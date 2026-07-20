import type { ComponentType } from 'react';
import { Clock, FileText, Hash, Tags, Type } from '@/components/Icons';
import type { ColumnType } from '@/lib/tables/table-columns';
import { cn } from '@/utils/_cn';

/**
 * type → glyph, resolved in ONE place so typed table headers never inline a
 * per-column icon choice (the presentation-kind discipline: data drives display).
 * Grids that render typed headers read this; the view stays dumb.
 *
 *   text     → serif "T"        long text  → document
 *   number   → hash             tag        → tags (single-select)
 *   id       → hash             date/age   → clock
 */
const COLUMN_TYPE_GLYPH: Record<ColumnType, ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  id: Hash,
  tag: Tags,
  longtext: FileText,
  date: Clock,
};

/**
 * Subtle data-type indicator shown before a column-header label (Airtable-style).
 * Structural, not decorative: it denotes the column's data type. Kept faint +
 * small so the header reads label-first.
 */
export function ColumnTypeGlyph({ type, className }: { type: ColumnType; className?: string }) {
  const Glyph = COLUMN_TYPE_GLYPH[type];
  return <Glyph className={cn('h-3 w-3 shrink-0 text-text-faint', className)} />;
}
