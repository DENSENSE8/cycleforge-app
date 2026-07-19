/**
 * Client-safe image-type definitions — types, the built-in list, and the slug
 * helper. Split out of `image-types.ts` (which owns the DB reads/writes via
 * `tenancy/db`) so client modules like `library-filter-state.ts` can consume
 * the constants without dragging the server-only Neon driver into station
 * bundles. `image-types.ts` re-exports everything here, so server callers keep
 * their existing import path.
 */
import type { PhotoLibrarySourceScope } from './library-filter-state';

export interface BuiltInImageType {
  kind: 'builtin';
  /** Equals a library source scope; drives the entity-derived query + flow. */
  key: Exclude<PhotoLibrarySourceScope, 'all'>;
  label: string;
  /** Icon glyph name (mapped to a component in the sidebar; lib stays UI-free). */
  icon: string;
}

export interface CustomImageType {
  kind: 'custom';
  id: number;
  key: string;
  label: string;
  gcsPrefix: string;
  icon: string | null;
  sortIndex: number;
  /** Seeded system type (e.g. 'listing') — non-deletable / non-renamable, pinned first. */
  isSystem: boolean;
}

export type ImageType = BuiltInImageType | CustomImageType;

/** The five built-in types (SoT for the sidebar's fixed rows). */
export const BUILTIN_IMAGE_TYPES: BuiltInImageType[] = [
  { kind: 'builtin', key: 'unboxing', label: 'Unboxing', icon: 'PackageOpen' },
  { kind: 'builtin', key: 'local_pickup', label: 'Pickups', icon: 'ShoppingCart' },
  { kind: 'builtin', key: 'packing', label: 'Packing', icon: 'Package' },
  { kind: 'builtin', key: 'repair', label: 'Repair', icon: 'Wrench' },
  { kind: 'builtin', key: 'claims', label: 'Claims', icon: 'TicketHelp' },
  { kind: 'builtin', key: 'outbound', label: 'Outbound', icon: 'Truck' },
];

export const BUILTIN_IMAGE_TYPE_KEYS = new Set<string>(BUILTIN_IMAGE_TYPES.map((t) => t.key));

/**
 * Keys reserved for seeded SYSTEM image types (photo_image_types.is_system). They
 * exist as rows (so they carry a gcs_prefix + photoType tag) but must not be
 * re-created or collided with by an operator. 'listing' is the marketplace
 * listing-photo type (see 2026-06-26b_photo_listing_type.sql).
 */
export const SYSTEM_IMAGE_TYPE_KEYS = new Set<string>(['listing']);

/** Lowercase, path-safe slug used as both the `key` and the `gcs_prefix`. */
export function slugifyImageType(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'type'
  );
}
