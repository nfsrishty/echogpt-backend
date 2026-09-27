/**
 * The contract every AI provider implementation fulfils.
 * Chat code depends only on this interface, never on a specific vendor:
 * adding a new provider means writing one new class, nothing else changes.
 */
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** Overrides for special calls such as health checks. */
  timeoutMs?: number;
  retries?: number;
  maxOutputTokens?: number;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface ChatResult extends TokenUsage {
  content: string;
}

export type StreamChunk =
  { type: 'delta'; text: string } | ({ type: 'usage' } & TokenUsage);

export interface AiProviderAdapter {
  chat(request: ChatRequest): Promise<ChatResult>;
  stream(request: ChatRequest): AsyncGenerator<StreamChunk>;
  /**
   * Sends a tiny real prompt to `model`. This validates the key, the model
   * name AND current availability: listing models would pass even for a
   * model the provider has retired.
   */
  healthCheck(model: string): Promise<void>;
}

export interface AdapterConfig {
  apiKey: string;
  baseUrl?: string | null;
}

/** Thrown for any failed call to a provider; mapped to 502/504 by callers. */
export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly timedOut = false,
    /** From the provider's Retry-After header, when present. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

export const HEALTH_CHECK_PROMPT: ChatMessage[] = [
  { role: 'user', content: 'Reply with the single word: OK' },
];
