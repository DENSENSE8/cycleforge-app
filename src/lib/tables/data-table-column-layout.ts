/** Static column bindings used to construct each registered DataTable family. */

export interface DataTableColumnBinding {
  fieldId: string;
}

export interface DataTableColumnLayout {
  morph: 'sheet' | 'compound';
  identityFieldId: string;
  statusBindings: DataTableColumnBinding[];
  subtitleBindings: DataTableColumnBinding[];
  amountFieldId?: string | null;
}
