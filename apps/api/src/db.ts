import mongoose from 'mongoose';
import { config } from './config';
import { MemoryRepository, MongoRepository, type Repository } from './repo';

let repo: Repository | null = null;

/**
 * Connect to MONGODB_URI when it is set and reachable; otherwise log one clear
 * warning and serve everything from the in-memory seed so the API still runs.
 */
export async function connectDb(): Promise<Repository> {
  if (repo) return repo;

  if (!config.mongodbUri) {
    console.warn('[db] MONGODB_URI is not set -> using in-memory store seeded from src/seed/data.ts');
    repo = MemoryRepository.seeded();
    return repo;
  }

  try {
    await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`[db] connected to MongoDB (${mongoose.connection.name})`);
    repo = new MongoRepository();
    return repo;
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.warn(`[db] could not connect to MongoDB (${reason}) -> using in-memory store seeded from src/seed/data.ts`);
    repo = MemoryRepository.seeded();
    return repo;
  }
}

export function getRepo(): Repository {
  if (!repo) throw new Error('connectDb() has not been called yet');
  return repo;
}

/** Test hook: swap the repository (e.g. for supertest-style route tests). */
export function setRepo(r: Repository | null): void {
  repo = r;
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  repo = null;
}
