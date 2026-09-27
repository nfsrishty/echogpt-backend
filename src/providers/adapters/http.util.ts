import { ProviderRequestError } from './ai-provider.adapter';

export const CHAT_TIMEOUT_MS = 60_000;
export const STREAM_TIMEOUT_MS = 120_000;
export const HEALTH_TIMEOUT_MS = 15_000;

/** Temporary conditions worth another try: rate limits and overloads. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [500, 1500];
const MAX_RETRY_AFTER_MS = 5_000;

interface ProviderFetchOptions {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Extra attempts after a temporary failure (default 2). */
  retries?: number;
}

/**
 * fetch() with a timeout, optional caller abort (client disconnected),
 * automatic retries for temporary failures, and uniform errors.
 *
 * Only temporary problems are retried (429 rate limit, 5xx overload, network
 * blips). A wrong key (401) or unknown model (404) fails immediately:
 * retrying cannot fix them. Timeouts are not retried either, since that
 * would multiply an already long wait.
 */
export async function providerFetch(
  url: string,
  options: ProviderFetchOptions,
): Promise<Response> {
  const retries = options.retries ?? RETRY_DELAYS_MS.length;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url, options);
    } catch (error) {
      const retryable =
        error instanceof ProviderRequestError &&
        !error.timedOut &&
        RETRYABLE_STATUS.has(error.status);

      if (!retryable || attempt >= retries || options.signal?.aborted) {
        throw error;
      }

      const backoff =
        RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      await sleep(
        Math.min(error.retryAfterMs ?? backoff, MAX_RETRY_AFTER_MS),
        options.signal,
      );
    }
  }
}

async function fetchOnce(
  url: string,
  options: ProviderFetchOptions,
): Promise<Response> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    if (timeout.aborted) {
      throw new ProviderRequestError('Provider request timed out', 504, true);
    }
    if (options.signal?.aborted) {
      throw error; // the caller cancelled on purpose
    }
    throw new ProviderRequestError(
      `Could not reach provider: ${(error as Error).message}`,
      502,
    );
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new ProviderRequestError(
      `Provider responded with HTTP ${response.status}: ${detail}`,
      response.status,
      false,
      parseRetryAfter(response.headers.get('retry-after')),
    );
  }

  return response;
}

/** Retry-After is either seconds ("2") or an HTTP date. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(seconds * 1000, 0);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(date - Date.now(), 0);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason as Error);
      },
      { once: true },
    );
  });
}

export interface SseEvent {
  event?: string;
  data: string;
}

/** Parses a Server-Sent Events byte stream into {event, data} records. */
export async function* readSseEvents(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<SseEvent> {
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }

      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n/g,
        '\n',
      );

      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const event = parseSseBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (event) {
          yield event;
        }
      }
    }

    const tail = parseSseBlock(buffer.trim());
    if (tail) {
      yield tail;
    }
  } finally {
    if (!finished) {
      // Consumer stopped early: cancel the network stream too.
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

function parseSseBlock(block: string): SseEvent | null {
  let event: string | undefined;
  const data: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith(':') || line === '') {
      continue; // comment / keep-alive
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');

    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      data.push(value);
    }
  }

  return data.length > 0 ? { event, data: data.join('\n') } : null;
}
