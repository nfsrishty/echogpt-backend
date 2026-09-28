import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { addErrorResponseExamples } from './common/swagger/error-examples';

export const API_PREFIX = 'api/v1';

/**
 * Everything that shapes how requests are handled. Shared by main.ts and the
 * e2e tests, so tests exercise exactly the app that ships.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Secure HTTP headers (no-sniff, frame protection, HSTS, CSP, ...).
  app.use(helmet());

  // Default JSON limit is 100 KB; a full web page for "Summarize this page"
  // can be larger. 1 MB is plenty while still bounding request size.
  (app as NestExpressApplication).useBodyParser('json', { limit: '1mb' });

  // Every route lives under /api/v1: a future /api/v2 won't break clients.
  app.setGlobalPrefix(API_PREFIX);

  // CORS: the Chrome extension calls us from a chrome-extension:// origin.
  const corsOrigins = config.get<string>('CORS_ORIGINS', '*');
  app.enableCors({
    origin:
      corsOrigins === '*'
        ? true
        : corsOrigins.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  // Validate every request body/query against its DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not declared in the DTO
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // turn payloads into DTO class instances
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Lets Prisma disconnect cleanly on Ctrl+C / container stop.
  app.enableShutdownHooks();
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EchoGPT Backend API')
    .setDescription(
      'REST API for the EchoGPT Chrome extension: authentication, subscriptions, multi-provider AI chat, web search and admin tooling.\n\n' +
        '**Quick start:** POST /auth/login (seeded admin: see README), copy `accessToken`, click **Authorize**, paste it.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  addErrorResponseExamples(document);

  return document;
}
