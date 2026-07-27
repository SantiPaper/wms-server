import { OutboundOrderStatus, PickingTaskStatus, InventoryStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { sendWebhook } from '@/lib/webhook';
import { broadcast } from '@/lib/realtime';
import { NotFoundError } from '@/errors/NotFoundError';
import { BadRequestError } from '@/errors/BadRequestError';
import { ConflictError } from '@/errors/ConflictError';
import { PrismaTx } from '@/modules/lpns/lpns.service';
import { buildCandidates, allocateFromCandidates } from '@/modules/outbound/allocation.service';
import { ReportShortageInput, ScanTaskInput } from '@/modules/outbound/outbound.schemas';

const OPEN_STATUSES: PickingTaskStatus[] = [PickingTaskStatus.PENDING, PickingTaskStatus.IN_PROGRESS];

const TASK_DETAIL_INCLUDE = {
  product: true,
  fromLocation: true,
  outboundOrder: true,
} satisfies Prisma.PickingTaskInclude;

/**
 * Cola de picking para la PWA de colectoras. Si el operario ya tiene una tarea propia sin
 * terminar la devuelve tal cual (idempotente — cubre refresh/reinicio a mitad de tarea).
 * Si no, reclama atómicamente la más antigua disponible con SKIP LOCKED: es el patrón estándar
 * para colas de trabajo compartidas en Postgres y evita que dos operarios pidiendo al mismo
 * tiempo se lleven la misma tarea, sin necesitar una transacción serializable con reintentos.
 * Simplificación consciente: el orden es global por wave/routeSequence, no "pegajoso" por
 * operario a una wave — con varios operarios claiming en paralelo sobre la misma wave puede haber
 * algo de intercalado entre ellos; agrupar rangos contiguos por operario es una optimización que
 * queda fuera de alcance por ahora.
 */
export async function claimNextTask(userId: number) {
  const existing = await prisma.pickingTask.findFirst({
    where: { assignedUserId: userId, status: { in: OPEN_STATUSES } },
    include: TASK_DETAIL_INCLUDE,
  });
  if (existing) return existing;

  const claimed = await prisma.$queryRaw<{ id: number }[]>`
    UPDATE picking_tasks
    SET "assignedUserId" = ${userId}, status = 'IN_PROGRESS'
    WHERE id = (
      SELECT pt.id
      FROM picking_tasks pt
      JOIN picking_waves pw ON pw.id = pt."waveId"
      WHERE pt.status = 'PENDING' AND pt."assignedUserId" IS NULL
      ORDER BY pw."createdAt" ASC, pt."routeSequence" ASC
      LIMIT 1
      FOR UPDATE OF pt SKIP LOCKED
    )
    RETURNING id
  `;
  if (claimed.length === 0) return null;

  return prisma.pickingTask.findUnique({ where: { id: claimed[0].id }, include: TASK_DETAIL_INCLUDE });
}

async function loadOpenTask(tx: PrismaTx, orderId: number, taskId: number) {
  const task = await tx.pickingTask.findUnique({
    where: { id: taskId },
    include: { product: true, fromLocation: true },
  });
  if (!task || task.outboundOrderId !== orderId) {
    throw new NotFoundError('Tarea de picking no encontrada');
  }
  if (!OPEN_STATUSES.includes(task.status)) {
    throw new ConflictError('La tarea ya fue resuelta', 'TASK_ALREADY_RESOLVED');
  }
  return task;
}

async function applyPick(tx: PrismaTx, task: { id: number; inventoryId: number; requiredQuantity: number; pickedQuantity: number; outboundOrderItemId: number }, qty: number) {
  await tx.inventory.update({
    where: { id: task.inventoryId },
    data: { quantity: { decrement: qty }, allocatedQuantity: { decrement: qty } },
  });
  const newPicked = task.pickedQuantity + qty;
  const newStatus = newPicked >= task.requiredQuantity ? PickingTaskStatus.COMPLETED : PickingTaskStatus.IN_PROGRESS;
  const updatedTask = await tx.pickingTask.update({
    where: { id: task.id },
    data: {
      pickedQuantity: { increment: qty },
      status: newStatus,
      completedAt: newStatus === PickingTaskStatus.COMPLETED ? new Date() : null,
    },
  });
  await tx.outboundOrderItem.update({
    where: { id: task.outboundOrderItemId },
    data: { pickedQuantity: { increment: qty } },
  });
  return updatedTask;
}

async function startPickingIfNeeded(tx: PrismaTx, outboundOrderId: number) {
  const order = await tx.outboundOrder.findUniqueOrThrow({ where: { id: outboundOrderId } });
  if (order.status === OutboundOrderStatus.ALLOCATED) {
    await tx.outboundOrder.update({
      where: { id: outboundOrderId },
      data: { status: OutboundOrderStatus.IN_PICKING },
    });
  }
}

export async function scanTask(orderId: number, taskId: number, input: ScanTaskInput) {
  const updatedTask = await prisma.$transaction(
    async (tx) => {
      const task = await loadOpenTask(tx, orderId, taskId);

      if (input.locationCode !== task.fromLocation.locationCode) {
        throw new BadRequestError('La ubicación escaneada no coincide con la tarea', 'WRONG_LOCATION_SCANNED');
      }
      if (input.barcode !== task.product.barcode) {
        throw new BadRequestError('El código de barras escaneado no coincide con el producto', 'WRONG_PRODUCT_SCANNED');
      }

      const remaining = task.requiredQuantity - task.pickedQuantity;
      const qty = input.quantity ?? remaining;
      if (qty <= 0 || qty > remaining) {
        throw new BadRequestError('La cantidad excede lo pendiente de esta tarea', 'QUANTITY_EXCEEDS_REMAINING');
      }

      const updated = await applyPick(tx, task, qty);
      await startPickingIfNeeded(tx, orderId);
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  broadcast('outbound.updated', { orderId, reason: 'scan' });
  return updatedTask;
}

export async function reportShortage(orderId: number, taskId: number, input: ReportShortageInput) {
  const result = await prisma.$transaction(
    async (tx) => {
      const task = await loadOpenTask(tx, orderId, taskId);

      if (input.locationCode !== task.fromLocation.locationCode) {
        throw new BadRequestError('La ubicación escaneada no coincide con la tarea', 'WRONG_LOCATION_SCANNED');
      }

      const remaining = task.requiredQuantity - task.pickedQuantity;
      if (input.quantityFound < 0 || input.quantityFound >= remaining) {
        throw new BadRequestError(
          'La cantidad encontrada no representa un faltante para esta tarea',
          'NOT_A_SHORTAGE',
        );
      }

      if (input.quantityFound > 0) {
        await applyPick(tx, task, input.quantityFound);
      }

      const missingQty = remaining - input.quantityFound;

      await tx.inventory.update({
        where: { id: task.inventoryId },
        data: { status: InventoryStatus.DISCREPANCY, allocatedQuantity: { decrement: missingQty } },
      });
      await tx.pickingTask.update({
        where: { id: task.id },
        data: { status: PickingTaskStatus.SHORTAGE, completedAt: new Date() },
      });

      const virtualAllocated = new Map<number, number>();
      const candidates = await buildCandidates(
        tx,
        {
          productId: task.productId,
          requiresExpiration: task.product.requiresExpiration,
          batchNumber: task.batchNumber,
          excludeLocationId: task.fromLocationId,
        },
        virtualAllocated,
      );
      const { reservations, remaining: residual } = allocateFromCandidates(candidates, missingQty);

      const rerouteTasks = [];
      for (const r of reservations) {
        await tx.inventory.update({
          where: { id: r.inventoryId },
          data: { allocatedQuantity: { increment: r.quantity } },
        });
        const rerouteTask = await tx.pickingTask.create({
          data: {
            outboundOrderId: task.outboundOrderId,
            outboundOrderItemId: task.outboundOrderItemId,
            waveId: task.waveId,
            productId: task.productId,
            fromLocationId: r.locationId,
            inventoryId: r.inventoryId,
            batchNumber: r.batchNumber,
            expirationDate: r.expirationDate,
            requiredQuantity: r.quantity,
            routeSequence: task.routeSequence,
            status: PickingTaskStatus.PENDING,
            rerouteOfTaskId: task.id,
          },
        });
        rerouteTasks.push(rerouteTask);
      }

      if (residual > 0) {
        await tx.outboundOrderItem.update({
          where: { id: task.outboundOrderItemId },
          data: { allocatedQuantity: { decrement: residual }, shortedQuantity: { increment: residual } },
        });
      }

      await startPickingIfNeeded(tx, orderId);

      const reroutedQty = missingQty - residual;
      return { task, rerouteTasks, missingQty, reroutedQty, residual, notes: input.notes };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await sendWebhook('picking.shortage_reported', {
    orderId,
    taskId,
    locationId: result.task.fromLocationId,
    productId: result.task.productId,
    missingQty: result.missingQty,
    reroutedQty: result.reroutedQty,
    residual: result.residual,
    notes: result.notes,
    requiresCycleCount: true,
  });

  broadcast('outbound.updated', { orderId, reason: 'shortage' });
  return result;
}
