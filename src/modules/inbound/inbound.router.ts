import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireRole } from '@/middlewares/requireRole';
import { requireWebhookSecret } from '@/middlewares/requireWebhookSecret';
import { idParamSchema } from '@/lib/common.schemas';
import {
  approveReceptionEventSchema,
  completeInboundOrderSchema,
  inboundOrderWebhookSchema,
  listInboundOrdersQuerySchema,
  listReceptionEventsQuerySchema,
  orderEventParamSchema,
  scanSchema,
} from '@/modules/inbound/inbound.schemas';
import {
  approveReceptionEventHandler,
  completeInboundOrderHandler,
  getInboundOrderHandler,
  inboundOrderWebhookHandler,
  listInboundOrdersHandler,
  listReceptionEventsHandler,
  scanHandler,
} from '@/modules/inbound/inbound.handlers';

export const inboundIntegrationsRouter = Router();
inboundIntegrationsRouter.post(
  '/inbound-orders',
  requireWebhookSecret,
  validate(inboundOrderWebhookSchema),
  asyncHandler(inboundOrderWebhookHandler),
);

export const inboundRouter = Router();
inboundRouter.use(requireAuth);

inboundRouter.get('/', validate(listInboundOrdersQuerySchema, 'query'), asyncHandler(listInboundOrdersHandler));
inboundRouter.get('/:id', validate(idParamSchema, 'params'), asyncHandler(getInboundOrderHandler));
inboundRouter.post(
  '/:id/scan',
  validate(idParamSchema, 'params'),
  validate(scanSchema),
  asyncHandler(scanHandler),
);
inboundRouter.get(
  '/:id/reception-events',
  validate(idParamSchema, 'params'),
  validate(listReceptionEventsQuerySchema, 'query'),
  asyncHandler(listReceptionEventsHandler),
);
inboundRouter.post(
  '/:orderId/reception-events/:eventId/approve',
  requireRole(Role.SUPERVISOR, Role.ADMIN),
  validate(orderEventParamSchema, 'params'),
  validate(approveReceptionEventSchema),
  asyncHandler(approveReceptionEventHandler),
);
inboundRouter.patch(
  '/:id/complete',
  requireRole(Role.SUPERVISOR, Role.ADMIN),
  validate(idParamSchema, 'params'),
  validate(completeInboundOrderSchema),
  asyncHandler(completeInboundOrderHandler),
);
