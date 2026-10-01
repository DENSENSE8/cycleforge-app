/** Structural DataTable columns that never expose click-to-sort. */

const DATA_TABLE_CHROME_KEYS = [
  'select',
  'actions',
  'action',
  '_fill',
  'thumb',
] as const;

type DataTableChromeColumnKey = (typeof DATA_TABLE_CHROME_KEYS)[number];

const DATA_TABLE_CHROME = new Set<string>(DATA_TABLE_CHROME_KEYS);

export function isDataTableChromeColumn(key: string): key is DataTableChromeColumnKey {
  return DATA_TABLE_CHROME.has(key);
}
