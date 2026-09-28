import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class UserProfileResponseDto {
  @ApiProperty({
    example: '3f1c2b9e-8a4d-4f6e-9b2a-1c3d5e7f9a0b',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ example: 'Jane Doe' })
  fullName: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://example.com/avatar.png',
  })
  avatarUrl: string | null;

  @ApiProperty({ enum: RoleName, example: RoleName.USER })
  role: RoleName;

  @ApiProperty({ example: true })
  isEmailVerified: boolean;

  @ApiProperty({ example: '2026-09-27T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-27T10:00:00.000Z' })
  updatedAt: Date;
}
