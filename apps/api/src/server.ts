import { config } from './config';
import { createApp } from './app';
import { connectDb, disconnectDb } from './db';
import { adapterMode } from './adapters';

async function main(): Promise<void> {
  const repo = await connectDb();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}  (store=${repo.kind}, adapter=${adapterMode()})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
