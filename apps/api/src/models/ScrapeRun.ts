import { Schema, model, type InferSchemaType } from 'mongoose';
import { PLATFORM_SLUGS, SCRAPE_RUN_KINDS, SCRAPE_RUN_STATUSES } from './types';

/**
 * One actor run attempt: feed or search, including attempts the cost guard
 * refused (status "skipped"). Every Apify run id we start or ingest lands here.
 */
const ScrapeRunSchema = new Schema(
  {
    platform: { type: String, required: true, enum: PLATFORM_SLUGS },
    addressKey: { type: String, required: true },
    kind: { type: String, required: true, enum: SCRAPE_RUN_KINDS },
    query: { type: String },
    actorId: { type: String, required: true },
    apifyRunId: { type: String },
    datasetId: { type: String },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    status: { type: String, required: true, enum: SCRAPE_RUN_STATUSES },
    resultsReturned: { type: Number, required: true, default: 0 },
    dealsExtracted: { type: Number, required: true, default: 0 },
    parseFailures: { type: Number, required: true, default: 0 },
    estimatedCost: { type: Number, required: true, default: 0 },
    actualCost: { type: Number },
    error: { type: String },
  },
  { timestamps: true, collection: 'scrapeRuns' },
);
ScrapeRunSchema.index({ apifyRunId: 1 }, { unique: true, sparse: true });
ScrapeRunSchema.index({ platform: 1, kind: 1, startedAt: -1 });
ScrapeRunSchema.index({ status: 1 });

export type ScrapeRunDoc = InferSchemaType<typeof ScrapeRunSchema>;
export const ScrapeRunModel = model('ScrapeRun', ScrapeRunSchema);
