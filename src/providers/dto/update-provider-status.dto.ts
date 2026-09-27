import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateProviderStatusDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isEnabled: boolean;
}
