import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ProviderRequestError } from './adapters/ai-provider.adapter';

/**
 * Turns a provider failure into the HTTP error our API returns.
 * The provider's own response body is never forwarded to clients.
 */
export function toProviderHttpException(error: unknown): HttpException {
  if (error instanceof ProviderRequestError) {
    if (error.timedOut) {
      return new GatewayTimeoutException(
        'The AI provider took too long to respond',
      );
    }
    // Still failing after automatic retries: the provider is overloaded.
    if (error.status === 429 || error.status === 503) {
      return new ServiceUnavailableException(
        'The AI provider is busy right now. Please try again shortly.',
      );
    }
  }

  return new BadGatewayException(
    'The AI provider could not complete the request. Try again or choose another model.',
  );
}

/** Short, admin-readable reason for a failed health check. */
export function describeHealthFailure(error: unknown, model: string): string {
  if (!(error instanceof ProviderRequestError)) {
    return 'Unexpected error';
  }
  if (error.timedOut) {
    return 'Timed out';
  }

  switch (error.status) {
    case 400:
    case 404:
      return `Model "${model}" is not available (HTTP ${error.status})`;
    case 401:
    case 403:
      return `Invalid API key or permission denied (HTTP ${error.status})`;
    case 429:
    case 503:
      return `Provider busy or rate-limited (HTTP ${error.status})`;
    default:
      return `HTTP ${error.status}`;
  }
}
