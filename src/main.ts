import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Secure HTTP headers (no-sniff, frame protection, HSTS, CSP, ...).
  app.use(helmet());

  // Every route lives under /api/v1 — lets us ship /api/v2 later without breaking clients.
  app.setGlobalPrefix('api/v1');

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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('EchoGPT Backend API')
    .setDescription(
      'REST API for the EchoGPT Chrome extension: authentication, subscriptions, multi-provider AI chat, web search and admin tooling.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    jsonDocumentUrl: 'docs/json',
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`API running at http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

void bootstrap();
