/** The favorites RAIL contract — one read and one write, shared by every `<catalog base>/favorites` route (`/api/repair`,… */

import 'server-only';

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  listFavoriteSkus,
  setFavoriteSkuMembership,
  type FavoriteSkuRecord,
} from './sku-favorites';
import { normalizeFavoriteSku, type FavoriteWorkspaceKey } from './favorite-sku-key';

export interface FavoritesRailPayload {
  workspaceKey: FavoriteWorkspaceKey;
  favorites: FavoriteSkuRecord[];
  /** Normalized SKU keys in curated order — what a tile star reads. */
  skus: string[];
  count: number;
}

/** Read the rail's curated list. */
export async function readFavoritesRail(
  workspaceKey: FavoriteWorkspaceKey,
  orgId: OrgId,
): Promise<FavoritesRailPayload> {
  const favorites = await listFavoriteSkus(workspaceKey, false, orgId);
  return {
    workspaceKey,
    favorites,
    skus: favorites.map((favorite) => normalizeFavoriteSku(favorite.sku)).filter(Boolean),
    count: favorites.length,
  };
}

/**
 * Star / unstar body. `favorite` is the DESIRED state, not a verb: a tile that
 * re-sends the state it already shows must not flip it, because the two tablets
 * at the counter can both be looking at the same grid.
 */
export const FavoriteTogglePayloadSchema = z.object({
  sku: z.string().trim().min(1).max(255),
  favorite: z.boolean(),
  /** Catalog title, used only to seed a brand-new anchor row's label. */
  label: z.string().trim().max(255).optional(),
});

export type FavoriteTogglePayload = z.infer<typeof FavoriteTogglePayloadSchema>;

export interface FavoriteToggleResult extends FavoritesRailPayload {
  success: true;
  favorited: boolean;
  sku: string;
}

/** Apply a star / unstar and hand back the rail's new membership. */
export async function applyFavoriteToggle(
  workspaceKey: FavoriteWorkspaceKey,
  orgId: OrgId,
  payload: FavoriteTogglePayload,
  staffId: number | null = null,
): Promise<FavoriteToggleResult> {
  const { favorited } = await setFavoriteSkuMembership(
    {
      workspaceKey,
      sku: payload.sku,
      favorite: payload.favorite,
      label: payload.label ?? null,
      staffId,
    },
    orgId,
  );

  return {
    success: true,
    favorited,
    sku: payload.sku,
    ...(await readFavoritesRail(workspaceKey, orgId)),
  };
}
