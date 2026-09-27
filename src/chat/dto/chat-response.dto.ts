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

export class SendMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  conversationId: string;

  @ApiProperty({ type: ProviderRefDto })
  provider: ProviderRefDto;

  @ApiProperty({ type: ChatMessageDto })
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
