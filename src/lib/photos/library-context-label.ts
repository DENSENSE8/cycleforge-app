import type { PhotoLibraryFilterState, PhotoLibrarySourceScope } from './library-filter-state';
import {
  PHOTO_SOURCE_SCOPE_LABELS,
  sourceScopeFromFilters,
} from './library-filter-state';
import { claimsTicketLabel } from '@/lib/photos/display-names';
import { photoStageLabel } from '@/lib/photos/stages';

const PHOTO_LIBRARY_DEFAULT_SUBTITLE =
  'Browse receiving, packing, and unit photos';

/**
 * Format a PO / order / unit ref for folder + breadcrumb chrome.
 * Unboxing synthetic `PO_<cartonId>` refs render as "PO Unfound — <id>".
 */
export function photoLibraryPoLeafLabel(
  poRef: string,
  scope: PhotoLibrarySourceScope,
): string {
  const trimmed = poRef.trim();
  if (!trimmed) return 'PO';
  if (scope === 'local_pickup') return `Pickup ${trimmed}`;
  if (scope === 'packing') return `Order ${trimmed}`;
  if (scope === 'repair') return `Unit ${trimmed}`;
  if (scope === 'unboxing' || scope === 'all') {
    const unfound = trimmed.match(/^PO_(\d+)$/);
    if (unfound) return `PO Unfound — ${unfound[1]}`;
  }
  return `PO ${trimmed}`;
}

/**
 * Active folder leaf for breadcrumb / path chrome when the library is drilled
 * into a carton, PO, or ticket. Prefer ticket → PO → carton id.
 */
export function resolvePhotoLibraryFolderLeafLabel(input: {
  scope: PhotoLibrarySourceScope;
  poRef?: string | null;
  ticketId?: string | null;
  receivingId?: string | null;
}): string | null {
  const ticketId = input.ticketId?.trim();
  if (ticketId) return claimsTicketLabel(ticketId);

  const poRef = input.poRef?.trim();
  if (poRef) return photoLibraryPoLeafLabel(poRef, input.scope);

  const receivingId = input.receivingId?.trim();
  if (receivingId) return `Carton #${receivingId}`;

  return null;
}

/** The title for the un-narrowed archive. */
const ALL_PHOTOS_CONTEXT_TITLE = 'All photos';

export function describePhotoLibraryContext(filters: PhotoLibraryFilterState): {
  title: string;
  subtitle: string;
} {
  const source = sourceScopeFromFilters(filters);
  const hasNarrowerFilter =
    !!filters.receivingId || !!filters.poRef || !!filters.ticketId || !!filters.sku || !!filters.serial;
  if (source !== 'all' && !hasNarrowerFilter) {
    // Stage sub-filter under Unboxing gets the stage's own header — label
    // resolved through the stage SoT, never an inline map.
    if (source === 'unboxing' && filters.stage) {
      return {
        title: photoStageLabel(filters.stage),
        subtitle: 'Unboxing evidence at this stage',
      };
    }
    return {
      title: PHOTO_SOURCE_SCOPE_LABELS[source],
      subtitle: PHOTO_LIBRARY_DEFAULT_SUBTITLE,
    };
  }
  // Prefer the human PO / ticket leaf over the raw receiving id when both are
  // present (Unbox deep-links pass receivingId + poRef together).
  if (filters.ticketId) {
    return {
      title: claimsTicketLabel(filters.ticketId),
      subtitle: 'Photos linked to this Zendesk claim',
    };
  }
  if (filters.sku) {
    return {
      title: `SKU ${filters.sku}`,
      subtitle: 'Photos linked to this SKU across intake, testing, and packing',
    };
  }
  if (filters.serial) {
    return {
      title: `Serial ${filters.serial}`,
      subtitle: 'Photos linked to this serialized unit',
    };
  }
  if (filters.poRef) {
    return {
      title: photoLibraryPoLeafLabel(filters.poRef, source),
      subtitle:
        source === 'packing'
          ? 'Photos linked to this order'
          : 'Photos linked to this purchase order',
    };
  }
  if (filters.receivingId) {
    return {
      title: `Carton #${filters.receivingId}`,
      subtitle: 'Photos linked to this receiving carton',
    };
  }
  if (filters.q) {
    return {
      title: `Search: ${filters.q}`,
      subtitle: 'PO ref, metadata, and OCR matches',
    };
  }
  return {
    title: ALL_PHOTOS_CONTEXT_TITLE,
    subtitle: PHOTO_LIBRARY_DEFAULT_SUBTITLE,
  };
}
