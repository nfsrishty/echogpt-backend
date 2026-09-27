import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { providerFetch } from '../providers/adapters/http.util';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
}

interface TavilyResponse {
  results?: {
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }[];
}

const SEARCH_TIMEOUT_MS = 20_000;
const SNIPPET_MAX_LENGTH = 500;

/**
 * Tavily web search. Without TAVILY_API_KEY it uses Tavily's keyless mode,
 * so search works out of the box (with lower limits).
 */
@Injectable()
export class WebSearchEngine {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('TAVILY_API_KEY') ?? '';
    this.baseUrl = configService
      .getOrThrow<string>('TAVILY_BASE_URL')
      .replace(/\/+$/, '');
  }

  async search(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const response = await providerFetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey
          ? { Authorization: `Bearer ${this.apiKey}` }
          : { 'X-Tavily-Access-Mode': 'keyless' }),
      },
      body: {
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
      },
      timeoutMs: SEARCH_TIMEOUT_MS,
      retries: 1,
    });
    const json = (await response.json()) as TavilyResponse;

    return (json.results ?? [])
      .filter((result) => typeof result.url === 'string')
      .slice(0, maxResults)
      .map((result) => ({
        title: result.title?.trim() || result.url!,
        url: result.url!,
        snippet: (result.content ?? '').trim().slice(0, SNIPPET_MAX_LENGTH),
        score: typeof result.score === 'number' ? result.score : null,
      }));
  }
}
