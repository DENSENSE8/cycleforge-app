/** `ops_events.event_type` values for movable racks (entity_type `location`). Pure. */
export const RACK_EVENT = {
  created: 'location.rack.created',
  deleted: 'location.rack.deleted',
  moved: 'location.rack.moved',
  shelvesEdited: 'location.rack.shelves_edited',
  adopted: 'location.rack.adopted',
  labelsPrinted: 'location.labels.printed',
} as const;

export type RackEventType = (typeof RACK_EVENT)[keyof typeof RACK_EVENT];
