import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'StrongPass123',
    description: 'Current password, required to confirm deletion',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
