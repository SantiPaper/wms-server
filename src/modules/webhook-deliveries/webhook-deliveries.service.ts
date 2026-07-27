import { WebhookDeliveryStatus } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { retryDelivery } from '@/lib/webhook';
import { NotFoundError } from '@/errors/NotFoundError';
import { ConflictError } from '@/errors/ConflictError';
import { ListWebhookDeliveriesQuery } from '@/modules/webhook-deliveries/webhook-deliveries.schemas';

export async function listWebhookDeliveries(query: ListWebhookDeliveriesQuery) {
  const where = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.webhookDelivery.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getWebhookDeliveryById(id: number) {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id } });
  if (!delivery) throw new NotFoundError('Entrega de webhook no encontrada');
  return delivery;
}

export async function retryWebhookDelivery(id: number) {
  const delivery = await getWebhookDeliveryById(id);
  if (delivery.status !== WebhookDeliveryStatus.FAILED) {
    throw new ConflictError('Solo se puede reintentar una entrega fallida', 'DELIVERY_NOT_FAILED');
  }
  await retryDelivery(id);
  return getWebhookDeliveryById(id);
}
