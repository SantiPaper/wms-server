import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { requireRole } from '@/middlewares/requireRole';
import { idParamSchema } from '@/lib/common.schemas';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from '@/modules/users/users.schemas';
import {
  createUserHandler,
  getUserHandler,
  listUsersHandler,
  updateUserHandler,
} from '@/modules/users/users.handlers';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.post('/', requireRole(Role.ADMIN), validate(createUserSchema), asyncHandler(createUserHandler));
usersRouter.get(
  '/',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  validate(listUsersQuerySchema, 'query'),
  asyncHandler(listUsersHandler),
);
usersRouter.get(
  '/:id',
  requireRole(Role.ADMIN, Role.SUPERVISOR),
  validate(idParamSchema, 'params'),
  asyncHandler(getUserHandler),
);
usersRouter.patch(
  '/:id',
  requireRole(Role.ADMIN),
  validate(idParamSchema, 'params'),
  validate(updateUserSchema),
  asyncHandler(updateUserHandler),
);
