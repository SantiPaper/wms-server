import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireRole } from '@/middlewares/requireRole';
import { idParamSchema } from '@/lib/common.schemas';
import { listWebhookDeliveriesQuerySchema } from '@/modules/webhook-deliveries/webhook-deliveries.schemas';
import {
  getWebhookDeliveryHandler,
  listWebhookDeliveriesHandler,
  retryWebhookDeliveryHandler,
} from '@/modules/webhook-deliveries/webhook-deliveries.handlers';

export const webhookDeliveriesRouter = Router();
webhookDeliveriesRouter.use(requireAuth, requireRole(Role.SUPERVISOR, Role.ADMIN));

webhookDeliveriesRouter.get(
  '/',
  validate(listWebhookDeliveriesQuerySchema, 'query'),
  asyncHandler(listWebhookDeliveriesHandler),
);
webhookDeliveriesRouter.get('/:id', validate(idParamSchema, 'params'), asyncHandler(getWebhookDeliveryHandler));
webhookDeliveriesRouter.post(
  '/:id/retry',
  validate(idParamSchema, 'params'),
  asyncHandler(retryWebhookDeliveryHandler),
);
