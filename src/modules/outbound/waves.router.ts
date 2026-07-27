import { Router } from 'express';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { idParamSchema } from '@/lib/common.schemas';
import { getPickingWaveHandler } from '@/modules/outbound/waves.handlers';

export const wavesRouter = Router();

wavesRouter.get(
  '/:id',
  requireAuth,
  validate(idParamSchema, 'params'),
  asyncHandler(getPickingWaveHandler),
);
