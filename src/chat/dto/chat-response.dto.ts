import { ApiProperty } from '@nestjs/swagger';
import { MessageRole, ProviderType } from '@prisma/client';
import { PaginationMetaDto } from '../../common/dto/pagination.dto';

export class ProviderRefDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'GPT-4o' })
  name: string;

  @ApiProperty({ enum: ProviderType, example: ProviderType.OPENAI })
  type: ProviderType;
}

export class ChatMessageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: MessageRole, example: MessageRole.ASSISTANT })
  role: MessageRole;

  @ApiProperty({ example: 'Quantum computers use qubits, which...' })
  content: string;

  @ApiProperty({ type: String, nullable: true, example: 'gpt-4o' })
  model: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  providerId: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 42 })
  promptTokens: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 180 })
  completionTokens: number | null;

  @ApiProperty()
  createdAt: Date;
}

/** Same shape as ChatMessageDto; separate class only so Swagger shows a USER example. */
export class UserChatMessageDto extends ChatMessageDto {
  @ApiProperty({ enum: MessageRole, example: MessageRole.USER })
  declare role: MessageRole;

  @ApiProperty({ example: 'Explain quantum computing in simple terms' })
  declare content: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  declare model: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'uuid', example: null })
  declare providerId: string | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  declare promptTokens: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  declare completionTokens: number | null;
}

export class SendMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  conversationId: string;

  @ApiProperty({ type: ProviderRefDto })
  provider: ProviderRefDto;

  @ApiProperty({ type: UserChatMessageDto })
  userMessage: ChatMessageDto;

  @ApiProperty({ type: ChatMessageDto })
  assistantMessage: ChatMessageDto;
}

export class ConversationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Explain quantum computing in simple terms' })
  title: string;

  @ApiProperty({ type: ProviderRefDto, nullable: true })
  provider: ProviderRefDto | null;

  @ApiProperty({ example: 6 })
  messageCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ConversationListResponseDto {
  @ApiProperty({ type: ConversationSummaryDto, isArray: true })
  items: ConversationSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class ConversationDetailDto extends ConversationSummaryDto {
  @ApiProperty({ type: ChatMessageDto, isArray: true })
  messages: ChatMessageDto[];
}

export class CompareResultDto {
  @ApiProperty({ type: ProviderRefDto })
  provider: ProviderRefDto;

  @ApiProperty({ example: 'gpt-4o' })
  model: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'The capital of Australia is Canberra.',
  })
  content: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 18 })
  promptTokens: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 9 })
  completionTokens: number | null;

  @ApiProperty({ example: 812, description: 'How long this provider took' })
  latencyMs: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Why this provider failed; the others are still returned',
  })
  error: string | null;
}

export class CompareResponseDto {
  @ApiProperty({ example: 'What is the capital of Australia? One sentence.' })
  message: string;

  @ApiProperty({
    type: CompareResultDto,
    isArray: true,
    description: 'One result per provider, in the order requested',
  })
  results: CompareResultDto[];
}
