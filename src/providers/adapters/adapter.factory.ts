import { ProviderType } from '@prisma/client';
import { AdapterConfig, AiProviderAdapter } from './ai-provider.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { OpenAiAdapter } from './openai.adapter';

/** The only place that knows which class serves which provider type. */
export function createAdapter(
  type: ProviderType,
  config: AdapterConfig,
): AiProviderAdapter {
  switch (type) {
    case ProviderType.OPENAI:
      return new OpenAiAdapter(config);
    case ProviderType.ANTHROPIC:
      return new AnthropicAdapter(config);
    case ProviderType.GEMINI:
      return new GeminiAdapter(config);
  }
}
