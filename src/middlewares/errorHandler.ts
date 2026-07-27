import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '@/errors/AppError';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'UNIQUE_CONSTRAINT', message: 'El recurso ya existe', details: err.meta },
      });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({
        error: { code: 'FOREIGN_KEY_CONSTRAINT', message: 'Referencia inválida o en uso', details: err.meta },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No encontrado' } });
    }
  }

  logger.error('Unhandled error', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno' } });
}
