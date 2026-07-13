/**
 * Z-index scale values — loaded natively by Node (tailwind.config) without
 * MODULE_TYPELESS_PACKAGE_JSON reparsing. Types live in z-index.ts.
 *
 * @type {const}
 */
export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 30,
  header: 40,
  dropdown: 50,
  fab: 90,
  panel: 100,
  panelBackdrop: 99,
  panelPopover: 120,
  panelOverlay: 130,
  modalBackdrop: 190,
  modal: 200,
  elevatedModal: 300,
  banner: 350,
  command: 1000,
  takeover: 1200,
  splash: 2000,
  toast: 2050,
  tooltip: 2147483647,
};
