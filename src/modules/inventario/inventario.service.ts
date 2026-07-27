import { prisma } from '@/lib/prismadb';
import { ListInventoryQuery } from '@/modules/inventario/inventario.schemas';

export function listInventory(query: ListInventoryQuery) {
  return prisma.inventory.findMany({
    where: {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    include: {
      product: { select: { id: true, sku: true, description: true } },
      location: { select: { id: true, locationCode: true, zoneType: true } },
      lpn: { select: { id: true, lpnCode: true, status: true } },
    },
    orderBy: { id: 'asc' },
  });
}
