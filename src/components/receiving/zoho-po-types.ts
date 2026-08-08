import {
  CONDITION_GRADES,
  conditionLabel as conditionGradeLabel,
  conditionOptions,
} from '@/lib/conditions';

interface ZohoPOLine {
  line_item_id: string;
  item_id: string;
  name?: string;
  sku?: string;
  description?: string;
  quantity?: number;
  quantity_received?: number;
  rate?: number;
  total?: number;
  unit?: string;
}

  purchaseorder_number?: string;
  vendor_name?: string;
  status?: string;
  date?: string;
  delivery_date?: string;
  expected_delivery_date?: string;
  total?: number;
  currency_code?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  line_items?: ZohoPOLine[];
  reference_number?: string;
}

type POStatus = 'issued' | 'partially_received' | 'open' | 'received' | 'draft' | 'cancelled' | 'all';

// All 7 grades from the shared source of truth (was a 5-grade subset).
export const CONDITION_OPTIONS = conditionOptions('full');

// Friendly labels for every condition grade, used anywhere a raw enum like
// `BRAND_NEW` would otherwise leak to a human — ticket bodies, exports, etc.
// Delegates to the shared `full` variant (src/lib/conditions.ts), which is
// pure + dependency-free so this stays safe to import from server code (e.g.
// Zendesk ticket templates). Empty → '' and unknown → Title Case are kept.
export function conditionLabel(code: string | null | undefined): string {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return '';
  if ((CONDITION_GRADES as readonly string[]).includes(c)) {
    return conditionGradeLabel(c, 'full');
  }
  // Unknown grade: title-case the raw value so it still reads cleanly.
  return c.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

