import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

/** Swagger: documents that a route needs a Bearer access token. */
export const ApiAuth = () =>
  applyDecorators(
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description: 'Missing, invalid or expired access token',
    }),
  );
