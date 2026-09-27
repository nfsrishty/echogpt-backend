import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    example: 'Explain quantum computing in simple terms',
    maxLength: 32000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32000)
  message: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Continue an existing conversation. Omit to start a new one.',
  })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Provider chosen in the model picker. Omit to use the conversation's last provider, then the default.",
  })
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({
    example: 'gpt-4o-mini',
    description: "Override the provider's default model for this request",
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9._:\-/]{1,100}$/, {
    message: 'model may only contain letters, digits and . _ : - /',
  })
  model?: string;

  @ApiPropertyOptional({
    example: 'Summarize the following web page for the user:\n<page text>',
    description:
      'Per-request instructions or context (e.g. "Read page", "Summarize", "Translate" actions). Not stored.',
    maxLength: 32000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32000)
  systemPrompt?: string;
}
