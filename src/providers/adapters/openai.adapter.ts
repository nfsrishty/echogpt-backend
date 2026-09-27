import {
  AdapterConfig,
  AiProviderAdapter,
  ChatRequest,
  ChatResult,
  HEALTH_CHECK_PROMPT,
  StreamChunk,
} from './ai-provider.adapter';
import {
  CHAT_TIMEOUT_MS,
  HEALTH_TIMEOUT_MS,
  providerFetch,
  readSseEvents,
  STREAM_TIMEOUT_MS,
} from './http.util';

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface OpenAiCompletion {
  choices?: { message?: { content?: string | null } }[];
  usage?: OpenAiUsage;
}

interface OpenAiStreamChunk {
  choices?: { delta?: { content?: string | null } }[];
  usage?: OpenAiUsage | null;
}

/** OpenAI Chat Completions API. */
export class OpenAiAdapter implements AiProviderAdapter {
  private readonly baseUrl: string;

  constructor(private readonly config: AdapterConfig) {
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(
      /\/+$/,
      '',
    );
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await providerFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: { model: request.model, messages: request.messages },
      timeoutMs: request.timeoutMs ?? CHAT_TIMEOUT_MS,
      retries: request.retries,
      signal: request.signal,
    });
    const json = (await response.json()) as OpenAiCompletion;

    return {
      content: json.choices?.[0]?.message?.content ?? '',
      promptTokens: json.usage?.prompt_tokens,
      completionTokens: json.usage?.completion_tokens,
    };
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const response = await providerFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: {
        model: request.model,
        messages: request.messages,
        stream: true,
        stream_options: { include_usage: true },
      },
      timeoutMs: STREAM_TIMEOUT_MS,
      signal: request.signal,
    });

    for await (const { data } of readSseEvents(response.body)) {
      if (data === '[DONE]') {
        break;
      }
      const chunk = JSON.parse(data) as OpenAiStreamChunk;
      const text = chunk.choices?.[0]?.delta?.content;
      if (text) {
        yield { type: 'delta', text };
      }
      if (chunk.usage) {
        yield {
          type: 'usage',
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
        };
      }
    }
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

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}
