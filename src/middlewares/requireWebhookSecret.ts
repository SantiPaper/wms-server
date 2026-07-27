import { timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '@/lib/env';
import { UnauthorizedError } from '@/errors/UnauthorizedError';

export function requireWebhookSecret(req: Request, _res: Response, next: NextFunction) {
  const secret = req.header('X-Webhook-Secret');
  if (!secret || !secretsMatch(secret, env.ERP_WEBHOOK_SECRET)) {
    return next(new UnauthorizedError('Secreto de webhook inválido', 'INVALID_WEBHOOK_SECRET'));
  }
  next();
}

// timingSafeEqual lanza si los buffers tienen longitud distinta — comparamos longitud primero
// (una diferencia de longitud ya delata que no matchea, no hace falta ocultar eso) y solo usamos
// la comparación de tiempo constante para el caso de igual longitud, que es donde una comparación
// con !== podría filtrar por timing cuántos caracteres iniciales coinciden.
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
