'use client';

/**
 * Display-only beam readout of the last hovered entity tile.
 *
 * Same three-zone face as station CartonContextCard:
 *   Left   — order # · tracking
 *   Middle — priority · platform · type (absolutely centered, catalog color)
 *   Right  — price · listing · claim · photos
 *
 * Icons and numbers — no classify pickers, menus, or write handlers.
 */

import type { CSSProperties, ReactNode } from 'react';
import { getLast8 } from '@/lib/copy-chip-format';
import {
  platformMetaBrandDot,
  platformMetaIconTone,
  sourcePlatformMetaFromLabel,
} from '@/lib/source-platform';
import { Icon, type IconName } from '@/shell/icons';
import type { HeaderEntity } from '@/shell/header-entity';
import { cn } from '@/utils/_cn';

function money(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function typeMark(type: string | null): 'ok' | 'warn' | 'err' | 'info' {
  const t = (type ?? '').toLowerCase();
  if (/cancel|fail|error|void|return/.test(t)) return 'err';
  if (/pend|unship|hold|await|open/.test(t)) return 'warn';
  if (/ship|complete|done|deliver|paid/.test(t)) return 'ok';
  return 'info';
}

function Slot({
  icon,
  children,
  href,
  title,
  tone,
  className,
  style,
}: {
  icon?: IconName;
  children?: ReactNode;
  href?: string | null;
  title: string;
  tone?: 'tracking' | 'price' | 'claim' | 'photos' | 'danger' | 'muted';
  className?: string;
  style?: CSSProperties;
}) {
  const inner = (
    <>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children != null && children !== '' ? (
        <span className="header-entity-value">{children}</span>
      ) : null}
    </>
  );
  const cls = cn('header-entity-slot', tone && `tone-${tone}`, className);
  if (href) {
    return (
      <a className={cls} href={href} style={style} target="_blank" rel="noreferrer" title={title}>
        {inner}
      </a>
    );
  }
  return (
    <span className={cls} style={style} title={title}>
      {inner}
    </span>
  );
}

function ClassifyPill({
  label,
  title,
  mark,
  className,
  style,
  dotClassName,
  dotStyle,
}: {
  label: string;
  title: string;
  mark?: 'ok' | 'warn' | 'err' | 'info';
  className?: string;
  style?: CSSProperties;
  dotClassName?: string;
  dotStyle?: CSSProperties;
}) {
  return (
    <span className={cn('header-entity-pill', className)} style={style} title={title}>
      <span
        className={cn('header-entity-dot', mark && `status-dot ${mark}`, dotClassName)}
        style={dotStyle}
        aria-hidden
      />
      <span className="header-entity-pill-label">{label}</span>
    </span>
  );
}

export function HeaderEntityReadout({ entity }: { entity: HeaderEntity | null }) {
  if (!entity) return <div className="header-spacer" />;

  const platformMeta = entity.platform
    ? sourcePlatformMetaFromLabel(entity.platform)
    : null;
  const platformKnown = Boolean(platformMeta && platformMeta.label !== 'Unknown');
  const platformTone = platformKnown && platformMeta ? platformMetaIconTone(platformMeta) : null;
  const platformDot = platformKnown && platformMeta ? platformMetaBrandDot(platformMeta) : null;
  const platformLabel = platformKnown && platformMeta ? platformMeta.label : null;

  return (
    <div className="header-entity" data-header-entity={entity.kind} data-tile={entity.tileId}>
      <div className="header-entity-middle" data-header-zone="classify">
        <ClassifyPill
          title="Priority"
          label={entity.urgent ? 'Urgent' : 'Normal'}
          mark={entity.urgent ? 'err' : 'ok'}
          className={entity.urgent ? 'tone-danger' : undefined}
        />
        {platformLabel ? (
          <ClassifyPill
            title={platformLabel}
            label={platformLabel}
            className={platformTone?.className}
            style={platformTone?.style}
            dotClassName={platformDot?.className}
            dotStyle={platformDot?.style}
          />
        ) : null}
        {entity.type ? (
          <ClassifyPill title="Type" label={entity.type} mark={typeMark(entity.type)} />
        ) : null}
      </div>

      <div className="header-entity-left" data-header-zone="identity">
        {/* Q4: the order # renders by its LAST 8, same as every typed id
            face — the full number stays on the title. */}
        <Slot
          title={entity.orderNumber}
          className={platformTone?.className}
          style={platformTone?.style}
        >
          {`#${getLast8(entity.orderNumber)}`}
        </Slot>
        <Slot icon="box" title={entity.tracking ?? 'Tracking'} tone="tracking">
          {entity.tracking ? getLast8(entity.tracking) : '—'}
        </Slot>
      </div>

      <div className="header-entity-right" data-header-zone="actions">
        <Slot icon="calc" title="Price" tone={entity.price != null ? 'price' : 'muted'}>
          {entity.price != null ? money(entity.price) : '—'}
        </Slot>
        <Slot
          icon="file"
          href={entity.listingHref}
          title="Listing"
          className={entity.listingHref ? platformTone?.className : undefined}
          style={entity.listingHref ? platformTone?.style : undefined}
          tone={entity.listingHref ? undefined : 'muted'}
        >
          {platformLabel}
        </Slot>
        <Slot icon="info" title="Claims" tone={entity.claimCount ? 'claim' : 'muted'}>
          {entity.claimCount != null && entity.claimCount > 0 ? entity.claimCount : null}
        </Slot>
        <Slot icon="image" title="Photos" tone={entity.photoCount ? 'photos' : 'muted'}>
          {entity.photoCount != null && entity.photoCount > 0 ? entity.photoCount : null}
        </Slot>
      </div>
    </div>
  );
}
