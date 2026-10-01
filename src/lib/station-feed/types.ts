export const STATION_FEED_JOBS = [
  'identify',
  'arrival',
  'unbox',
  'pick',
  'quality_control',
  'pack',
  'scan_out',
] as const;
export type StationFeedJob = (typeof STATION_FEED_JOBS)[number];

export const STATION_FEED_OUTCOMES = ['identified', 'committed', 'needs_attention'] as const;
export type StationFeedOutcome = (typeof STATION_FEED_OUTCOMES)[number];

export const STATION_FEED_SORTS = ['newest', 'oldest'] as const;
export type StationFeedSort = (typeof STATION_FEED_SORTS)[number];

export interface StationFeedFilters {
  staffIds: number[];
  jobs: StationFeedJob[];
  outcomes: StationFeedOutcome[];
  /** Inclusive instant. A YYYY-MM-DD input is normalized to warehouse-day start. */
  from: string | null;
  /** Exclusive instant. A YYYY-MM-DD input is normalized to the next warehouse-day start. */
  to: string | null;
  sort: StationFeedSort;
}

export interface StationFeedQuery extends StationFeedFilters {
  limit: number;
  before: string | null;
  afterSalId: number | null;
  afterMobileScanId: number | null;
  afterOpsEventId: number | null;
}

export interface StationFeedActor {
  staffId: number;
  name: string;
  avatarPhotoId: number | null;
}

export interface StationFeedContext {
  origin: 'phone';
  surface: string;
  station: string | null;
  workflowNodeId: string | null;
}

export interface StationFeedSubject {
  entityType: 'scan' | 'receiving' | 'order' | 'unit' | 'shipment';
  id: string;
  title: string;
  identifier: string | null;
  imageUrl: string | null;
  status: string | null;
  href: string | null;
}

export type StationFeedSource = 'station_activity_log' | 'ops_event' | 'mobile_scan_event';

export function stationFeedSourceRank(source: StationFeedSource): 0 | 1 | 2 {
  if (source === 'station_activity_log') return 0;
  if (source === 'ops_event') return 1;
  return 2;
}

export interface StationFeedItem {
  id: `sal:${number}` | `ops:${number}` | `mse:${number}`;
  source: StationFeedSource;
  sourceId: number;
  occurredAt: string;
  job: StationFeedJob;
  outcome: StationFeedOutcome;
  actor: StationFeedActor;
  context: StationFeedContext;
  subject: StationFeedSubject;
  message: string;
}

export interface StationFeedWatermark {
  stationActivityId: number;
  opsEventId: number;
  mobileScanEventId: number;
}

export interface StationFeedResponse {
  items: StationFeedItem[];
  watermark: StationFeedWatermark;
  nextBefore: string | null;
}

export const STATION_FEED_DEFAULT_LIMIT = 40;
export const STATION_FEED_MAX_LIMIT = 100;

export const DEFAULT_STATION_FEED_FILTERS: StationFeedFilters = {
  staffIds: [],
  jobs: [],
  outcomes: [],
  from: null,
  to: null,
  sort: 'newest',
};
