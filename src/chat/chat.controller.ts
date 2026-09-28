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
  ApiBody,
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
  CompareResponseDto,
  ConversationDetailDto,
  ConversationListResponseDto,
  ConversationSummaryDto,
  SendMessageResponseDto,
} from './dto/chat-response.dto';
import { RenameConversationDto } from './dto/rename-conversation.dto';
import { CompareMessageDto, SendMessageDto } from './dto/send-message.dto';

/**
 * "Try it out" examples. Without these Swagger pre-fills every optional field
 * with placeholders, e.g. a fake conversationId that returns 404.
 */
const SEND_MESSAGE_EXAMPLES = {
  newConversation: {
    summary: 'Start a new conversation (default model)',
    value: { message: 'Explain quantum computing in simple terms' },
  },
  continueConversation: {
    summary: 'Continue a conversation (paste a real conversationId)',
    value: {
      message: 'Now explain it like I am 10 years old',
      conversationId: 'PASTE-A-CONVERSATION-ID-FROM-A-PREVIOUS-RESPONSE',
    },
  },
  chooseModel: {
    summary: 'Use a specific provider (id from GET /providers/available)',
    value: {
      message: 'Write a haiku about the sea',
      providerId: 'PASTE-A-PROVIDER-ID',
    },
  },
  summarizePage: {
    summary: 'Page tool: summarize the current page',
    value: {
      action: 'SUMMARIZE_PAGE',
      pageContext: {
        url: 'https://example.com/article',
        title: 'How solid-state batteries work',
        content:
          'Solid-state batteries replace the liquid electrolyte with a solid one, which...',
      },
    },
  },
  explainSelection: {
    summary: 'Page tool: explain selected text',
    value: {
      action: 'EXPLAIN_SELECTION',
      pageContext: {
        title: 'How solid-state batteries work',
        selection: 'sulfide electrolytes',
      },
    },
  },
  askAboutPage: {
    summary: 'Ask a question with the page as context',
    value: {
      message: 'What are the main risks mentioned here?',
      pageContext: {
        title: 'How solid-state batteries work',
        content: 'Solid-state batteries replace the liquid electrolyte with...',
      },
    },
  },
};

@ApiTags('Chat')
@ApiAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('messages')
  @ConsumesQuota()
  @ApiBody({ type: SendMessageDto, examples: SEND_MESSAGE_EXAMPLES })
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
  @ApiBody({ type: SendMessageDto, examples: SEND_MESSAGE_EXAMPLES })
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

  @Post('compare')
  @HttpCode(HttpStatus.OK)
  @ConsumesQuota()
  @ApiOperation({
    summary: 'Compare answers from 2-3 AI models side by side',
    description:
      'Sends the same prompt to each provider in parallel. If one fails, the others are still returned, with `error` set on the failed one; only if all fail is a 502 returned. Counts as 1 request toward the daily quota. Comparisons are not saved as conversations.',
  })
  @ApiOkResponse({ type: CompareResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation failed, or a selected provider is unavailable',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Daily quota exceeded',
  })
  @ApiBadGatewayResponse({
    type: ErrorResponseDto,
    description: 'None of the providers could answer',
  })
  compare(
    @Body() dto: CompareMessageDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CompareResponseDto> {
    return this.chatService.compare(dto, request);
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
