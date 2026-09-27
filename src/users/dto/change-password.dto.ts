import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { StrongPassword } from '../../common/decorators/strong-password.decorator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'StrongPass123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({
    example: 'EvenStronger456',
    minLength: 8,
    maxLength: 72,
    description: 'At least 8 characters, including a letter and a number',
  })
  @StrongPassword()
  newPassword: string;
}
