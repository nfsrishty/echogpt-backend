import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ChatAction } from '../prompt-builder';

export class PageContextDto {
  @ApiPropertyOptional({ example: 'https://example.com/article' })
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ example: 'How solid-state batteries work' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({
    description:
      'Visible text of the page. Only the first 30,000 characters are used. Never stored.',
    example:
      'Solid-state batteries replace the liquid electrolyte with a solid...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300_000)
  content?: string;

  @ApiPropertyOptional({
    description:
      'Text the user selected. Only the first 5,000 characters are used. Never stored.',
    example: 'sulfide electrolytes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  selection?: string;
}

export class SendMessageDto {
  @ApiPropertyOptional({
    example: 'Explain quantum computing in simple terms',
    maxLength: 32000,
    description:
      'Required for plain chat. Optional with SUMMARIZE_PAGE / EXPLAIN_SELECTION (a default like "Summarize this page" is used).',
  })
  @ValidateIf(
    (dto: SendMessageDto) =>
      dto.message !== undefined ||
      !dto.action ||
      dto.action === ChatAction.CHAT,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(32000)
  message?: string;

  @ApiPropertyOptional({
    enum: ChatAction,
    default: ChatAction.CHAT,
    description:
      'Page tools from the extension. SUMMARIZE_PAGE needs pageContext.content; EXPLAIN_SELECTION needs pageContext.selection.',
  })
  @IsOptional()
  @IsEnum(ChatAction)
  action?: ChatAction;

  @ApiPropertyOptional({
    type: PageContextDto,
    description:
      'Web page the user is viewing. Used only for this request, never stored.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PageContextDto)
  pageContext?: PageContextDto;

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
    example: 'Answer in Bangla.',
    description: 'Extra per-request instructions. Not stored.',
    maxLength: 32000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32000)
  systemPrompt?: string;
}

export class CompareMessageDto {
  @ApiProperty({
    example: 'What is the capital of Australia? One sentence.',
    maxLength: 32000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32000)
  message: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 2,
    maxItems: 3,
    description:
      '2 or 3 different enabled providers (ids from GET /providers/available)',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  providerIds: string[];

  @ApiPropertyOptional({ example: 'Answer in one sentence.', maxLength: 32000 })
  @IsOptional()
  @IsString()
  @MaxLength(32000)
  systemPrompt?: string;
}
