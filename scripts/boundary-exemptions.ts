/** FROZEN BASELINE — 2026-09-14 audit (C1). SHRINK-ONLY. */
export const BOUNDARY_EXEMPTIONS: readonly string[] = [
  "src/app/m/(immersive)/consult/page.tsx => src/components/kiosk/KioskRealtimeProvider.tsx",
  "src/app/m/(shell)/h/[id]/page.tsx => src/components/receiving/HandlingUnitChip.tsx",
  "src/app/m/(shell)/id/[job]/[entityId]/page.tsx => src/components/identification/IdentificationJobFace.tsx",
  "src/app/m/(shell)/id/pick/[orderId]/page.tsx => src/components/identification/IdentificationJobFace.tsx",
  "src/app/m/(shell)/id/scan-out/[orderId]/page.tsx => src/components/identification/IdentificationJobFace.tsx",
  "src/app/m/(shell)/layout.tsx => src/components/station/capture-upload/index.ts",
  "src/app/m/(shell)/pick/[orderId]/_picker/picker-shared.ts => src/components/inventory/SkuIdentity.tsx",
  "src/app/m/(shell)/qr-auth/page.tsx => src/components/auth/StaffChoiceRowButton.tsx",
  "src/app/m/(shell)/r/[id]/layout.tsx => src/components/qr/public-qr-landing.tsx",
  "src/app/receiving/lines/[id]/page.tsx => src/components/mobile/receiving/ScanAgainBar.tsx",
  "src/app/serial/[id]/page.tsx => src/components/mobile/receiving/ScanAgainBar.tsx",
  "src/components/auth/SignInQrScanDialog.tsx => src/components/mobile/ScanSurface.tsx",
  "src/components/layout/MobileRouteShell.tsx => src/components/mobile/receiving/ReceivingPhoneBridgeMount.tsx",
  "src/components/mobile/identify/useMobileIdentify.ts => src/components/receiving/label-identify/useLabelIdentify.ts",
  "src/components/mobile/identify/useMobileIdentify.ts => src/components/receiving/label-identify/useLiveLabelScan.ts",
  "src/components/mobile/orders/MobileOrderIntakeForm.tsx => src/components/outbound/orders/intake/IntakeCombobox.tsx",
  "src/components/mobile/packer/MobilePackingRow.tsx => src/components/receiving/ReceivingIdentityChips.tsx",
  "src/components/mobile/packer/MobilePackingSheet.tsx => src/components/packing/OrderPackChecklist.tsx",
  "src/components/mobile/packer/MobilePackingSheet.tsx => src/components/shipped/PhotoGallery.tsx",
  // Operator ruling 2026-09-15: the /m/print tote preview must render the REAL
  // print HTML, like the location and Unbox previews. That means the shared
  // LabelFacePreview iframe, reached through its per-family wrapper — the same
  // crossing already sanctioned on the line below for the location family.
  // Hand-rolling a second sticker to dodge this edge is expressly forbidden by
  // the label-face law (LabelFacePreview.tsx, operator 2026-08-31).
  "src/components/mobile/print/MobilePrintPreviewStep.tsx => src/components/labels/HandlingUnitLabelFacePreview.tsx",
  "src/components/mobile/print/MobilePrintPreviewStep.tsx => src/components/labels/LocationLabelFacePreview.tsx",
  "src/components/mobile/print/MobilePrintPrinterStep.tsx => src/components/settings/PrintPreferences.tsx",
  "src/components/mobile/print/MobilePrintWorkspace.tsx => src/components/barcode/bin-label-printer/NumericStep.tsx",
  "src/components/mobile/print/MobilePrintWorkspace.tsx => src/components/barcode/label-builder-layout.ts",
  "src/components/mobile/print/MobilePrintWorkspace.tsx => src/components/barcode/rack-printer/rack-printer-config.ts",
  // Operator 2026-09-15: Inventory › Locations › Totes consumes the /m tote
  // printer chrome. Copies is LabelPrintRunNumField, same field as other 2×1
  // printers — do not fork a second stepper.
  "src/components/mobile/print/TotePrintRunFields.tsx => src/components/labels/LabelPrintRunNumField.tsx",
  "src/components/warehouse/TotePlateWorkspace.tsx => src/components/mobile/print/TotePrintRunFields.tsx",
  "src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx => src/components/receiving/workspace/line-edit/InlinePillPicker.tsx",
  "src/components/mobile/receiving/MobileArrivalClassifyFlow.tsx => src/components/receiving/workspace/line-edit/classify-pill-options.tsx",
  "src/components/mobile/receiving/MobileArrivalDetailsSheet.tsx => src/components/receiving/workspace/line-edit/InlinePillPicker.tsx",
  "src/components/mobile/receiving/MobileArrivalDetailsSheet.tsx => src/components/receiving/workspace/line-edit/classify-pill-options.tsx",
  "src/components/mobile/receiving/MobileReceivingList.tsx => src/components/receiving/incoming/IncomingFirstPaint.tsx",
  "src/components/mobile/receiving/MobileReceivingRow.tsx => src/components/receiving/ReceivingIdentityChips.tsx",
  "src/components/mobile/receiving/MobileReceivingRow.tsx => src/components/station/receiving-lines-table-helpers.ts",
  "src/components/mobile/receiving/MobileReceivingUnitRow.tsx => src/components/receiving/ReceivingIdentityChips.tsx",
  "src/components/mobile/receiving/PhotoUploadToaster.tsx => src/components/station/capture-upload/capture-upload-model.ts",
  "src/components/mobile/redesign/MobileSettingsList.tsx => src/components/settings/settings-sections.ts",
  "src/components/mobile/redesign/MobileSidebarDrawer.tsx => src/components/icons/nav-weight.tsx",
  "src/components/mobile/redesign/MobileSidebarDrawer.tsx => src/components/sidebar/sidebar-spine.ts",
  "src/components/mobile/redesign/MobileToShipPickerSheet.tsx => src/components/auth/StaffChoiceRowButton.tsx",
  "src/components/mobile/redesign/MobileToShipPickerSheet.tsx => src/components/tables/compound/staff-stage-lane.ts",
  "src/components/mobile/redesign/MobileToShipQueue.tsx => src/components/work-orders/types.ts",
  // Same edge as the six siblings below — the WorkOrderRow type the to-ship
  // screens map onto the shared ItemCardRow. Moved into to-ship-faces when the
  // faces were extracted out of MobileToShipRow (2026-09-15).
  "src/components/mobile/redesign/to-ship-faces.tsx => src/components/work-orders/types.ts",
  "src/components/mobile/redesign/MobileToShipRow.tsx => src/components/work-orders/types.ts",
  "src/components/mobile/redesign/MobileToShipSheet.tsx => src/components/work-orders/types.ts",
  "src/components/mobile/redesign/ScanInput.tsx => src/components/station/scan-bar/index.ts",
  "src/components/mobile/redesign/useToShipOrders.ts => src/components/work-orders/types.ts",
  "src/components/mobile/scan/location-bind-api.ts => src/components/barcode/bin-label-printer/bin-printer-api.ts",
  "src/components/packer/PackerPageContent.tsx => src/components/mobile/packer/MobilePackingList.tsx",
  "src/components/receiving/workspace/line-edit/PhotoPeekFan.tsx => src/components/mobile/station/MobileSwipePhotoViewer.tsx",
  "src/components/shipped/PhotoGallery.tsx => src/components/mobile/station/MobileSwipePhotoViewer.tsx",
  "src/components/sku/BinStockNumpadSheet.tsx => src/components/mobile/station/MobilePackerSpamCamera.tsx",
  "src/components/station/capture-upload/useCaptureUploadStatus.ts => src/components/mobile/packer/PackerPhotoUploadQueue.ts",
  "src/components/station/capture-upload/useCaptureUploadStatus.ts => src/components/mobile/receiving/PhotoUploadQueue.ts",
  "src/components/station/capture-upload/useCaptureUploadStatus.ts => src/components/mobile/unit/UnitPhotoUploadQueue.ts",
];
