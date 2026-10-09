import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import { AppModule } from "./app.module";
import { loadEnv } from "./env";

/** Builds the app (used by main.ts and the tests). */
export async function createApp(opts: { logger?: boolean } = {}) {
  const env = loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: opts.logger ?? env.NODE_ENV !== "test", trustProxy: true, bodyLimit: 512 * 1024 }),
    { logger: opts.logger === false ? false : ["error", "warn", "log"] },
  );
  // The web app lives on another origin, so allow cross-origin reads (CORS still decides who may call).
  await app.register(helmet as never, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } } as never);
  await app.register(compress as never, { global: true, threshold: 1024, encodings: ["br", "gzip"] } as never);
  app.enableCors({ origin: env.CORS_ORIGINS.split(",").map((s) => s.trim()), credentials: false, maxAge: 86_400 });
  app.setGlobalPrefix("v1");
  app.enableShutdownHooks();
  return app;
}
