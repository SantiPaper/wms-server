import { Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Ruta no encontrada' } });
}
