import { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { ForbiddenError } from '@/errors/ForbiddenError';
import { UnauthorizedError } from '@/errors/UnauthorizedError';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requiere rol: ${roles.join(' o ')}`));
    }
    next();
  };
}
