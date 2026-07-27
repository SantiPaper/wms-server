import { Router } from 'express';
import { asyncHandler } from '@/lib/asyncHandler';
import { requireAuth } from '@/middlewares/requireAuth';
import { claimNextTaskHandler } from '@/modules/outbound/picking.handlers';

export const pickingQueueRouter = Router();
pickingQueueRouter.use(requireAuth);

pickingQueueRouter.post('/claim-next', asyncHandler(claimNextTaskHandler));
