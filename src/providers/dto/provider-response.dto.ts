import { ApiProperty } from '@nestjs/swagger';
import { ProviderHealthStatus, ProviderType } from '@prisma/client';

/** What regular users see: enough to render the model picker. */
export class AvailableProviderDto {
  @ApiProperty({
    example: '8d0f7a52-4b1e-4c3a-9f7e-2a6b5c4d3e21',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ example: 'GPT-4o' })
  name: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.OPENAI })
  type: ProviderType;

  @ApiProperty({ example: 'gpt-4o' })
  defaultModel: string;

  @ApiProperty({ example: true })
  isDefault: boolean;
}

/** What admins see. The API key is only ever shown masked. */
export class ProviderResponseDto extends AvailableProviderDto {
  @ApiProperty({ type: String, nullable: true, example: null })
  baseUrl: string | null;

  @ApiProperty({ example: '••••a1B2', description: 'Masked API key' })
  apiKeyMasked: string;

  @ApiProperty({ example: true })
  isEnabled: boolean;

  @ApiProperty({
    enum: ProviderHealthStatus,
    example: ProviderHealthStatus.HEALTHY,
  })
  healthStatus: ProviderHealthStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastHealthCheck: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ProviderHealthDto {
  @ApiProperty({ format: 'uuid' })
  providerId: string;

  @ApiProperty({ example: 'GPT-4o' })
  name: string;

  @ApiProperty({
    enum: ProviderHealthStatus,
    example: ProviderHealthStatus.HEALTHY,
  })
  status: ProviderHealthStatus;

  @ApiProperty({ example: 212 })
  latencyMs: number;

  @ApiProperty()
  checkedAt: Date;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Why the check failed, e.g. "HTTP 401" or "Timed out"',
  })
  error: string | null;
}
