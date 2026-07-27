import { InventoryStatus, RotationClass, ZoneType } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { env } from '@/lib/env';
import { BadRequestError } from '@/errors/BadRequestError';
import { UnprocessableEntityError } from '@/errors/UnprocessableEntityError';
import { getLpnByCode } from '@/modules/lpns/lpns.service';

export type PutawayReason = 'CONSOLIDATION' | 'CATEGORY' | 'EMPTY_SLOT';

export interface CandidateLocation {
  id: number;
  locationCode: string;
  zoneType: ZoneType;
  maxWeightKg: number | null;
}

export interface RankedCandidate {
  reason: PutawayReason;
  location: CandidateLocation;
}

/** True if `lpnWeightKg` can go in a location capped at `maxWeightKg`. Advisory-only unless `enforceWeightLimits`. */
export function fitsWeight(
  maxWeightKg: number | null,
  lpnWeightKg: number | null,
  enforceWeightLimits: boolean,
): boolean {
  if (!enforceWeightLimits) return true;
  if (lpnWeightKg === null || maxWeightKg === null) return true;
  return lpnWeightKg <= maxWeightKg;
}

/** Pure ranking: returns the first candidate (in the given priority order) that fits the weight, or null. */
export function pickPutawayCandidate(
  candidates: RankedCandidate[],
  lpnWeightKg: number | null,
  enforceWeightLimits: boolean,
): RankedCandidate | null {
  for (const candidate of candidates) {
    if (fitsWeight(candidate.location.maxWeightKg, lpnWeightKg, enforceWeightLimits)) {
      return candidate;
    }
  }
  return null;
}

/** Sum of quantity * product.weightKg across an LPN's inventory rows; null if any product has no known weight. */
export function computeLpnWeightKg(
  inventory: { quantity: number; product: { weightKg: number | null } }[],
): number | null {
  let total = 0;
  for (const inv of inventory) {
    if (inv.product.weightKg === null) return null;
    total += inv.quantity * inv.product.weightKg;
  }
  return total;
}

export async function suggestPutawayLocation(lpnCode: string): Promise<RankedCandidate> {
  const lpn = await getLpnByCode(lpnCode);

  if (lpn.inventory.length === 0) {
    throw new BadRequestError('La LPN no tiene inventario asociado', 'LPN_EMPTY');
  }
  if (lpn.inventory.some((inv) => inv.status === InventoryStatus.DAMAGED)) {
    throw new BadRequestError(
      'Las LPN con mercadería dañada usan el flujo de cuarentena, no putaway',
      'DAMAGED_LPN_PUTAWAY',
    );
  }

  const { productId, batchNumber, product } = lpn.inventory[0];
  const lpnWeightKg = computeLpnWeightKg(
    lpn.inventory.map((inv) => ({
      quantity: inv.quantity,
      product: { weightKg: inv.product.weightKg ? Number(inv.product.weightKg) : null },
    })),
  );

  const candidates: RankedCandidate[] = [];

  // Step 1: consolidation — same product + batch, already in a storage/picking zone.
  const consolidationRows = await prisma.inventory.findMany({
    where: {
      productId,
      batchNumber,
      status: InventoryStatus.AVAILABLE,
      location: { isBlocked: false, zoneType: { in: [ZoneType.STORAGE_RESERVE, ZoneType.PICKING_ACTIVE] } },
    },
    include: { location: true },
    orderBy: { quantity: 'desc' },
  });
  const seenLocationIds = new Set<number>();
  for (const row of consolidationRows) {
    if (seenLocationIds.has(row.location.id)) continue;
    seenLocationIds.add(row.location.id);
    candidates.push({
      reason: 'CONSOLIDATION',
      location: {
        id: row.location.id,
        locationCode: row.location.locationCode,
        zoneType: row.location.zoneType,
        maxWeightKg: row.location.maxWeightKg ? Number(row.location.maxWeightKg) : null,
      },
    });
  }

  // Step 2: category/rotation — class A prefers active picking zones, closer to dispatch.
  const preferredZones =
    product.rotationClass === RotationClass.A
      ? [ZoneType.PICKING_ACTIVE, ZoneType.STORAGE_RESERVE]
      : [ZoneType.STORAGE_RESERVE];
  for (const zoneType of preferredZones) {
    const loc = await prisma.location.findFirst({
      where: { zoneType, isBlocked: false },
      orderBy: { locationCode: 'asc' },
    });
    if (loc) {
      candidates.push({
        reason: 'CATEGORY',
        location: {
          id: loc.id,
          locationCode: loc.locationCode,
          zoneType: loc.zoneType,
          maxWeightKg: loc.maxWeightKg ? Number(loc.maxWeightKg) : null,
        },
      });
    }
  }

  // Step 3: first empty slot in reserve storage — "empty" means no inventory rows at all,
  // or rows left behind at quantity 0 by a pick (Outbound decrements rather than deleting them).
  const emptyLoc = await prisma.location.findFirst({
    where: {
      zoneType: ZoneType.STORAGE_RESERVE,
      isBlocked: false,
      OR: [{ inventory: { none: {} } }, { inventory: { every: { quantity: 0 } } }],
    },
    orderBy: { locationCode: 'asc' },
  });
  if (emptyLoc) {
    candidates.push({
      reason: 'EMPTY_SLOT',
      location: {
        id: emptyLoc.id,
        locationCode: emptyLoc.locationCode,
        zoneType: emptyLoc.zoneType,
        maxWeightKg: emptyLoc.maxWeightKg ? Number(emptyLoc.maxWeightKg) : null,
      },
    });
  }

  const picked = pickPutawayCandidate(candidates, lpnWeightKg, env.ENFORCE_WEIGHT_LIMITS);
  if (!picked) {
    throw new UnprocessableEntityError('No hay ubicación disponible para putaway', 'NO_LOCATION_AVAILABLE');
  }
  return picked;
}

export async function confirmPutaway(lpnCode: string, locationCode: string) {
  return prisma.$transaction(async (tx) => {
    const lpn = await tx.lpn.findUnique({ where: { lpnCode } });
    if (!lpn) throw new BadRequestError('LPN no encontrada', 'LPN_NOT_FOUND');

    const location = await tx.location.findUnique({ where: { locationCode } });
    if (!location) throw new BadRequestError('Ubicación no encontrada', 'LOCATION_NOT_FOUND');
    if (location.isBlocked) throw new BadRequestError('La ubicación está bloqueada', 'LOCATION_BLOCKED');

    const updatedLpn = await tx.lpn.update({
      where: { id: lpn.id },
      data: { currentLocationId: location.id },
    });
    await tx.inventory.updateMany({
      where: { lpnId: lpn.id },
      data: { locationId: location.id },
    });
    const inventory = await tx.inventory.findMany({ where: { lpnId: lpn.id } });

    return { lpn: updatedLpn, inventory };
  });
}
