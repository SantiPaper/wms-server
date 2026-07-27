import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireRole } from '@/middlewares/requireRole';
import { idParamSchema } from '@/lib/common.schemas';
import {
  createLocationSchema,
  listLocationsQuerySchema,
  updateLocationSchema,
} from '@/modules/ubicaciones/ubicaciones.schemas';
import {
  createLocationHandler,
  deleteLocationHandler,
  getLocationHandler,
  listLocationsHandler,
  updateLocationHandler,
} from '@/modules/ubicaciones/ubicaciones.handlers';

export const ubicacionesRouter = Router();

ubicacionesRouter.use(requireAuth);

ubicacionesRouter.post(
  '/',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  validate(createLocationSchema),
  asyncHandler(createLocationHandler),
);
ubicacionesRouter.get('/', validate(listLocationsQuerySchema, 'query'), asyncHandler(listLocationsHandler));
ubicacionesRouter.get('/:id', validate(idParamSchema, 'params'), asyncHandler(getLocationHandler));
ubicacionesRouter.patch(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  validate(idParamSchema, 'params'),
  validate(updateLocationSchema),
  asyncHandler(updateLocationHandler),
);
ubicacionesRouter.delete(
  '/:id',
  requireRole(Role.ADMIN),
  validate(idParamSchema, 'params'),
  asyncHandler(deleteLocationHandler),
);
