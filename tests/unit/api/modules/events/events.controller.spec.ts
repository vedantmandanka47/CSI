import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { EventsController } from '../../../../../apps/api/src/modules/events/events.controller.js';
import { EventsService } from '../../../../../apps/api/src/modules/events/events.service.js';
import { VenuesService } from '../../../../../apps/api/src/modules/venues/venues.service.js';
import { RateLimiterService } from '../../../../../apps/api/src/common/services/rate-limiter.service.js';
import { DenyByDefaultGuard } from '../../../../../apps/api/src/common/guards/deny-by-default.guard.js';
import { IS_AUTHENTICATED_KEY } from '../../../../../apps/api/src/common/decorators/authenticated.decorator.js';
import { RoleCode, UserStatus, CurrentUser } from '@csi/shared';

describe('EventsController Route Authorization (TASK-002 / B02 / F05)', () => {
  let controller: EventsController;
  let mockEventsService: Partial<EventsService>;
  let mockVenuesService: Partial<VenuesService>;
  let mockRateLimiter: Partial<RateLimiterService>;
  let guard: DenyByDefaultGuard;
  let reflector: Reflector;

  const sampleUser: CurrentUser = {
    id: 'user-member-1',
    email: 'member@gcet.ac.in',
    name: 'Member Name',
    full_name: 'Member Name',
    status: UserStatus.ACTIVE,
    roles: [RoleCode.MEMBER],
    permissions: [],
  };

  beforeEach(() => {
    mockEventsService = {
      registerMember: jest.fn().mockResolvedValue({
        id: 'reg-1',
        event_id: 'event-1',
        user_id: 'user-member-1',
        status: 'registered',
        waitlist_position: null,
        created_at: new Date().toISOString(),
      }),
      cancelRegistration: jest.fn().mockResolvedValue({
        message: 'Registration cancelled successfully',
      }),
    };

    mockVenuesService = {};
    mockRateLimiter = {
      assertLimit: jest.fn(),
    };

    controller = new EventsController(
      mockEventsService as EventsService,
      mockVenuesService as VenuesService,
      mockRateLimiter as RateLimiterService,
    );

    reflector = new Reflector();
    guard = new DenyByDefaultGuard(reflector);
  });

  describe('Route Metadata Verification', () => {
    it('decorates POST :id/register with @Authenticated()', () => {
      const isAuth = reflector.get<boolean>(
        IS_AUTHENTICATED_KEY,
        EventsController.prototype.registerMember,
      );
      expect(isAuth).toBe(true);
    });

    it('decorates POST :id/cancel with @Authenticated()', () => {
      const isAuth = reflector.get<boolean>(
        IS_AUTHENTICATED_KEY,
        EventsController.prototype.cancelRegistration,
      );
      expect(isAuth).toBe(true);
    });
  });

  describe('DenyByDefaultGuard Integration for Member Actions', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    function createMockContext(handler: Function, user?: unknown): ExecutionContext {
      return {
        getHandler: () => handler,
        getClass: () => EventsController,
        switchToHttp: () => ({
          getRequest: () => ({ user }),
        }),
      } as unknown as ExecutionContext;
    }

    it('permits authenticated member to access registerMember route', () => {
      const context = createMockContext(
        EventsController.prototype.registerMember,
        sampleUser,
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects unauthenticated caller on registerMember with 401 Unauthorized', () => {
      const context = createMockContext(
        EventsController.prototype.registerMember,
        undefined,
      );
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('permits authenticated member to access cancelRegistration route', () => {
      const context = createMockContext(
        EventsController.prototype.cancelRegistration,
        sampleUser,
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('rejects unauthenticated caller on cancelRegistration with 401 Unauthorized', () => {
      const context = createMockContext(
        EventsController.prototype.cancelRegistration,
        undefined,
      );
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('Controller Execution Delegation', () => {
    it('delegates member registration to EventsService and asserts rate limit', async () => {
      const response = await controller.registerMember(
        'event-1',
        sampleUser,
        { notes: 'Attending with laptop' },
      );

      expect(mockRateLimiter.assertLimit).toHaveBeenCalledWith(
        'register-user:user-member-1',
        20,
        60000,
      );
      expect(mockEventsService.registerMember).toHaveBeenCalledWith(
        'event-1',
        'user-member-1',
        'Attending with laptop',
      );
      expect(response.data.id).toBe('reg-1');
    });

    it('delegates registration cancellation to EventsService', async () => {
      const response = await controller.cancelRegistration('event-1', sampleUser);

      expect(mockEventsService.cancelRegistration).toHaveBeenCalledWith(
        'event-1',
        'user-member-1',
      );
      expect(response.message).toBe('Registration cancelled successfully');
    });
  });
});
