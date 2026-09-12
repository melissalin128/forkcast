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
    repo = memoryFallback();
    return repo;
  }

  try {
    await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`[db] connected to MongoDB (${mongoose.connection.name})`);
    repo = new MongoRepository();
    return repo;
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.warn(`[db] could not connect to MongoDB (${reason})`);
    repo = memoryFallback();
    return repo;
  }
}

/**
 * With the mock adapters the memory store is seeded (restaurants, promos, 7 days of history).
 * With the live *or* Apify adapters it starts empty: the seed's platform ids are not real store
 * ids, so pricing them would only produce errors — and on Apify it would spend credit running
 * actors against ids that do not exist. `npm run scrape` / `npm run scrape:apify` fills it.
 */
function memoryFallback(): Repository {
  if (config.adapter !== 'mock') {
    console.warn(`[db] no MongoDB -> in-memory store, empty until you run \`npm run scrape\` (ADAPTER=${config.adapter})`);
    return MemoryRepository.empty();
  }
  console.warn('[db] no MongoDB -> using in-memory store seeded from src/seed/data.ts');
  return MemoryRepository.seeded();
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
