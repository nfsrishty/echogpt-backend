import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiProvider, Message, MessageRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthenticatedRequest } from '../common/interfaces/auth-user.interface';
import {
  buildPaginationMeta,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AiProviderAdapter,
  ChatMessage,
  TokenUsage,
} from '../providers/adapters/ai-provider.adapter';
import { toProviderHttpException } from '../providers/provider-errors';
import { ProvidersService } from '../providers/providers.service';
import {
  ChatMessageDto,
  ConversationDetailDto,
  ConversationListResponseDto,
  ConversationSummaryDto,
  ProviderRefDto,
  SendMessageResponseDto,
} from './dto/chat-response.dto';
import { SendMessageDto } from './dto/send-message.dto';

/** How many previous messages are sent to the model as context. */
const HISTORY_LIMIT = 20;
const TITLE_MAX_LENGTH = 60;

interface PreparedChat {
  conversationId: string;
  isNewConversation: boolean;
  provider: AiProvider;
  adapter: AiProviderAdapter;
  model: string;
  messages: ChatMessage[];
  userMessageAt: Date;
}

type ConversationWithRelations = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  provider: AiProvider | null;
  _count: { messages: number };
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providersService: ProvidersService,
  ) {}

  // ---------- send (non-streaming) ----------

  async sendMessage(
    userId: string,
    dto: SendMessageDto,
    request: AuthenticatedRequest,
  ): Promise<SendMessageResponseDto> {
    const chat = await this.prepare(userId, dto);

    let result;
    try {
      result = await chat.adapter.chat({
        model: chat.model,
        messages: chat.messages,
      });
    } catch (error) {
      throw this.toHttpError(error, chat.provider);
    }

    const saved = await this.persist(
      userId,
      chat,
      dto.message,
      result.content,
      result,
    );
    this.attachUsage(request, chat.provider, result);

    return {
      conversationId: chat.conversationId,
      provider: this.toProviderRef(chat.provider),
      userMessage: this.toMessage(saved.userMessage),
      assistantMessage: this.toMessage(saved.assistantMessage),
    };
  }

  // ---------- send (streaming, Server-Sent Events) ----------

  /**
   * Streams the answer token-by-token as SSE events:
   *   meta  {conversationId, provider, model}
   *   delta {text}              (repeated)
   *   done  {messageId, conversationId, usage}
   *   error {message}           (only if the provider fails mid-stream)
   *
   * We wait for the provider's FIRST chunk before sending headers. If the
   * provider fails immediately, the client still gets a normal JSON error
   * with a proper status code instead of a half-open stream.
   */
  async streamMessage(
    userId: string,
    dto: SendMessageDto,
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> {
    let settle: () => void = () => undefined;
    request.handlerSettled = new Promise<void>((resolve) => (settle = resolve));

    try {
      await this.runStream(userId, dto, request, response);
    } finally {
      settle();
    }
  }

  private async runStream(
    userId: string,
    dto: SendMessageDto,
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<void> {
    const chat = await this.prepare(userId, dto);

    // Client closed the tab / cancelled: stop paying for tokens upstream.
    const abort = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) {
        abort.abort();
      }
    });

    const iterator = chat.adapter
      .stream({
        model: chat.model,
        messages: chat.messages,
        signal: abort.signal,
      })
      [Symbol.asyncIterator]();

    let next: IteratorResult<unknown>;
    try {
      next = await iterator.next();
    } catch (error) {
      throw this.toHttpError(error, chat.provider);
    }

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
    response.flushHeaders();

    const send = (event: string, data: unknown) =>
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    send('meta', {
      conversationId: chat.conversationId,
      provider: this.toProviderRef(chat.provider),
      model: chat.model,
    });

    let content = '';
    const usage: TokenUsage = {};

    try {
      while (!next.done) {
        const chunk = next.value as
          { type: 'delta'; text: string } | ({ type: 'usage' } & TokenUsage);

        if (chunk.type === 'delta') {
          content += chunk.text;
          send('delta', { text: chunk.text });
        } else {
          usage.promptTokens = chunk.promptTokens ?? usage.promptTokens;
          usage.completionTokens =
            chunk.completionTokens ?? usage.completionTokens;
        }
        next = await iterator.next();
      }

      const saved = await this.persist(
        userId,
        chat,
        dto.message,
        content,
        usage,
      );
      this.attachUsage(request, chat.provider, usage);
      send('done', {
        messageId: saved.assistantMessage.id,
        conversationId: chat.conversationId,
        usage,
      });
    } catch (error) {
      if (abort.signal.aborted) {
        // Keep whatever was generated before the user left.
        if (content) {
          await this.persist(userId, chat, dto.message, content, usage);
          this.attachUsage(request, chat.provider, usage);
        }
      } else {
        this.logger.error(
          `Stream failed for provider "${chat.provider.name}": ${(error as Error).message}`,
        );
        request.consumesQuota = false; // a failed answer shouldn't cost quota
        send('error', { message: 'The AI provider failed while responding' });
      }
    } finally {
      response.end();
    }
  }

  // ---------- conversations ----------

  async listConversations(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<ConversationListResponseDto> {
    const where = { userId };
    const [total, conversations] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { provider: true, _count: { select: { messages: true } } },
      }),
    ]);

    return {
      items: conversations.map((c) => this.toSummary(c)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getConversation(
    userId: string,
    id: string,
  ): Promise<ConversationDetailDto> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        provider: true,
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      ...this.toSummary(conversation),
      messages: conversation.messages.map((m) => this.toMessage(m)),
    };
  }

  async renameConversation(
    userId: string,
    id: string,
    title: string,
  ): Promise<ConversationSummaryDto> {
    await this.assertOwnership(userId, id);

    const conversation = await this.prisma.conversation.update({
      where: { id },
      data: { title },
      include: { provider: true, _count: { select: { messages: true } } },
    });

    return this.toSummary(conversation);
  }

  async deleteConversation(userId: string, id: string): Promise<void> {
    await this.assertOwnership(userId, id);
    await this.prisma.conversation.delete({ where: { id } });
  }

  // ---------- internals ----------

  private async prepare(
    userId: string,
    dto: SendMessageDto,
  ): Promise<PreparedChat> {
    const userMessageAt = new Date();
    let history: Message[] = [];
    let preferredProviderId: string | null = null;

    if (dto.conversationId) {
      const conversation = await this.prisma.conversation.findFirst({
        where: { id: dto.conversationId, userId },
        select: { id: true, providerId: true },
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }
      preferredProviderId = conversation.providerId;
      history = (
        await this.prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_LIMIT,
        })
      ).reverse();
    }

    const { provider, adapter } = await this.providersService.resolveForChat(
      dto.providerId,
      preferredProviderId,
    );

    // Trimming can leave an assistant message first; some providers
    // (Anthropic) require the conversation to start with the user.
    while (history.length > 0 && history[0].role !== MessageRole.USER) {
      history.shift();
    }

    const messages: ChatMessage[] = [
      ...(dto.systemPrompt
        ? [{ role: 'system' as const, content: dto.systemPrompt }]
        : []),
      ...history
        .filter((m) => m.role !== MessageRole.SYSTEM)
        .map((m) => ({
          role:
            m.role === MessageRole.USER
              ? ('user' as const)
              : ('assistant' as const),
          content: m.content,
        })),
      { role: 'user', content: dto.message },
    ];

    return {
      conversationId: dto.conversationId ?? randomUUID(),
      isNewConversation: !dto.conversationId,
      provider,
      adapter,
      model: dto.model ?? provider.defaultModel,
      messages,
      userMessageAt,
    };
  }

  /**
   * Saves the exchange only AFTER the provider answered, in one transaction:
   * a failed call leaves no orphan question without an answer. Timestamps are
   * explicit because Postgres now() is identical for every row in one
   * transaction, which would make message order ambiguous.
   */
  private persist(
    userId: string,
    chat: PreparedChat,
    userContent: string,
    assistantContent: string,
    usage: TokenUsage,
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    return this.prisma.$transaction(async (tx) => {
      if (chat.isNewConversation) {
        await tx.conversation.create({
          data: {
            id: chat.conversationId,
            userId,
            providerId: chat.provider.id,
            title: this.titleFrom(userContent),
          },
        });
      } else {
        await tx.conversation.update({
          where: { id: chat.conversationId },
          data: { providerId: chat.provider.id }, // also bumps updatedAt
        });
      }

      const userMessage = await tx.message.create({
        data: {
          conversationId: chat.conversationId,
          role: MessageRole.USER,
          content: userContent,
          createdAt: chat.userMessageAt,
        },
      });
      const assistantMessage = await tx.message.create({
        data: {
          conversationId: chat.conversationId,
          role: MessageRole.ASSISTANT,
          content: assistantContent,
          providerId: chat.provider.id,
          model: chat.model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          createdAt: new Date(),
        },
      });

      return { userMessage, assistantMessage };
    });
  }

  private attachUsage(
    request: AuthenticatedRequest,
    provider: AiProvider,
    usage: TokenUsage,
  ): void {
    request.usage = {
      providerId: provider.id,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    };
  }

  private toHttpError(error: unknown, provider: AiProvider): HttpException {
    this.logger.error(
      `Provider "${provider.name}" failed: ${(error as Error).message}`,
    );

    return toProviderHttpException(error);
  }

  private async assertOwnership(userId: string, id: string): Promise<void> {
    const count = await this.prisma.conversation.count({
      where: { id, userId },
    });
    // 404, not 403: don't reveal that someone else's conversation exists.
    if (count === 0) {
      throw new NotFoundException('Conversation not found');
    }
  }

  private titleFrom(message: string): string {
    const clean = message.replace(/\s+/g, ' ').trim();
    return clean.length > TITLE_MAX_LENGTH
      ? `${clean.slice(0, TITLE_MAX_LENGTH - 1)}…`
      : clean || 'New conversation';
  }

  private toProviderRef(provider: AiProvider): ProviderRefDto {
    return { id: provider.id, name: provider.name, type: provider.type };
  }

  private toSummary(
    conversation: ConversationWithRelations,
  ): ConversationSummaryDto {
    return {
      id: conversation.id,
      title: conversation.title,
      provider: conversation.provider
        ? this.toProviderRef(conversation.provider)
        : null,
      messageCount: conversation._count.messages,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private toMessage(message: Message): ChatMessageDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      model: message.model,
      providerId: message.providerId,
      promptTokens: message.promptTokens,
      completionTokens: message.completionTokens,
      createdAt: message.createdAt,
    };
  }
}
