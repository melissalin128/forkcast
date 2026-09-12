import { Router } from 'express';
import { z } from 'zod';
import { getRepo } from '../db';
import { DIETARY_TAGS, SUBSCRIPTION_SLUGS } from '../models/types';
import { normalizeSubscription } from '../pricing/computeTotal';
import { notFound } from './errors';

export const usersRouter = Router();

const createUserBody = z.object({
  zip: z.string().regex(/^\d{5}$/, 'zip must be 5 digits'),
  subscriptions: z
    .array(z.string())
    .default([])
    .transform((arr, ctx) => {
      const out = new Set<(typeof SUBSCRIPTION_SLUGS)[number]>();
      for (const raw of arr) {
        const s = normalizeSubscription(raw);
        if (!s) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown subscription "${raw}" (expected one of ${SUBSCRIPTION_SLUGS.join(', ')})` });
          return z.NEVER;
        }
        out.add(s);
      }
      return [...out];
    }),
  dietaryDefaults: z.array(z.enum(DIETARY_TAGS as [string, ...string[]])).default([]),
});

// POST /api/users  { zip, subscriptions, dietaryDefaults }
usersRouter.post('/users', async (req, res, next) => {
  try {
    const body = createUserBody.parse(req.body ?? {});
    const user = await getRepo().createUser({
      zip: body.zip,
      subscriptions: body.subscriptions,
      dietaryDefaults: body.dietaryDefaults as never,
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
usersRouter.get('/users/:id', async (req, res, next) => {
  try {
    const user = await getRepo().getUser(req.params.id);
    if (!user) throw notFound('user');
    res.json(user);
  } catch (err) {
    next(err);
  }
});
