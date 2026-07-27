import { Router } from 'express';
import { asyncHandler } from '@/lib/asyncHandler';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/requireAuth';
import { loginSchema } from '@/modules/auth/auth.schemas';
import { loginHandler, logoutHandler, meHandler, refreshHandler } from '@/modules/auth/auth.handlers';

export const authRouter = Router();

authRouter.post('/login', validate(loginSchema), asyncHandler(loginHandler));
authRouter.post('/refresh', asyncHandler(refreshHandler));
authRouter.post('/logout', requireAuth, asyncHandler(logoutHandler));
authRouter.get('/me', requireAuth, asyncHandler(meHandler));
