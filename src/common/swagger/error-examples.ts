import type { OpenAPIObject } from '@nestjs/swagger';
import { httpStatusText } from '../utils/http-status.util';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const EXAMPLE_ID = '3f1c2b9e-8a4d-4f6e-9b2a-1c3d5e7f9a0b';
const EXAMPLE_TIME = '2026-09-28T10:00:00.000Z';

/** Used when a response was declared without a description. */
const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Invalid or expired access token',
  403: 'You do not have permission to perform this action',
  404: 'Resource not found',
  409: 'A record with this value already exists',
  429: 'Too many requests, please slow down',
  500: 'Internal server error',
  502: 'The upstream service returned an error',
  503: 'Service temporarily unavailable',
  504: 'The upstream service timed out',
};

/**
 * Gives every 4xx/5xx response in the OpenAPI document a realistic example.
 *
 * Without this, Swagger derives one example from ErrorResponseDto and shows it
 * for every error: a 401 or 404 would display "400 email must be an email".
 * Here each response gets its own status code, status text, the message from
 * its description, and the real path of its endpoint.
 */
export function addErrorResponseExamples(document: OpenAPIObject): void {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method];
      if (!operation?.responses) {
        continue;
      }

      for (const [code, response] of Object.entries(operation.responses)) {
        const statusCode = Number(code);
        if (!response || !(statusCode >= 400) || '$ref' in response) {
          continue;
        }

        // `||` not `??`: undeclared descriptions arrive as "" (empty string).
        const description =
          response.description ||
          DEFAULT_MESSAGES[statusCode] ||
          httpStatusText(statusCode);
        const isQuota = statusCode === 429 && /quota/i.test(description);
        const isValidation =
          statusCode === 400 && /validation/i.test(description);

        // Nest reuses ONE response object across every operation that shares a
        // decorator (e.g. @ApiAuth() on a controller). Mutating it in place
        // would let the last operation's path overwrite everyone else's, so
        // each operation gets its own copy.
        operation.responses[code] = {
          ...response,
          description,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponseDto' },
              example: {
                statusCode,
                error: isQuota ? 'Quota Exceeded' : httpStatusText(statusCode),
                message: isValidation
                  ? ['message should not be empty']
                  : isQuota
                    ? 'Daily limit of 20 requests reached on the FREE plan. Resets at 2026-09-29T00:00:00.000Z.'
                    : description,
                path: path.replace(/\{[^}]+\}/g, EXAMPLE_ID),
                timestamp: EXAMPLE_TIME,
              },
            },
          },
        };
      }
    }
  }
}
