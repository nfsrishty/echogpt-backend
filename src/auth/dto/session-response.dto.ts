import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Chrome on Windows' })
  device: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
  })
  userAgent: string | null;

  @ApiProperty({ type: String, nullable: true, example: '203.0.113.7' })
  ipAddress: string | null;

  @ApiProperty({ description: 'When this device logged in' })
  createdAt: Date;

  @ApiProperty({ description: 'Last token refresh on this device' })
  lastActiveAt: Date;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({
    example: true,
    description: 'The session making this request',
  })
  current: boolean;
}
