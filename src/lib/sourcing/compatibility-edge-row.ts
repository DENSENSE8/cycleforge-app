/** One part-to-model compatibility rule, as the admin table reads it. */
export interface CompatibilityEdgeRow {
  id: number;
  bose_model_id: number;
  sku_id: number;
  part_role: string;
  is_oem: boolean;
  fit: string;
  confidence: string;
  source: string;
  model_number: string;
  model_name: string;
  sku: string;
  product_title: string;
}
