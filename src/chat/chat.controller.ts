import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiGatewayTimeoutResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiAuth } from '../common/decorators/api-auth.decorator';
import { ConsumesQuota } from '../common/decorators/consumes-quota.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import type { AuthenticatedRequest } from '../common/interfaces/auth-user.interface';
import { ChatService } from './chat.service';
import {
  ConversationDetailDto,
  ConversationListResponseDto,
  ConversationSummaryDto,
  SendMessageResponseDto,
} from './dto/chat-response.dto';
import { RenameConversationDto } from './dto/rename-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Chat')
@ApiAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @ConsumesQuota()
  @ApiOperation({
    summary: 'Send a prompt and receive the AI response',
    description:
      'Starts a new conversation or continues one (conversationId). Uses 1 request from the daily quota when it succeeds.',
  })
  @ApiCreatedResponse({ type: SendMessageResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation failed or provider unavailable',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Conversation not found',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Daily quota exceeded',
  })
  @ApiBadGatewayResponse({
    type: ErrorResponseDto,
    description: 'The AI provider returned an error',
  })
  @ApiGatewayTimeoutResponse({
    type: ErrorResponseDto,
    description: 'The AI provider timed out',
  })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description:
      'No provider configured, or the provider is busy (after automatic retries)',
  })
  sendMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<SendMessageResponseDto> {
    return this.chatService.sendMessage(userId, dto, request);
  }

  @Post('messages/stream')
  @ConsumesQuota()
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Send a prompt and stream the response (Server-Sent Events)',
    description: [
      'Same body as POST /chat/messages. Responds with `text/event-stream`:',
      '',
      '- `event: meta` → `{ conversationId, provider, model }`',
      '- `event: delta` → `{ text }` (repeated, one per chunk)',
      '- `event: done` → `{ messageId, conversationId, usage }`',
      '- `event: error` → `{ message }` (provider failed mid-stream)',
      '',
      'Errors before the stream starts (validation, quota, provider down) are normal JSON errors.',
      'Swagger UI cannot display streams live; use curl or fetch() with a ReadableStream.',
    ].join('\n'),
  })
  @ApiOkResponse({
    description: 'SSE stream',
    content: { 'text/event-stream': {} },
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Daily quota exceeded',
  })
  @ApiBadGatewayResponse({
    type: ErrorResponseDto,
    description: 'The AI provider returned an error',
  })
  async streamMessage(
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    await this.chatService.streamMessage(userId, dto, request, response);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List my conversations (newest activity first)' })
  @ApiOkResponse({ type: ConversationListResponseDto })
  listConversations(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<ConversationListResponseDto> {
    return this.chatService.listConversations(userId, query);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get a conversation with its full message history' })
  @ApiOkResponse({ type: ConversationDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getConversation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailDto> {
    return this.chatService.getConversation(userId, id);
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Rename a conversation' })
  @ApiOkResponse({ type: ConversationSummaryDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  renameConversation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameConversationDto,
  ): Promise<ConversationSummaryDto> {
    return this.chatService.renameConversation(userId, id, dto.title);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation and its messages' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async deleteConversation(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.chatService.deleteConversation(userId, id);
  }
}
