import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/exception.filter.js';
import {
  attachRequestContext,
  logger,
  PinoLoggerService,
  requestLogFields,
} from './common/logger.js';
import { recordHttpRequest } from './common/metrics.js';
import { loadEnv, type Env } from './config/env.js';

export async function createApp(env: Env = loadEnv()): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter({ bodyLimit: 1_048_576 }),
    // Required so InternalHmacGuard can verify the exact bytes signed by Nitro.
    { rawBody: true },
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useLogger(new PinoLoggerService());
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (request, _reply, done) => {
    attachRequestContext(request);
    done();
  });
  fastify.addHook('onResponse', (request, reply, done) => {
    logger.info(requestLogFields(request, reply.statusCode), 'request completed');
    recordHttpRequest(
      request.routeOptions?.url ?? 'unmatched',
      request.method,
      reply.statusCode,
      reply.elapsedTime / 1000,
    );
    done();
  });
  app.enableShutdownHooks();
  return app;
}
