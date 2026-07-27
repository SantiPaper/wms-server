import { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { NotFoundError } from '@/errors/NotFoundError';

export type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Finds an existing LPN by code (moving it to `locationId`) or creates a new one.
 * When no code is given, generates one from the new row's id (`LPN-000123`) —
 * requires a create-then-update because the code depends on the autoincrement id.
 */
export async function resolveOrCreateLpn(
  tx: PrismaTx,
  locationId: number,
  lpnCode?: string | null,
) {
  if (lpnCode) {
    const existing = await tx.lpn.findUnique({ where: { lpnCode } });
    if (existing) {
      return tx.lpn.update({ where: { id: existing.id }, data: { currentLocationId: locationId } });
    }
    return tx.lpn.create({ data: { lpnCode, currentLocationId: locationId } });
  }

  const placeholder = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await tx.lpn.create({ data: { lpnCode: placeholder, currentLocationId: locationId } });
  const generatedCode = `LPN-${String(created.id).padStart(6, '0')}`;
  return tx.lpn.update({ where: { id: created.id }, data: { lpnCode: generatedCode } });
}

export async function getLpnByCode(lpnCode: string) {
  const lpn = await prisma.lpn.findUnique({
    where: { lpnCode },
    include: { inventory: { include: { product: true, location: true } } },
  });
  if (!lpn) throw new NotFoundError('LPN no encontrada');
  return lpn;
}
