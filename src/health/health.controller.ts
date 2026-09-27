import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminSystemService } from '../admin/admin-system.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * Public liveness/readiness probe for Docker, load balancers and uptime
 * monitors. Reveals nothing beyond "up or down".
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly system: AdminSystemService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Public health probe (API + database)' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        database: 'up',
        timestamp: '2026-09-28T10:00:00.000Z',
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  async check(): Promise<{
    status: string;
    database: string;
    timestamp: Date;
  }> {
    const database = await this.system.pingDatabase();
    if (database.status === 'down') {
      throw new ServiceUnavailableException('Database unreachable');
    }

    return { status: 'ok', database: 'up', timestamp: new Date() };
  }
}
