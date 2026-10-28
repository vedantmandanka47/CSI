import { EventState } from '../enums/domain.enum.js';

export const VALID_EVENT_TRANSITIONS: Readonly<Record<EventState, ReadonlyArray<EventState>>> = {
  [EventState.DRAFT]: [EventState.PUBLISHED, EventState.CANCELLED],
  [EventState.PUBLISHED]: [EventState.REGISTRATION_OPEN, EventState.CANCELLED],
  [EventState.REGISTRATION_OPEN]: [EventState.LIVE, EventState.CANCELLED],
  [EventState.LIVE]: [EventState.COMPLETED, EventState.CANCELLED],
  [EventState.COMPLETED]: [EventState.CERTIFIED],
  [EventState.CERTIFIED]: [],
  [EventState.CANCELLED]: [],
};

export function canTransitionEvent(from: EventState, to: EventState): boolean {
  return VALID_EVENT_TRANSITIONS[from]?.includes(to) ?? false;
}
