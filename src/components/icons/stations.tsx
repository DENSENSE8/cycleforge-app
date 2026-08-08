// Station + floor-mode semantic icon wrappers (nav-icon SoT extension).
//
// Product chrome imports these names — not the underlying primitives — so a
// glyph can be swapped without touching sidebar-navigation, mode rails, or mobile
// nav. Each export documents its layer:
//   • Station*     — data/SoT page icon (MasterNav L1 + SIDEBAR_PAGE_NAV)
//   • *Mode*       — L2 mode chrome (rails, dropdowns, MRU, header “now”)
//
// Hard law: every MODE glyph key must be unique across floor stations
// (see STATION_GLYPH_KEYS in station-nav-icons.ts). Pages may share a glyph
// with their default mode. Primitives stay generic for timelines / badges
// unless aliased here.
//
// Stroke weight (nav-weight.tsx): page lighter; mode heavier.

import {
  Barcode,
  Box,
  Boxes,
  Package,
  PackageCheck,
  PackageOpen,
  Receipt,
  ShoppingCart,
  Truck,
} from './commerce';
import { ClipboardList, Inbox, Printer } from './media';
import { AlertTriangle, ShieldCheck } from './status';
import { DoorOpen, Wrench } from './nav';
import { withNavIconModeStroke, withNavIconPageStroke } from './nav-weight';

type IconComponent = (props: { className?: string }) => JSX.Element;

// ── Station page icons (data / rare non-chrome) ──────────────────────────────

/** Receiving station — default surface `/unbox`. Not rendered in MasterNav L1. */
export const StationReceiving: IconComponent = withNavIconPageStroke(PackageOpen);

/**
 * Walk-In station subgroup — Local Pickup · Repair (front-desk counter).
 * DoorOpen ≠ ShoppingCart (pickup leaf) ≠ Wrench (repair leaf / Testing page).
 */
export const StationWalkIn: IconComponent = withNavIconPageStroke(DoorOpen);

/** Testing / QC station — `/test`. Bench repair/tooling (Wrench), not warranty shield. */
export const StationTesting: IconComponent = withNavIconPageStroke(Wrench);

/** Outbound Shipping station — `/shipping`. Truck = leave-the-building carrier. */
export const StationShipping: IconComponent = withNavIconPageStroke(Truck);

/** Packing station — `/pack`. Plain Box (same family as PackingModeStandard). */
export const StationPacking: IconComponent = withNavIconPageStroke(Box);

// ── Sales mode mark ──────────────────────────────────────────────────────────

/** Sales mode / sale-line price mark — same Receipt as CHIP_TONES.price. */
export const SalesPrice: IconComponent = withNavIconModeStroke(Receipt);

// ── Receiving L2 modes (chrome — modes own icons) ────────────────────────────

/** PO queue before dock scan. */
export const ReceivingModeIncoming: IconComponent = withNavIconModeStroke(Inbox);

/**
 * Dock tracking scan (Arrival / triage).
 * Truck = inbound carrier only — never reuse for outbound / Ready to Pack.
 */
export const ReceivingModeArrival: IconComponent = withNavIconModeStroke(Truck);

/** Unbox workspace — carton opened, serial intake. */
export const ReceivingModeUnbox: IconComponent = withNavIconModeStroke(PackageOpen);

/** Front-desk local pickup job on the Walk-In rail. */
export const ReceivingModePickup: IconComponent = withNavIconModeStroke(ShoppingCart);

/** Repair intake on the Walk-In rail — Wrench reserved for repair, not Testing. */
export const ReceivingModeRepair: IconComponent = withNavIconModeStroke(Wrench);

// ── Testing L2 modes (tech sidebar top row) ─────────────────────────────────

/** QC mode — unit test verdicts. Heavier stroke than the Testing page data icon. */
export const TechModeTesting: IconComponent = withNavIconModeStroke(ShieldCheck);

/**
 * Tech Ready to Pack queue (Pending · FBA) — package cleared for packers.
 * PackageCheck ≠ Packing Box, ≠ Arrival Truck, ≠ Shipping ClipboardList.
 */
export const TechModeShippingQueue: IconComponent = withNavIconModeStroke(PackageCheck);

// ── Shipping station L2 modes ────────────────────────────────────────────────

/** Label print workspace. */
export const ShippingModeLabels: IconComponent = withNavIconModeStroke(Printer);

/** Ready-to-ship checklist queue. */
export const ShippingModeReady: IconComponent = withNavIconModeStroke(ClipboardList);

/** Amazon Prep under Shipping — multi-box Amazon prep. */
export const ShippingModeFba: IconComponent = withNavIconModeStroke(Boxes);

/** Scan-out / carrier handoff confirm. */
export const ShippingModeScanOut: IconComponent = withNavIconModeStroke(Barcode);

// ── Packing station L2 modes ─────────────────────────────────────────────────

/** Standard pack bench — same glyph family as the Packing page data icon, mode stroke. */
export const PackingModeStandard: IconComponent = withNavIconModeStroke(Box);

/** Fragile pack path. */
export const PackingModeFragile: IconComponent = withNavIconModeStroke(AlertTriangle);

/**
 * Multi-item pack path.
 * Package (closed carton), not Boxes — Boxes is reserved for Shipping FBA mode.
 */
export const PackingModeMulti: IconComponent = withNavIconModeStroke(Package);
