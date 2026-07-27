import { Request, Response } from 'express';
import { prisma } from '@/lib/prismadb';
import { NotFoundError } from '@/errors/NotFoundError';

export async function getPickingWaveHandler(req: Request, res: Response) {
  const { id } = req.params as unknown as { id: number };
  const wave = await prisma.pickingWave.findUnique({
    where: { id },
    include: {
      orders: true,
      tasks: { include: { fromLocation: true }, orderBy: { routeSequence: 'asc' } },
    },
  });
  if (!wave) throw new NotFoundError('Wave no encontrada');
  res.json(wave);
}
