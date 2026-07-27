import { InventoryStatus, OutboundOrderStatus, PickingTaskStatus, Prisma, ZoneType } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { broadcast } from '@/lib/realtime';
import { PrismaTx } from '@/modules/lpns/lpns.service';
import { BadRequestError } from '@/errors/BadRequestError';
import { NotFoundError } from '@/errors/NotFoundError';
import { ConflictError } from '@/errors/ConflictError';
import { UnprocessableEntityError } from '@/errors/UnprocessableEntityError';
import { sortPickingTasksSRoute } from '@/modules/outbound/route.service';

export interface AllocationCandidate {
  inventoryId: number;
  locationId: number;
  locationCode: string;
  batchNumber: string | null;
  expirationDate: Date | null;
  availableQty: number;
}

export interface Reservation {
  inventoryId: number;
  locationId: number;
  locationCode: string;
  batchNumber: string | null;
  expirationDate: Date | null;
  quantity: number;
}

export interface AllocationOutcome {
  reservations: Reservation[];
  remaining: number;
}

/**
 * Pure greedy consumer: walks `candidates` in the order given (zone priority + FEFO/FIFO already
 * baked in by the caller) and reserves from each until `neededQty` is covered or candidates run
 * out. Does not know about zones, expiration, or DB state — fully unit-testable with hand-built
 * arrays, same spirit as `pickPutawayCandidate` in Stage 1.
 */
export function allocateFromCandidates(
  candidates: AllocationCandidate[],
  neededQty: number,
): AllocationOutcome {
  const reservations: Reservation[] = [];
  let remaining = neededQty;

  for (const candidate of candidates) {
    if (remaining <= 0) break;
    if (candidate.availableQty <= 0) continue;
    const qty = Math.min(remaining, candidate.availableQty);
    reservations.push({
      inventoryId: candidate.inventoryId,
      locationId: candidate.locationId,
      locationCode: candidate.locationCode,
      batchNumber: candidate.batchNumber,
      expirationDate: candidate.expirationDate,
      quantity: qty,
    });
    remaining -= qty;
  }

  return { reservations, remaining };
}

/**
 * Builds allocation candidates for a product: PICKING_ACTIVE locations first, then the rest, each
 * tier ordered FEFO (expirationDate asc) or FIFO (createdAt asc). `virtualAllocated` accounts for
 * quantity already reserved earlier in the same release/reroute call (before those writes commit),
 * so later items in the same wave don't over-reserve a row. `batchNumber`/`excludeLocationId` are
 * used by the shortage reroute path to search for the same batch elsewhere.
 */
export async function buildCandidates(
  tx: PrismaTx,
  params: {
    productId: number;
    requiresExpiration: boolean;
    batchNumber?: string | null;
    excludeLocationId?: number;
  },
  virtualAllocated: Map<number, number>,
): Promise<AllocationCandidate[]> {
  const orderBy = params.requiresExpiration
    ? { expirationDate: 'asc' as const }
    : { createdAt: 'asc' as const };

  const locationFilter = {
    isBlocked: false,
    ...(params.excludeLocationId ? { id: { not: params.excludeLocationId } } : {}),
  };
  const baseWhere = {
    productId: params.productId,
    status: InventoryStatus.AVAILABLE,
    ...(params.batchNumber !== undefined ? { batchNumber: params.batchNumber } : {}),
  };

  const [pickingActiveRows, otherZoneRows] = await Promise.all([
    tx.inventory.findMany({
      where: { ...baseWhere, location: { ...locationFilter, zoneType: ZoneType.PICKING_ACTIVE } },
      include: { location: true },
      orderBy,
    }),
    tx.inventory.findMany({
      where: { ...baseWhere, location: { ...locationFilter, zoneType: { not: ZoneType.PICKING_ACTIVE } } },
      include: { location: true },
      orderBy,
    }),
  ]);

  return [...pickingActiveRows, ...otherZoneRows].map((row) => {
    const reservedInThisCall = virtualAllocated.get(row.id) ?? 0;
    return {
      inventoryId: row.id,
      locationId: row.locationId,
      locationCode: row.location.locationCode,
      batchNumber: row.batchNumber,
      expirationDate: row.expirationDate,
      availableQty: row.quantity - row.allocatedQuantity - reservedInThisCall,
    };
  });
}

export interface ShortfallDetail {
  orderId: number;
  orderNumber: string;
  productId: number;
  sku: string;
  missingQty: number;
}

interface DraftTask {
  outboundOrderId: number;
  outboundOrderItemId: number;
  productId: number;
  fromLocationId: number;
  fromLocationCode: string;
  inventoryId: number;
  batchNumber: string | null;
  expirationDate: Date | null;
  requiredQuantity: number;
}

export async function releaseWave(orderIds: number[], releasedByUserId?: number) {
  const sortedIds = [...new Set(orderIds)].sort((a, b) => a - b);
  if (sortedIds.length === 0) {
    throw new BadRequestError('Debe indicar al menos una orden', 'EMPTY_RELEASE');
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const orders = await tx.outboundOrder.findMany({
        where: { id: { in: sortedIds } },
        include: { items: { include: { product: true } } },
      });

      const foundIds = new Set(orders.map((o) => o.id));
      const missingIds = sortedIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new NotFoundError(`Órdenes no encontradas: ${missingIds.join(', ')}`);
      }
      const notReleasable = orders.filter((o) => o.status !== OutboundOrderStatus.CREATED);
      if (notReleasable.length > 0) {
        throw new ConflictError(
          `Órdenes no liberables (deben estar en CREATED): ${notReleasable.map((o) => o.orderNumber).join(', ')}`,
          'ORDER_NOT_RELEASABLE',
        );
      }

      const virtualAllocated = new Map<number, number>();
      const shortfalls: ShortfallDetail[] = [];
      const reservationsByItem = new Map<
        number,
        { reservations: Reservation[]; outboundOrderId: number; productId: number; totalOrdered: number }
      >();

      for (const order of orders) {
        for (const item of order.items) {
          const candidates = await buildCandidates(
            tx,
            { productId: item.productId, requiresExpiration: item.product.requiresExpiration },
            virtualAllocated,
          );
          const { reservations, remaining } = allocateFromCandidates(candidates, item.orderedQuantity);
          for (const r of reservations) {
            virtualAllocated.set(r.inventoryId, (virtualAllocated.get(r.inventoryId) ?? 0) + r.quantity);
          }
          reservationsByItem.set(item.id, {
            reservations,
            outboundOrderId: order.id,
            productId: item.productId,
            totalOrdered: item.orderedQuantity,
          });
          if (remaining > 0) {
            shortfalls.push({
              orderId: order.id,
              orderNumber: order.orderNumber,
              productId: item.productId,
              sku: item.product.sku,
              missingQty: remaining,
            });
          }
        }
      }

      if (shortfalls.length > 0) {
        throw new UnprocessableEntityError('Stock insuficiente para liberar la wave', 'INSUFFICIENT_STOCK', {
          shortfalls,
        });
      }

      const wave = await tx.pickingWave.create({ data: { releasedByUserId } });

      const draftTasks: DraftTask[] = [];
      for (const [itemId, entry] of reservationsByItem) {
        const totalReserved = entry.reservations.reduce((sum, r) => sum + r.quantity, 0);
        for (const r of entry.reservations) {
          await tx.inventory.update({
            where: { id: r.inventoryId },
            data: { allocatedQuantity: { increment: r.quantity } },
          });
          draftTasks.push({
            outboundOrderId: entry.outboundOrderId,
            outboundOrderItemId: itemId,
            productId: entry.productId,
            fromLocationId: r.locationId,
            fromLocationCode: r.locationCode,
            inventoryId: r.inventoryId,
            batchNumber: r.batchNumber,
            expirationDate: r.expirationDate,
            requiredQuantity: r.quantity,
          });
        }
        await tx.outboundOrderItem.update({
          where: { id: itemId },
          data: { allocatedQuantity: { increment: totalReserved } },
        });
      }

      const ordered = sortPickingTasksSRoute(draftTasks);
      const createdTasks = [];
      for (let i = 0; i < ordered.length; i++) {
        const t = ordered[i];
        const created = await tx.pickingTask.create({
          data: {
            outboundOrderId: t.outboundOrderId,
            outboundOrderItemId: t.outboundOrderItemId,
            waveId: wave.id,
            productId: t.productId,
            fromLocationId: t.fromLocationId,
            inventoryId: t.inventoryId,
            batchNumber: t.batchNumber,
            expirationDate: t.expirationDate,
            requiredQuantity: t.requiredQuantity,
            routeSequence: i,
            status: PickingTaskStatus.PENDING,
          },
        });
        createdTasks.push(created);
      }

      for (const order of orders) {
        await tx.outboundOrder.update({
          where: { id: order.id },
          data: { status: OutboundOrderStatus.ALLOCATED, waveId: wave.id, allocatedAt: new Date() },
        });
      }

      return { waveId: wave.id, orderIds: orders.map((o) => o.id), tasks: createdTasks };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  broadcast('wave.released', { waveId: result.waveId, orderIds: result.orderIds });
  return result;
}
