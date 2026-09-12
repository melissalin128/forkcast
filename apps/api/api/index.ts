/**
 * Vercel serverless entry for the Forkcast API.
 *
 * Vercel builds this file with its own Node runtime, so it sits outside `src`
 * (which `tsc -p tsconfig.json` compiles with rootDir: src for the long-lived
 * `npm start` deployment). Both entrypoints mount the same Express app from
 * src/app.ts; only the way it is served differs.
 *
 * The Mongo connection and the app are cached on the module, so warm
 * invocations reuse them instead of reconnecting on every request.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { connectDb } from '../src/db';

let app: Express | null = null;
let ready: Promise<void> | null = null;

async function init(): Promise<Express> {
  ready ??= connectDb().then(() => undefined);
  await ready;
  app ??= createApp();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const instance = await init();
  instance(req as never, res as never);
}
