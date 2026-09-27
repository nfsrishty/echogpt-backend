import {
  AdapterConfig,
  AiProviderAdapter,
  ChatMessage,
  ChatRequest,
  ChatResult,
  HEALTH_CHECK_PROMPT,
  ProviderRequestError,
  StreamChunk,
} from './ai-provider.adapter';
import {
  CHAT_TIMEOUT_MS,
  HEALTH_TIMEOUT_MS,
  providerFetch,
  readSseEvents,
  STREAM_TIMEOUT_MS,
} from './http.util';

const ANTHROPIC_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 2048; // required by the Messages API

interface AnthropicMessage {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicStreamEvent {
  type: string;
  message?: { usage?: { input_tokens?: number } };
  delta?: { type?: string; text?: string };
  usage?: { output_tokens?: number };
  error?: { message?: string };
}

/**
 * Anthropic Messages API. Differences from OpenAI that this class absorbs:
 * the system prompt is a top-level field (not a message), max_tokens is
 * mandatory, and streaming uses typed events.
 */
export class AnthropicAdapter implements AiProviderAdapter {
  private readonly baseUrl: string;

  constructor(private readonly config: AdapterConfig) {
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com/v1').replace(
      /\/+$/,
      '',
    );
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await providerFetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: this.body(request, false),
      timeoutMs: request.timeoutMs ?? CHAT_TIMEOUT_MS,
      retries: request.retries,
      signal: request.signal,
    });
    const json = (await response.json()) as AnthropicMessage;

    return {
      content: (json.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join(''),
      promptTokens: json.usage?.input_tokens,
      completionTokens: json.usage?.output_tokens,
    };
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const response = await providerFetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: this.body(request, true),
      timeoutMs: STREAM_TIMEOUT_MS,
      signal: request.signal,
    });

    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    for await (const { data } of readSseEvents(response.body)) {
      const event = JSON.parse(data) as AnthropicStreamEvent;

      switch (event.type) {
        case 'message_start':
          promptTokens = event.message?.usage?.input_tokens;
          break;
        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            yield { type: 'delta', text: event.delta.text };
          }
          break;
        case 'message_delta':
          completionTokens = event.usage?.output_tokens ?? completionTokens;
          break;
        case 'error':
          throw new ProviderRequestError(
            `Provider stream error: ${event.error?.message ?? 'unknown'}`,
            502,
          );
      }
    }

    yield { type: 'usage', promptTokens, completionTokens };
  }

  async healthCheck(model: string): Promise<void> {
    await this.chat({
      model,
      messages: HEALTH_CHECK_PROMPT,
      timeoutMs: HEALTH_TIMEOUT_MS,
      retries: 0,
      maxOutputTokens: 16,
    });
  }

  private body(request: ChatRequest, stream: boolean) {
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');
    const messages = request.messages.filter(
      (message): message is ChatMessage & { role: 'user' | 'assistant' } =>
        message.role !== 'system',
    );

    return {
      model: request.model,
      max_tokens: request.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      messages,
      ...(system ? { system } : {}),
      ...(stream ? { stream: true } : {}),
    };
  }

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    };
  }
}
