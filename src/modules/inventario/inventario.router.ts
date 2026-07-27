import { Router } from 'express';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { listInventoryQuerySchema } from '@/modules/inventario/inventario.schemas';
import { listInventoryHandler } from '@/modules/inventario/inventario.handlers';

export const inventarioRouter = Router();

inventarioRouter.get(
  '/',
  requireAuth,
  validate(listInventoryQuerySchema, 'query'),
  asyncHandler(listInventoryHandler),
);
