import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { loadEnv, type Env } from './config/env.js';

export async function createApp(env: Env = loadEnv()): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter({ bodyLimit: 1_048_576 }),
    // Required so InternalHmacGuard can verify the exact bytes signed by Nitro.
    { rawBody: true },
  );
  app.enableShutdownHooks();
  return app;
}
