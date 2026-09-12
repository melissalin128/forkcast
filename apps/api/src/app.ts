import cors from 'cors';
import express from 'express';
import { apiRouter, errorHandler } from './routes';

/** Express app without the listener, so tests can mount it in-process. */
export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (_req, res) => {
    res.json({ service: 'forkcast-api', docs: '/api/health' });
  });
  app.use('/api', apiRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'route not found' });
  });
  app.use(errorHandler);
  return app;
}
