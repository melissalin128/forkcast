import { Router } from 'express';
import { healthRouter } from './health';
import { promosRouter } from './promos';
import { restaurantsRouter } from './restaurants';
import { scrapeRouter } from './scrape';
import { usersRouter } from './users';

export const apiRouter = Router();
apiRouter.use(healthRouter);
apiRouter.use(restaurantsRouter);
apiRouter.use(promosRouter);
apiRouter.use(usersRouter);
apiRouter.use(scrapeRouter);

export { errorHandler } from './errors';
