import {
  InboundOrderStatus,
  InventoryStatus,
  Prisma,
  ReceptionEventKind,
  ReceptionEventStatus,
  ZoneType,
} from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { sendWebhook } from '@/lib/webhook';
import { broadcast } from '@/lib/realtime';
import { NotFoundError } from '@/errors/NotFoundError';
import { BadRequestError } from '@/errors/BadRequestError';
import { ConflictError } from '@/errors/ConflictError';
import { UnprocessableEntityError } from '@/errors/UnprocessableEntityError';
import { resolveOrCreateLpn, PrismaTx } from '@/modules/lpns/lpns.service';
import { computeReceptionSplit } from '@/modules/inbound/overreception.service';
import {
  ApproveReceptionEventInput,
  InboundOrderWebhookInput,
  ScanInput,
} from '@/modules/inbound/inbound.schemas';

type ListInboundOrdersQuery = { status?: InboundOrderStatus };

async function upsertInventoryQuantity(
  tx: PrismaTx,
  params: {
    productId: number;
    locationId: number;
    lpnId: number;
    batchNumber: string | null;
    expirationDate: Date | null;
    quantity: number;
    status: InventoryStatus;
  },
) {
  const existing = await tx.inventory.findFirst({
    where: {
      productId: params.productId,
      locationId: params.locationId,
      lpnId: params.lpnId,
      batchNumber: params.batchNumber,
      expirationDate: params.expirationDate,
      status: params.status,
    },
  });
  if (existing) {
    return tx.inventory.update({
      where: { id: existing.id },
      data: { quantity: { increment: params.quantity } },
    });
  }
  return tx.inventory.create({
    data: {
      productId: params.productId,
      locationId: params.locationId,
      lpnId: params.lpnId,
      batchNumber: params.batchNumber,
      expirationDate: params.expirationDate,
      quantity: params.quantity,
      status: params.status,
    },
  });
}

export async function createInboundOrderFromErp(input: InboundOrderWebhookInput) {
  const result = await prisma.$transaction(async (tx) => {
    // Idempotente: un ERP real puede reenviar el mismo external_id (ej. por timeout de su lado
    // sin haber visto la respuesta) — un reenvío nunca debe duplicar la orden ni fallar.
    const existing = await tx.inboundOrder.findUnique({ where: { externalId: input.external_id }, include: { items: true } });
    if (existing) {
      return { order: existing, created: false };
    }

    const unresolvedLines: { sku?: string; barcode?: string }[] = [];
    const resolvedItems: { productId: number; expectedQuantity: number }[] = [];
    for (const line of input.items) {
      const product = await tx.product.findFirst({
        where: line.barcode ? { barcode: line.barcode } : { sku: line.sku },
      });
      if (!product) {
        unresolvedLines.push({ sku: line.sku, barcode: line.barcode });
        continue;
      }
      resolvedItems.push({ productId: product.id, expectedQuantity: line.expected_quantity });
    }
    if (unresolvedLines.length > 0) {
      throw new UnprocessableEntityError(
        'Hay líneas con productos no reconocidos (sku/barcode inexistente)',
        'UNRESOLVED_PRODUCTS',
        { unresolvedLines },
      );
    }

    const order = await tx.inboundOrder.create({
      data: {
        supplierCode: input.supplier_code,
        externalId: input.external_id,
        items: { create: resolvedItems },
      },
      include: { items: true },
    });
    return { order, created: true };
  });

  if (result.created) {
    broadcast('inbound.updated', { orderId: result.order.id, reason: 'created' });
  }
  return result;
}

export function listInboundOrders(query: ListInboundOrdersQuery) {
  return prisma.inboundOrder.findMany({
    where: query.status
      ? { status: query.status }
      : { status: { in: [InboundOrderStatus.EXPECTED, InboundOrderStatus.IN_RECEIVING] } },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInboundOrderById(id: number) {
  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { id: true, sku: true, barcode: true, description: true } },
          receptionEvents: { where: { status: ReceptionEventStatus.PENDING_APPROVAL } },
        },
      },
    },
  });
  if (!order) throw new NotFoundError('Orden inbound no encontrada');
  return order;
}

export function listReceptionEvents(orderId: number, status?: ReceptionEventStatus) {
  return prisma.receptionEvent.findMany({
    where: {
      inboundOrderItem: { inboundOrderId: orderId },
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function maybeAutoComplete(orderId: number) {
  const items = await prisma.inboundOrderItem.findMany({ where: { inboundOrderId: orderId } });
  const allFulfilled = items.length > 0 && items.every((i) => i.receivedQuantity >= i.expectedQuantity);
  if (!allFulfilled) return;

  // Don't auto-complete while an excess is still awaiting a SUPERVISOR/ADMIN decision —
  // the item can look "fulfilled" from receivedQuantity alone even with a pending event.
  const pendingApprovals = await prisma.receptionEvent.count({
    where: { inboundOrderItem: { inboundOrderId: orderId }, status: ReceptionEventStatus.PENDING_APPROVAL },
  });
  if (pendingApprovals > 0) return;

  const order = await prisma.inboundOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status === InboundOrderStatus.COMPLETED) return;
  await completeInboundOrder(orderId);
}

export async function completeInboundOrder(orderId: number) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.inboundOrder.findUnique({ where: { id: orderId } });
    if (!existing) throw new NotFoundError('Orden inbound no encontrada');
    if (existing.status === InboundOrderStatus.COMPLETED) {
      throw new ConflictError('La orden ya está completada');
    }
    return tx.inboundOrder.update({
      where: { id: orderId },
      data: { status: InboundOrderStatus.COMPLETED, completedAt: new Date() },
    });
  });

  await sendWebhook('inbound.completed', { orderId: order.id, externalId: order.externalId });
  broadcast('inbound.updated', { orderId: order.id, reason: 'completed' });
  return order;
}

export async function receiveScan(orderId: number, input: ScanInput, scannedByUserId?: number) {
  const result = await prisma.$transaction(
    async (tx) => {
      const order = await tx.inboundOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundError('Orden inbound no encontrada');
      if (order.status === InboundOrderStatus.COMPLETED) {
        throw new ConflictError('La orden ya fue completada, no admite más escaneos');
      }

      const product = await tx.product.findUnique({ where: { barcode: input.barcode } });
      if (!product) {
        throw new BadRequestError('Producto no reconocido por código de barras', 'PRODUCT_NOT_FOUND');
      }

      const item = await tx.inboundOrderItem.findUnique({
        where: { inboundOrderId_productId: { inboundOrderId: orderId, productId: product.id } },
      });
      if (!item) {
        throw new BadRequestError('El producto no pertenece a esta orden', 'PRODUCT_NOT_IN_ORDER');
      }

      if (product.requiresBatch && !input.batchNumber) {
        throw new BadRequestError('El producto requiere número de lote', 'BATCH_REQUIRED');
      }
      if (product.requiresExpiration && !input.expirationDate) {
        throw new BadRequestError('El producto requiere fecha de vencimiento', 'EXPIRATION_REQUIRED');
      }

      const batchNumber = input.batchNumber ?? null;
      const expirationDate = input.expirationDate ?? null;

      let goodLpn = null;
      let overReception = { triggered: false, excessQuantity: 0, pendingEventId: null as number | null };

      if (input.quantityGood > 0) {
        const receivingLocation = input.receivingLocationCode
          ? await tx.location.findFirst({
              where: { locationCode: input.receivingLocationCode, zoneType: ZoneType.RECEIVING, isBlocked: false },
            })
          : await tx.location.findFirst({
              where: { zoneType: ZoneType.RECEIVING, isBlocked: false },
              orderBy: { locationCode: 'asc' },
            });
        if (!receivingLocation) {
          throw new UnprocessableEntityError('No hay ubicación de recepción disponible', 'NO_RECEIVING_LOCATION');
        }

        goodLpn = await resolveOrCreateLpn(tx, receivingLocation.id, input.lpnCode);

        const { committedQty, excessQty } = computeReceptionSplit(
          item.expectedQuantity,
          item.receivedQuantity,
          input.quantityGood,
        );

        if (committedQty > 0) {
          await upsertInventoryQuantity(tx, {
            productId: product.id,
            locationId: receivingLocation.id,
            lpnId: goodLpn.id,
            batchNumber,
            expirationDate,
            quantity: committedQty,
            status: InventoryStatus.AVAILABLE,
          });
          await tx.inboundOrderItem.update({
            where: { id: item.id },
            data: { receivedQuantity: { increment: committedQty } },
          });
          await tx.receptionEvent.create({
            data: {
              inboundOrderItemId: item.id,
              lpnId: goodLpn.id,
              locationId: receivingLocation.id,
              quantity: committedQty,
              kind: ReceptionEventKind.GOOD,
              batchNumber,
              expirationDate,
              status: ReceptionEventStatus.COMMITTED,
              scannedByUserId,
            },
          });
        }

        if (excessQty > 0) {
          const pendingEvent = await tx.receptionEvent.create({
            data: {
              inboundOrderItemId: item.id,
              lpnId: goodLpn.id,
              locationId: receivingLocation.id,
              quantity: excessQty,
              kind: ReceptionEventKind.EXCESS,
              batchNumber,
              expirationDate,
              status: ReceptionEventStatus.PENDING_APPROVAL,
              scannedByUserId,
            },
          });
          overReception = { triggered: true, excessQuantity: excessQty, pendingEventId: pendingEvent.id };
        }
      }

      let damagedLpn = null;
      if (input.quantityDamaged > 0) {
        const quarantineLocation = await tx.location.findFirst({
          where: { zoneType: ZoneType.QUARANTINE, isBlocked: false },
          orderBy: { locationCode: 'asc' },
        });
        if (!quarantineLocation) {
          throw new UnprocessableEntityError('No hay ubicación de cuarentena disponible', 'NO_QUARANTINE_LOCATION');
        }

        damagedLpn = await resolveOrCreateLpn(tx, quarantineLocation.id, input.damagedLpnCode);
        await upsertInventoryQuantity(tx, {
          productId: product.id,
          locationId: quarantineLocation.id,
          lpnId: damagedLpn.id,
          batchNumber,
          expirationDate,
          quantity: input.quantityDamaged,
          status: InventoryStatus.DAMAGED,
        });
        await tx.inboundOrderItem.update({
          where: { id: item.id },
          data: { damagedQuantity: { increment: input.quantityDamaged } },
        });
        await tx.receptionEvent.create({
          data: {
            inboundOrderItemId: item.id,
            lpnId: damagedLpn.id,
            locationId: quarantineLocation.id,
            quantity: input.quantityDamaged,
            kind: ReceptionEventKind.DAMAGED,
            batchNumber,
            expirationDate,
            status: ReceptionEventStatus.COMMITTED,
            scannedByUserId,
          },
        });
      }

      if (order.status === InboundOrderStatus.EXPECTED) {
        await tx.inboundOrder.update({ where: { id: order.id }, data: { status: InboundOrderStatus.IN_RECEIVING } });
      }

      const updatedItem = await tx.inboundOrderItem.findUniqueOrThrow({ where: { id: item.id } });

      return { item: updatedItem, product, goodLpn, damagedLpn, overReception };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await maybeAutoComplete(orderId);

  const refreshedOrder = await prisma.inboundOrder.findUniqueOrThrow({ where: { id: orderId } });
  broadcast('inbound.updated', { orderId, reason: 'scan' });
  return { ...result, orderStatus: refreshedOrder.status };
}

export async function approveReceptionEvent(
  orderId: number,
  eventId: number,
  input: ApproveReceptionEventInput,
  approverId: number,
) {
  const { event: updatedEvent, productId } = await prisma.$transaction(async (tx) => {
    const event = await tx.receptionEvent.findUnique({
      where: { id: eventId },
      include: { inboundOrderItem: true },
    });
    if (!event || event.inboundOrderItem.inboundOrderId !== orderId) {
      throw new NotFoundError('Evento de recepción no encontrado');
    }
    if (event.status !== ReceptionEventStatus.PENDING_APPROVAL) {
      throw new ConflictError('El evento ya fue resuelto');
    }

    if (input.decision === 'REJECT') {
      const rejected = await tx.receptionEvent.update({
        where: { id: event.id },
        data: {
          status: ReceptionEventStatus.REJECTED,
          approvedByUserId: approverId,
          approvedAt: new Date(),
          notes: input.notes,
        },
      });
      return { event: rejected, productId: event.inboundOrderItem.productId };
    }

    await upsertInventoryQuantity(tx, {
      productId: event.inboundOrderItem.productId,
      locationId: event.locationId,
      lpnId: event.lpnId,
      batchNumber: event.batchNumber,
      expirationDate: event.expirationDate,
      quantity: event.quantity,
      status: InventoryStatus.AVAILABLE,
    });
    await tx.inboundOrderItem.update({
      where: { id: event.inboundOrderItemId },
      data: { receivedQuantity: { increment: event.quantity } },
    });
    const approved = await tx.receptionEvent.update({
      where: { id: event.id },
      data: {
        status: ReceptionEventStatus.APPROVED,
        approvedByUserId: approverId,
        approvedAt: new Date(),
        notes: input.notes,
      },
    });
    return { event: approved, productId: event.inboundOrderItem.productId };
  });

  await maybeAutoComplete(orderId);

  if (updatedEvent.status === ReceptionEventStatus.APPROVED) {
    await sendWebhook('inventory.stock_adjusted', {
      orderId,
      eventId: updatedEvent.id,
      productId,
      locationId: updatedEvent.locationId,
      quantity: updatedEvent.quantity,
      kind: updatedEvent.kind,
      approvedByUserId: updatedEvent.approvedByUserId,
    });
  }

  broadcast('inbound.updated', { orderId, reason: 'approval' });
  return updatedEvent;
}
