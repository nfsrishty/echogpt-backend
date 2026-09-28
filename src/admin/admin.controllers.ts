import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PlanTier, RoleName } from '@prisma/client';
import { ApiAuth } from '../common/decorators/api-auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { AdminSystemService } from './admin-system.service';
import { AdminUsersService } from './admin-users.service';
import {
  ChangeRoleDto,
  SetUserPlanDto,
  UpdatePlanDto,
} from './dto/admin-command.dto';
import {
  AdminSubscriptionListQueryDto,
  AdminUserListQueryDto,
  AnalyticsQueryDto,
  RequestLogQueryDto,
} from './dto/admin-query.dto';
import {
  AdminPlanDto,
  AdminSubscriptionDto,
  AdminSubscriptionListResponseDto,
  AdminUserDetailDto,
  AdminUserListResponseDto,
  CleanupResponseDto,
  DashboardResponseDto,
  RequestLogListResponseDto,
  SystemHealthResponseDto,
  UsageAnalyticsResponseDto,
} from './dto/admin-response.dto';

/** Applied to every admin controller: Bearer token + ADMIN role. */
const AdminOnly = () =>
  applyDecorators(
    Roles(RoleName.ADMIN),
    ApiAuth(),
    ApiForbiddenResponse({
      type: ErrorResponseDto,
      description: 'Admin role required',
    }),
  );

// ---------------------------------------------------------------------------

@ApiTags('Admin · Dashboard & Analytics')
@AdminOnly()
@Controller('admin')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard statistics: users, plans, activity, providers',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  dashboard(): Promise<DashboardResponseDto> {
    return this.analytics.dashboard();
  }

  @Get('analytics/usage')
  @ApiOperation({
    summary: 'API usage analytics over the last N days',
    description:
      'Daily series (zero-filled), totals, usage per AI provider, top endpoints (IDs grouped as :id) and top users.',
  })
  @ApiOkResponse({ type: UsageAnalyticsResponseDto })
  usage(@Query() query: AnalyticsQueryDto): Promise<UsageAnalyticsResponseDto> {
    return this.analytics.usage(query.days);
  }

  @Get('logs')
  @ApiOperation({
    summary: 'Request logs (newest first)',
    description:
      'Every API request is logged, including rejected ones (401, 403, 429). Filter with the query parameters.',
  })
  @ApiOkResponse({ type: RequestLogListResponseDto })
  logs(@Query() query: RequestLogQueryDto): Promise<RequestLogListResponseDto> {
    return this.analytics.logs(query);
  }
}

// ---------------------------------------------------------------------------

@ApiTags('Admin · Users')
@AdminOnly()
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly subscriptions: AdminSubscriptionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List and search users' })
  @ApiOkResponse({ type: AdminUserListResponseDto })
  list(
    @Query() query: AdminUserListQueryDto,
  ): Promise<AdminUserListResponseDto> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: "User details, subscription, today's usage and activity stats",
  })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.users.detail(id);
  }

  @Patch(':id/role')
  @ApiOperation({
    summary: "Change a user's role",
    description:
      "Applies on the user's next request. You cannot change your own role or demote the last admin.",
  })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Own role, same role, or last admin',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  changeRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<AdminUserDetailDto> {
    return this.users.changeRole(actor, id, dto.role);
  }

  @Patch(':id/subscription')
  @ApiBody({
    type: SetUserPlanDto,
    examples: {
      grantPremium: {
        summary: 'Grant Premium for 30 days',
        value: { tier: 'PREMIUM', periodDays: 30 },
      },
      downgrade: { summary: 'Move to Free', value: { tier: 'FREE' } },
    },
  })
  @ApiOperation({
    summary: "Grant, extend or remove a user's plan",
    description:
      'Setting the same paid tier again restarts the period (e.g. extending a trial).',
  })
  @ApiOkResponse({ type: AdminSubscriptionDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Plan inactive or invalid',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  setPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserPlanDto,
  ): Promise<AdminSubscriptionDto> {
    return this.subscriptions.setUserPlan(id, dto);
  }

  @Post(':id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force-logout a user from every device' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async revokeSessions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageResponseDto> {
    const count = await this.users.revokeSessions(id);
    return { message: `Revoked ${count} session(s)` };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a user and all their data',
    description:
      'Usage logs are kept, anonymized. You cannot delete yourself here, or the last admin.',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Yourself, or the last admin',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.remove(actor, id);
  }
}

// ---------------------------------------------------------------------------

@ApiTags('Admin · Subscriptions')
@AdminOnly()
@Controller('admin')
export class AdminSubscriptionsController {
  constructor(private readonly subscriptions: AdminSubscriptionsService) {}

  @Get('subscriptions')
  @ApiOperation({ summary: 'List subscriptions (filter by tier/status)' })
  @ApiOkResponse({ type: AdminSubscriptionListResponseDto })
  list(
    @Query() query: AdminSubscriptionListQueryDto,
  ): Promise<AdminSubscriptionListResponseDto> {
    return this.subscriptions.list(query);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all plans, including inactive ones' })
  @ApiOkResponse({ type: AdminPlanDto, isArray: true })
  listPlans(): Promise<AdminPlanDto[]> {
    return this.subscriptions.listPlans();
  }

  @Patch('plans/:tier')
  @ApiParam({ name: 'tier', enum: PlanTier })
  @ApiBody({
    type: UpdatePlanDto,
    examples: {
      raiseLimit: {
        summary: 'Change the daily request limit',
        value: { dailyRequestLimit: 1000 },
      },
      changePrice: {
        summary: 'Change the monthly price (cents)',
        value: { priceCents: 1499 },
      },
      deactivate: {
        summary: 'Stop offering the plan (not allowed for FREE)',
        value: { isActive: false },
      },
    },
  })
  @ApiOperation({
    summary: 'Edit a plan (limit, price, name, active)',
    description:
      'A new daily limit applies to every subscriber immediately. FREE cannot be deactivated.',
  })
  @ApiOkResponse({ type: AdminPlanDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid values, or deactivating FREE',
  })
  updatePlan(
    @Param('tier', new ParseEnumPipe(PlanTier)) tier: PlanTier,
    @Body() dto: UpdatePlanDto,
  ): Promise<AdminPlanDto> {
    return this.subscriptions.updatePlan(tier, dto);
  }
}

// ---------------------------------------------------------------------------

@ApiTags('Admin · System')
@AdminOnly()
@Controller('admin/system')
export class AdminSystemController {
  constructor(private readonly system: AdminSystemService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Detailed system health',
    description:
      'Database latency, memory, uptime, version and the stored health of AI providers. For live provider checks use GET /providers/health.',
  })
  @ApiOkResponse({ type: SystemHealthResponseDto })
  health(): Promise<SystemHealthResponseDto> {
    return this.system.health();
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete expired sessions, verification tokens and cache entries',
  })
  @ApiOkResponse({ type: CleanupResponseDto })
  cleanup(): Promise<CleanupResponseDto> {
    return this.system.cleanup();
  }
}
