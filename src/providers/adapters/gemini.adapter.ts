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

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * Google Gemini API (generateContent). Differences it absorbs: the assistant
 * role is called "model", messages are "contents" made of "parts", and the
 * system prompt goes in systemInstruction.
 */
export class GeminiAdapter implements AiProviderAdapter {
  private readonly baseUrl: string;

  constructor(private readonly config: AdapterConfig) {
    this.baseUrl = (
      config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/+$/, '');
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const response = await providerFetch(
      `${this.modelUrl(request.model)}:generateContent`,
      {
        method: 'POST',
        headers: this.headers(),
        body: this.body(request),
        timeoutMs: request.timeoutMs ?? CHAT_TIMEOUT_MS,
        retries: request.retries,
        signal: request.signal,
      },
    );
    const json = (await response.json()) as GeminiResponse;

    return {
      content: this.textOf(json),
      promptTokens: json.usageMetadata?.promptTokenCount,
      completionTokens: json.usageMetadata?.candidatesTokenCount,
    };
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const response = await providerFetch(
      `${this.modelUrl(request.model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: this.headers(),
        body: this.body(request),
        timeoutMs: STREAM_TIMEOUT_MS,
        signal: request.signal,
      },
    );

    let usage: GeminiResponse['usageMetadata'];

    for await (const { data } of readSseEvents(response.body)) {
      const chunk = JSON.parse(data) as GeminiResponse;
      const text = this.textOf(chunk);
      if (text) {
        yield { type: 'delta', text };
      }
      usage = chunk.usageMetadata ?? usage; // the last chunk has the totals
    }

    yield {
      type: 'usage',
      promptTokens: usage?.promptTokenCount,
      completionTokens: usage?.candidatesTokenCount,
    };
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

  private body(request: ChatRequest) {
    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n');

    return {
      contents: request.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };
  }

  private textOf(response: GeminiResponse): string {
    return (response.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
  }

  private modelUrl(model: string): string {
    return `${this.baseUrl}/models/${encodeURIComponent(model)}`;
  }

  private headers(): Record<string, string> {
    return {
      'x-goog-api-key': this.config.apiKey,
      'Content-Type': 'application/json',
    };
  }
}
