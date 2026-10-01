/**
 * The status icon for any {@link RecordStateFace} — one glyph per `icon`
 * name across every family's state vocabulary (orders' lifecycle, inbound
 * delivery, receiving lifecycle), so a RecordCard adapter never picks icons.
 */

import type { ComponentType } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  CircleDot,
  CirclePause,
  Clock,
  Hash,
  Inbox,
  Lock,
  MapPin,
  Package,
  PackageCheck,
  PackageOpen,
  PackageX,
  Ticket,
  Truck,
  Unlink,
} from '@/components/Icons';
import type { RecordStateFace } from '@/design-system/tokens/record';

type Glyph = ComponentType<{ className?: string }>;

const STATE_GLYPH: Readonly<Record<string, Glyph>> = {
  'alarm-clock': AlarmClock,
  'circle-dot': CircleDot,
  'circle-pause': CirclePause,
  clock: Clock,
  hash: Hash,
  inbox: Inbox,
  lock: Lock,
  'map-pin': MapPin,
  package: Package,
  'package-check': PackageCheck,
  'package-open': PackageOpen,
  'package-x': PackageX,
  'triangle-alert': AlertTriangle,
  truck: Truck,
  ticket: Ticket,
  unlink: Unlink,
};

/** The face's glyph; an icon name nobody mapped yet paints the neutral dot. */
export function recordStateGlyph(face: Pick<RecordStateFace, 'icon'>): Glyph {
  return STATE_GLYPH[face.icon] ?? CircleDot;
}
