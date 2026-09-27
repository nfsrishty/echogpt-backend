import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiAuth } from '../common/decorators/api-auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import {
  PlanResponseDto,
  SubscriptionResponseDto,
  UsageResponseDto,
} from './dto/subscription-response.dto';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usageService: UsageService,
  ) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'List available plans' })
  @ApiOkResponse({ type: PlanResponseDto, isArray: true })
  listPlans(): Promise<PlanResponseDto[]> {
    return this.subscriptionsService.listPlans();
  }

  @Get('me')
  @ApiAuth()
  @ApiOperation({ summary: 'Get my subscription status' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  getMySubscription(
    @CurrentUser('id') userId: string,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @Patch('me')
  @ApiAuth()
  @ApiOperation({
    summary: 'Upgrade or downgrade my plan',
    description:
      'Switches between FREE and PREMIUM. Upgrading starts a 30-day Premium period (payment is out of scope for this assignment).',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid tier, or already on that plan',
  })
  changePlan(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePlanDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.changePlan(userId, dto.tier);
  }

  @Get('me/usage')
  @ApiAuth()
  @ApiOperation({
    summary: 'Get my usage and remaining requests for today',
    description:
      'Counts successful AI chat and web search requests since 00:00 UTC.',
  })
  @ApiOkResponse({ type: UsageResponseDto })
  getMyUsage(@CurrentUser('id') userId: string): Promise<UsageResponseDto> {
    return this.usageService.getUsage(userId);
  }
}
