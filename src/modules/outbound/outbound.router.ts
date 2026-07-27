import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireRole } from '@/middlewares/requireRole';
import { requireWebhookSecret } from '@/middlewares/requireWebhookSecret';
import {
  listOutboundOrdersQuerySchema,
  listPickingTasksQuerySchema,
  orderIdParamSchema,
  orderTasksParamSchema,
  outboundOrderWebhookSchema,
  releaseWaveSchema,
  reportShortageSchema,
  scanTaskSchema,
  shipOrderSchema,
  taskParamSchema,
} from '@/modules/outbound/outbound.schemas';
import {
  getOutboundOrderHandler,
  listOutboundOrdersHandler,
  outboundOrderWebhookHandler,
  packOrderHandler,
  releaseWaveHandler,
  shipOrderHandler,
} from '@/modules/outbound/outbound.handlers';
import {
  listPickingTasksHandler,
  reportShortageHandler,
  scanTaskHandler,
} from '@/modules/outbound/picking.handlers';

export const outboundIntegrationsRouter = Router();
outboundIntegrationsRouter.post(
  '/outbound-orders',
  requireWebhookSecret,
  validate(outboundOrderWebhookSchema),
  asyncHandler(outboundOrderWebhookHandler),
);

export const outboundRouter = Router();
outboundRouter.use(requireAuth);

outboundRouter.get('/', validate(listOutboundOrdersQuerySchema, 'query'), asyncHandler(listOutboundOrdersHandler));
outboundRouter.post(
  '/release',
  requireRole(Role.SUPERVISOR, Role.ADMIN),
  validate(releaseWaveSchema),
  asyncHandler(releaseWaveHandler),
);
outboundRouter.get('/:id', validate(orderIdParamSchema, 'params'), asyncHandler(getOutboundOrderHandler));
outboundRouter.post(
  '/:id/pack',
  requireRole(Role.SUPERVISOR, Role.ADMIN),
  validate(orderIdParamSchema, 'params'),
  asyncHandler(packOrderHandler),
);
outboundRouter.post(
  '/:id/ship',
  requireRole(Role.SUPERVISOR, Role.ADMIN),
  validate(orderIdParamSchema, 'params'),
  validate(shipOrderSchema),
  asyncHandler(shipOrderHandler),
);

outboundRouter.get(
  '/:orderId/picking-tasks',
  validate(orderTasksParamSchema, 'params'),
  validate(listPickingTasksQuerySchema, 'query'),
  asyncHandler(listPickingTasksHandler),
);
outboundRouter.post(
  '/:orderId/picking-tasks/:taskId/scan',
  validate(taskParamSchema, 'params'),
  validate(scanTaskSchema),
  asyncHandler(scanTaskHandler),
);
outboundRouter.post(
  '/:orderId/picking-tasks/:taskId/report-shortage',
  validate(taskParamSchema, 'params'),
  validate(reportShortageSchema),
  asyncHandler(reportShortageHandler),
);
