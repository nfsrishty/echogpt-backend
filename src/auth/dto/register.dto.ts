import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { StrongPassword } from '../../common/decorators/strong-password.decorator';

export class RegisterDto {
  @ApiProperty({ example: 'sonny@example.com', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: 'StrongPass123',
    minLength: 8,
    maxLength: 72,
    description: 'At least 8 characters, including a letter and a number',
  })
  @StrongPassword()
  password: string;

  @ApiProperty({ example: 'Sonny Rahman', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;
}
