import { InventoryStatus, PickingTaskStatus, ReceptionEventStatus } from '@prisma/client';
import { prisma } from '@/lib/prismadb';

export async function getPendingApprovals() {
  const [receptionEvents, shortageTasks] = await Promise.all([
    prisma.receptionEvent.findMany({
      where: { status: ReceptionEventStatus.PENDING_APPROVAL },
      include: {
        inboundOrderItem: {
          include: {
            inboundOrder: { select: { id: true, externalId: true, supplierCode: true } },
            product: { select: { id: true, sku: true, description: true, barcode: true } },
          },
        },
        lpn: { select: { lpnCode: true } },
        location: { select: { locationCode: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.pickingTask.findMany({
      where: { status: PickingTaskStatus.SHORTAGE },
      include: {
        outboundOrder: { select: { id: true, orderNumber: true, status: true } },
        product: { select: { id: true, sku: true, description: true } },
        fromLocation: { select: { locationCode: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    pendingReceptionEvents: { count: receptionEvents.length, items: receptionEvents },
    shortageTasks: { count: shortageTasks.length, items: shortageTasks },
  };
}

export async function getDiscrepancies() {
  const items = await prisma.inventory.findMany({
    where: { status: InventoryStatus.DISCREPANCY },
    include: {
      product: { select: { id: true, sku: true, description: true } },
      location: { select: { id: true, locationCode: true, zoneType: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return { count: items.length, items };
}

export async function getInventorySummary() {
  const [byStatus, byLocation, locations] = await Promise.all([
    prisma.inventory.groupBy({ by: ['status'], _sum: { quantity: true }, _count: { _all: true } }),
    prisma.inventory.groupBy({ by: ['locationId'], _sum: { quantity: true }, _count: { _all: true } }),
    prisma.location.findMany({ select: { id: true, zoneType: true } }),
  ]);

  const zoneOf = new Map(locations.map((l) => [l.id, l.zoneType]));
  const byZone = new Map<string, { count: number; quantity: number }>();
  for (const row of byLocation) {
    const zone = zoneOf.get(row.locationId);
    if (!zone) continue;
    const acc = byZone.get(zone) ?? { count: 0, quantity: 0 };
    acc.count += row._count._all;
    acc.quantity += row._sum.quantity ?? 0;
    byZone.set(zone, acc);
  }

  return {
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all, quantity: r._sum.quantity ?? 0 })),
    byZoneType: [...byZone.entries()].map(([zoneType, v]) => ({ zoneType, ...v })),
  };
}

export async function getThroughput(since?: Date) {
  const effectiveSince = since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [inboundCompleted, outboundShipped] = await Promise.all([
    prisma.inboundOrder.count({ where: { status: 'COMPLETED', completedAt: { gte: effectiveSince } } }),
    prisma.outboundOrder.count({ where: { status: 'SHIPPED', shippedAt: { gte: effectiveSince } } }),
  ]);
  return { since: effectiveSince, inboundCompleted, outboundShipped };
}
