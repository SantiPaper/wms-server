import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { UnauthorizedError } from '@/errors/UnauthorizedError';
import { verifyAccessToken } from '@/modules/auth/token.util';

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.access_token;
  if (!token) {
    return next(new UnauthorizedError('Falta token de acceso'));
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError('Token inválido o expirado'));
  }
}
