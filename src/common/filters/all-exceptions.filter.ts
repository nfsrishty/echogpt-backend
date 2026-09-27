import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ErrorResponseDto } from '../dto/error-response.dto';

interface ResolvedError {
  statusCode: number;
  error: string;
  message: string | string[];
}

/**
 * Catches every exception and returns ONE consistent error shape.
 * Unknown errors become a generic 500: stack traces are logged, never sent
 * to the client (they can reveal internals useful to an attacker).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    // A streaming response may already have started; we can't send JSON then.
    if (response.headersSent) {
      this.logger.error('Error after response started', exception as Error);
      return;
    }

    const { statusCode, error, message } = this.resolve(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseDto = {
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.httpAdapterHost.httpAdapter.reply(response, body, statusCode);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      let message: string | string[] = exception.message;
      let error = this.statusName(statusCode);

      if (typeof response === 'object' && response !== null) {
        const body = response as {
          message?: string | string[];
          error?: string;
        };
        message = body.message ?? message;
        error = body.error ?? error;
      }

      return { statusCode, error, message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return this.build(
            HttpStatus.CONFLICT,
            'A record with this value already exists',
          );
        case 'P2025':
          return this.build(HttpStatus.NOT_FOUND, 'Record not found');
        case 'P2003':
          return this.build(
            HttpStatus.BAD_REQUEST,
            'Referenced record does not exist',
          );
      }
    }

    return this.build(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal server error',
    );
  }

  private build(statusCode: number, message: string): ResolvedError {
    return { statusCode, error: this.statusName(statusCode), message };
  }

  /** 429 -> "Too Many Requests" */
  private statusName(statusCode: number): string {
    const name = HttpStatus[statusCode] as string | undefined;
    if (!name) {
      return 'Error';
    }

    return name
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
