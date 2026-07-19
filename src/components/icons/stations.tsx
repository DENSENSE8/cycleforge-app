// Station + floor-mode semantic icon wrappers (nav-icon SoT extension).
//
// Product chrome imports these names — not the underlying primitives — so a
// glyph can be swapped without touching sidebar-navigation, mode rails, or mobile
// nav. Each export documents its layer:
//   • Station*     — master-nav STATIONS row + SIDEBAR_PAGE_NAV page icon
//   • *Mode*       — L2 mode pills inside a station
//
// Hard law: every MODE glyph key must be unique across floor stations
// (see MODE_ICON_GLYPH_KEYS in station-nav-icons.ts). Pages may share a glyph
// with their default mode (heavier vs lighter stroke). Primitives stay generic
// for timelines / badges unless aliased here.
//
// Stroke weight: page exports use heavier strokes; mode exports use lighter
// strokes (see icons/nav-weight.tsx).

import { Send } from './actions';
import {
  Barcode,
  Box,
  Boxes,
  Package,
  PackageCheck,
  PackageOpen,
  ShoppingCart,
  Truck,
} from './commerce';
import { ClipboardList, Inbox, Printer } from './media';
import { AlertTriangle, ShieldCheck } from './status';
import { Wrench } from './nav';
import { withNavIconModeStroke, withNavIconPageStroke } from './nav-weight';

type IconComponent = (props: { className?: string }) => JSX.Element;

// ── Station page icons (STATIONS rail) ───────────────────────────────────────

/** Receiving station — default surface `/unbox`. Heavier stroke than Unbox mode. */
export const StationReceiving: IconComponent = withNavIconPageStroke(PackageOpen);

/** Testing / QC station — `/test`. Not repair (Wrench). */
export const StationTesting: IconComponent = withNavIconPageStroke(ShieldCheck);

/** Outbound Shipping station — `/shipping`. Not carrier motion (Truck). */
export const StationShipping: IconComponent = withNavIconPageStroke(PackageCheck);

/** Packing station — `/pack`. */
export const StationPacking: IconComponent = withNavIconPageStroke(Box);

// ── Receiving L2 modes ───────────────────────────────────────────────────────

/** PO queue before dock scan. */
export const ReceivingModeIncoming: IconComponent = withNavIconModeStroke(Inbox);

/**
 * Dock tracking scan (Arrival / triage).
 * Truck = inbound carrier only — never reuse for outbound / tech shipping queue.
 */
export const ReceivingModeArrival: IconComponent = withNavIconModeStroke(Truck);

/** Unbox workspace — carton opened, serial intake. */
export const ReceivingModeUnbox: IconComponent = withNavIconModeStroke(PackageOpen);

/** Front-desk local pickup job on the receiving rail. */
export const ReceivingModePickup: IconComponent = withNavIconModeStroke(ShoppingCart);

/** Repair intake on the receiving rail — Wrench reserved for repair, not Testing. */
export const ReceivingModeRepair: IconComponent = withNavIconModeStroke(Wrench);

// ── Testing L2 modes (tech sidebar top row) ─────────────────────────────────

/** QC bench — unit test verdicts. Lighter stroke than the Testing station page. */
export const TechModeTesting: IconComponent = withNavIconModeStroke(ShieldCheck);

/**
 * Tech-side outbound queue (Pending · FBA).
 * Send = dispatch / leave the bench — distinct from Arrival Truck (inbound).
 */
export const TechModeShippingQueue: IconComponent = withNavIconModeStroke(Send);

// ── Shipping station L2 modes ────────────────────────────────────────────────

/** Label print workspace. */
export const ShippingModeLabels: IconComponent = withNavIconModeStroke(Printer);

/** Ready-to-ship checklist queue. */
export const ShippingModeReady: IconComponent = withNavIconModeStroke(ClipboardList);

/** FBA prep under Shipping — multi-box Amazon prep. */
export const ShippingModeFba: IconComponent = withNavIconModeStroke(Boxes);

/** Scan-out / carrier handoff confirm. */
export const ShippingModeScanOut: IconComponent = withNavIconModeStroke(Barcode);

// ── Packing station L2 modes ─────────────────────────────────────────────────

/** Standard pack bench — same glyph family as the Packing page, lighter stroke. */
export const PackingModeStandard: IconComponent = withNavIconModeStroke(Box);

/** Fragile pack path. */
export const PackingModeFragile: IconComponent = withNavIconModeStroke(AlertTriangle);

/**
 * Multi-item pack path.
 * Package (closed carton), not Boxes — Boxes is reserved for Shipping FBA mode.
 */
export const PackingModeMulti: IconComponent = withNavIconModeStroke(Package);
