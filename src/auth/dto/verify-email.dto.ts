import { ApiProperty } from '@nestjs/swagger';
import { IsHexadecimal, Length } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'The 64-character token sent to the user by email',
    example: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  })
  @IsHexadecimal()
  @Length(64, 64)
  token: string;
}
