import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  // Security headers + a permissive CORS default for the Expo app during dev.
  await app.register(helmet);
  app.enableCors({ origin: true, credentials: true });

  // Versioned API prefix; /health stays unprefixed for load-balancer probes.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // Strip unknown fields and coerce DTOs everywhere.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  Logger.log(`BibleWay API listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Health check: http://localhost:${port}/health`, 'Bootstrap');
}

void bootstrap();
