import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  mkdirSync(dirname(resolve(process.env.DATABASE_PATH || './data/autofix.sqlite')), { recursive: true });
  const adapter = new FastifyAdapter({ logger: process.env.NODE_ENV !== 'production', bodyLimit: 2 * 1024 * 1024 });
  adapter.getInstance().addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer', bodyLimit: 2 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );
  const staticRoot = process.env.WEB_ROOT || (existsSync(join(process.cwd(), 'web-dist')) ? join(process.cwd(), 'web-dist') : join(process.cwd(), '../web/dist'));
  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, { root: staticRoot, prefix: '/' });
  }
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const config = app.get(ConfigService);
  const port = Number(config.get('API_PORT', 3000));
  await app.listen(port, '0.0.0.0');
}

void bootstrap();

