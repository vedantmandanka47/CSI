import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Use Pino logger
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Security headers (SEC-02)
  app.use(helmet());

  // ARCH-19: Exact trusted proxy hops
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', env.TRUST_PROXY_HOPS);

  // Prefix all routes with /api (ARCH-01)
  app.setGlobalPrefix('api');

  // DEP-15: Graceful shutdown
  app.enableShutdownHooks();

  const port = env.API_PORT;
  await app.listen(port);
  logger.log(`🚀 CSI GCET API service listening on port ${port} (env: ${env.NODE_ENV})`);
}

bootstrap().catch((err) => {
  console.error('Fatal API bootstrap error:', err);
  process.exit(1);
});
