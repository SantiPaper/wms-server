import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { BadRequestError } from '@/errors/BadRequestError';

type Target = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return next(new BadRequestError('Datos inválidos', 'VALIDATION_ERROR', result.error.flatten()));
    }
    req[target] = result.data;
    next();
  };
}
