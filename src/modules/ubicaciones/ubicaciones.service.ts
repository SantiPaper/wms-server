import { prisma } from '@/lib/prismadb';
import { NotFoundError } from '@/errors/NotFoundError';
import {
  CreateLocationInput,
  ListLocationsQuery,
  UpdateLocationInput,
} from '@/modules/ubicaciones/ubicaciones.schemas';

export function createLocation(data: CreateLocationInput) {
  return prisma.location.create({ data });
}

export function listLocations(query: ListLocationsQuery) {
  return prisma.location.findMany({
    where: {
      ...(query.zoneType ? { zoneType: query.zoneType } : {}),
      ...(query.isBlocked !== undefined ? { isBlocked: query.isBlocked } : {}),
    },
    orderBy: { locationCode: 'asc' },
  });
}

export async function getLocationById(id: number) {
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) throw new NotFoundError('Ubicación no encontrada');
  return location;
}

export async function updateLocation(id: number, data: UpdateLocationInput) {
  await getLocationById(id);
  return prisma.location.update({ where: { id }, data });
}

export async function deleteLocation(id: number) {
  await getLocationById(id);
  await prisma.location.delete({ where: { id } });
}
