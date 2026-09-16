/**
 * Shapes shared by the `/m/scan` location-bind faces.
 *
 * Their own module so the presentational faces (`LocationQtyStrip`,
 * `LocationSearchFace`) and the orchestrator (`MobileLocationBindSheet`) can
 * all name them without importing each other in a cycle.
 */

export type LocationBindContent = {
  sku: string;
  qty: number;
  productTitle: string | null;
  imageUrl?: string | null;
};

export type LocationBindSnapshot = {
  code: string;
  face: string;
  contents: LocationBindContent[];
};
