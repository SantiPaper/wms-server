import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireRole } from '@/middlewares/requireRole';
import { idParamSchema } from '@/lib/common.schemas';
import {
  addProductStockSchema,
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from '@/modules/productos/productos.schemas';
import {
  addProductStockHandler,
  createProductHandler,
  deleteProductHandler,
  getProductHandler,
  listProductsHandler,
  updateProductHandler,
} from '@/modules/productos/productos.handlers';

export const productosRouter = Router();

productosRouter.use(requireAuth);

productosRouter.post(
  '/',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  validate(createProductSchema),
  asyncHandler(createProductHandler),
);
productosRouter.get('/', validate(listProductsQuerySchema, 'query'), asyncHandler(listProductsHandler));
productosRouter.get('/:id', validate(idParamSchema, 'params'), asyncHandler(getProductHandler));
productosRouter.patch(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  validate(idParamSchema, 'params'),
  validate(updateProductSchema),
  asyncHandler(updateProductHandler),
);
productosRouter.delete(
  '/:id',
  requireRole(Role.ADMIN),
  validate(idParamSchema, 'params'),
  asyncHandler(deleteProductHandler),
);
productosRouter.post(
  '/:id/stock',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  validate(idParamSchema, 'params'),
  validate(addProductStockSchema),
  asyncHandler(addProductStockHandler),
);
