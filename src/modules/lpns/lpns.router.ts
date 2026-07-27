import { Router } from 'express';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { confirmPutawaySchema, lpnCodeParamSchema } from '@/modules/lpns/lpns.schemas';
import { confirmPutawayHandler, putawaySuggestionHandler } from '@/modules/lpns/lpns.handlers';

export const lpnsRouter = Router();

lpnsRouter.use(requireAuth);

lpnsRouter.get(
  '/:lpnCode/putaway-suggestion',
  validate(lpnCodeParamSchema, 'params'),
  asyncHandler(putawaySuggestionHandler),
);
lpnsRouter.post(
  '/:lpnCode/putaway/confirm',
  validate(lpnCodeParamSchema, 'params'),
  validate(confirmPutawaySchema),
  asyncHandler(confirmPutawayHandler),
);
