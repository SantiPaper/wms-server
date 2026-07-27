import { OutboundOrderStatus, PickingTaskStatus } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { sendWebhook } from '@/lib/webhook';
import { broadcast } from '@/lib/realtime';
import { NotFoundError } from '@/errors/NotFoundError';
import { ConflictError } from '@/errors/ConflictError';
import { UnprocessableEntityError } from '@/errors/UnprocessableEntityError';
import { OutboundOrderWebhookInput, ShipOrderInput } from '@/modules/outbound/outbound.schemas';

const TERMINAL_TASK_STATUSES: PickingTaskStatus[] = [PickingTaskStatus.COMPLETED, PickingTaskStatus.SHORTAGE];

export async function createOutboundOrderFromErp(input: OutboundOrderWebhookInput) {
  const result = await prisma.$transaction(async (tx) => {
    // Idempotente: un ERP real puede reenviar el mismo external_order_id — un reenvío nunca debe
    // duplicar la orden ni fallar.
    const existing = await tx.outboundOrder.findUnique({
      where: { orderNumber: input.external_order_id },
      include: { items: true },
    });
    if (existing) {
      return { order: existing, created: false };
    }

    const unresolvedLines: { sku?: string; barcode?: string }[] = [];
    const resolvedItems: { productId: number; orderedQuantity: number }[] = [];
    for (const line of input.items) {
      const product = await tx.product.findFirst({
        where: line.barcode ? { barcode: line.barcode } : { sku: line.sku },
      });
      if (!product) {
        unresolvedLines.push({ sku: line.sku, barcode: line.barcode });
        continue;
      }
      resolvedItems.push({ productId: product.id, orderedQuantity: line.quantity });
    }
    if (unresolvedLines.length > 0) {
      throw new UnprocessableEntityError(
        'Hay líneas con productos no reconocidos (sku/barcode inexistente)',
        'UNRESOLVED_PRODUCTS',
        { unresolvedLines },
      );
    }

    const order = await tx.outboundOrder.create({
      data: {
        orderNumber: input.external_order_id,
        customerName: input.customer_name,
        shippingAddress: input.shipping_address,
        priority: input.priority,
        items: { create: resolvedItems },
      },
      include: { items: true },
    });
    return { order, created: true };
  });

  if (result.created) {
    broadcast('outbound.updated', { orderId: result.order.id, reason: 'created' });
  }
  return result;
}

export function listOutboundOrders(query: { status?: OutboundOrderStatus }) {
  return prisma.outboundOrder.findMany({
    where: query.status ? { status: query.status } : { status: { not: OutboundOrderStatus.SHIPPED } },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getOutboundOrderById(id: number) {
  const order = await prisma.outboundOrder.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: { id: true, sku: true, barcode: true, description: true } } } },
      pickingTasks: { include: { fromLocation: true }, orderBy: { routeSequence: 'asc' } },
    },
  });
  if (!order) throw new NotFoundError('Orden outbound no encontrada');
  return order;
}

export function listPickingTasks(orderId: number, status?: PickingTaskStatus) {
  return prisma.pickingTask.findMany({
    where: { outboundOrderId: orderId, ...(status ? { status } : {}) },
    include: { fromLocation: true },
    orderBy: { routeSequence: 'asc' },
  });
}

export async function packOrder(orderId: number) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.outboundOrder.findUnique({
      where: { id: orderId },
      include: { pickingTasks: true },
    });
    if (!existing) throw new NotFoundError('Orden outbound no encontrada');
    if (existing.status !== OutboundOrderStatus.ALLOCATED && existing.status !== OutboundOrderStatus.IN_PICKING) {
      throw new ConflictError('La orden debe estar en ALLOCATED o IN_PICKING para poder embalarse', 'ORDER_NOT_PACKABLE');
    }
    const unresolved = existing.pickingTasks.filter((t) => !TERMINAL_TASK_STATUSES.includes(t.status));
    if (unresolved.length > 0) {
      throw new ConflictError('Todavía hay tareas de picking sin resolver', 'PICKING_NOT_FINISHED');
    }
    return tx.outboundOrder.update({
      where: { id: orderId },
      data: { status: OutboundOrderStatus.PACKED, packedAt: new Date() },
    });
  });

  await sendWebhook('order.status_changed', { orderId: order.id, orderNumber: order.orderNumber, status: 'PACKED' });
  broadcast('outbound.updated', { orderId: order.id, reason: 'packed' });
  return order;
}

export async function shipOrder(orderId: number, input: ShipOrderInput) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.outboundOrder.findUnique({ where: { id: orderId } });
    if (!existing) throw new NotFoundError('Orden outbound no encontrada');
    if (existing.status !== OutboundOrderStatus.PACKED) {
      throw new ConflictError('La orden debe estar en PACKED para poder despacharse', 'ORDER_NOT_SHIPPABLE');
    }
    return tx.outboundOrder.update({
      where: { id: orderId },
      data: { status: OutboundOrderStatus.SHIPPED, shippedAt: new Date(), trackingNumber: input.trackingNumber },
    });
  });

  await sendWebhook('order.status_changed', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: 'SHIPPED',
    trackingNumber: order.trackingNumber,
  });
  broadcast('outbound.updated', { orderId: order.id, reason: 'shipped' });
  return order;
}
