import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProviderDto {
  @ApiProperty({ example: 'GPT-4o', description: 'Unique display name' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.OPENAI })
  @IsEnum(ProviderType)
  type: ProviderType;

  @ApiProperty({
    example: 'gpt-4o',
    description:
      'Model identifier sent to the provider, e.g. gpt-4o, claude-sonnet-4-5, gemini-2.5-flash',
  })
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9._:\-/]{1,100}$/, {
    message: 'defaultModel may only contain letters, digits and . _ : - /',
  })
  defaultModel: string;

  @ApiProperty({
    example: 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'Stored encrypted (AES-256-GCM). Never returned by the API.',
    writeOnly: true,
  })
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  apiKey: string;

  @ApiPropertyOptional({
    description:
      'Leave empty for the official API. Only set this for a proxy/gateway, and it must speak the SAME protocol as `type` (e.g. an OpenAI-compatible URL for OPENAI).',
  })
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(300)
  baseUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Make this the default provider. The first enabled provider becomes default automatically.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
