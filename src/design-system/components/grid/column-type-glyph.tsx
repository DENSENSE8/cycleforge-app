import type { ComponentType } from 'react';
import { Clock, ExternalLink, FileText, Hash, Image, Map, MapPin, Receipt, Tags, Type } from '@/components/Icons';
import type { ColumnType } from '@/lib/tables/table-columns';
import { cn } from '@/utils/_cn';

/** Moved here from `components/ui/table-column-config/` on 2026-08-29 when that directory went with the column-display rail — this glyph is… */
const COLUMN_TYPE_GLYPH: Record<ColumnType, ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  id: Hash,
  tag: Tags,
  longtext: FileText,
  date: Clock,
  external: ExternalLink,
  location: Map,
  tracking: MapPin,
  price: Receipt,
  image: Image,
};

/**
 * Structural, not decorative: it denotes the column's data type. Header
 * consumers override the ink (`text-text-default` on glyph-only tracks so a
 * photo column is visible, not faint-on-white).
 */
export function ColumnTypeGlyph({ type, className }: { type: ColumnType; className?: string }) {
  const Glyph = COLUMN_TYPE_GLYPH[type];
  return <Glyph className={cn('h-3 w-3 shrink-0 text-text-faint', className)} />;
}
