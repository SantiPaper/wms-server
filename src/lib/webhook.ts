import { Prisma, WebhookDeliveryStatus } from '@prisma/client';
import { prisma } from '@/lib/prismadb';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// Mutable (no readonly) a propósito: los tests de reintento la achican para no esperar minutos reales.
export const BACKOFF_MS = [2000, 10000, 30000];

/**
 * Sends an outbound event to the ERP. Always persists a WebhookDelivery row first (visible in
 * wms-client's panel de integraciones). Without ERP_WEBHOOK_URL configured — no ERP real todavía,
 * ver README — se queda en modo stub: logea y marca SENT de inmediato, igual que antes. Con una
 * URL configurada, entrega por HTTP real con timeout + reintentos/backoff, sin bloquear al
 * caller — el `await` acá solo espera que se cree el registro, no el round-trip de red, para que
 * una caída del ERP nunca vuelva lenta una respuesta real a un operario/supervisor.
 */
export async function sendWebhook(event: string, payload: unknown): Promise<void> {
  const delivery = await prisma.webhookDelivery.create({
    data: { event, payload: payload as Prisma.InputJsonValue, status: WebhookDeliveryStatus.PENDING },
  });
  await deliverOrStub(delivery.id, event, payload, 1);
}

/** Resetea una entrega y la vuelve a intentar desde cero — el caller valida que esté FAILED. */
export async function retryDelivery(id: number): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id } });
  await prisma.webhookDelivery.update({
    where: { id },
    data: { status: WebhookDeliveryStatus.PENDING, lastError: null },
  });
  await deliverOrStub(id, delivery.event, delivery.payload, 1);
}

// Sin ERP_WEBHOOK_URL configurada (no hay ERP real todavía, ver README): se queda en modo stub —
// logea y marca SENT de inmediato, igual que antes de que existiera este archivo, sin agendar
// ningún reintento real. Con una URL configurada, dispara la entrega real (fire-and-forget).
async function deliverOrStub(id: number, event: string, payload: unknown, attempt: number): Promise<void> {
  if (!env.ERP_WEBHOOK_URL) {
    logger.info(`webhook:${event}`, payload);
    await prisma.webhookDelivery.update({
      where: { id },
      data: { status: WebhookDeliveryStatus.SENT, attempts: attempt, sentAt: new Date(), lastError: null },
    });
    return;
  }
  void attemptDelivery(id, event, payload, attempt);
}

/** Retoma cualquier entrega que haya quedado PENDING si el proceso murió a mitad de un reintento. */
export async function resumePendingDeliveries(): Promise<void> {
  if (!env.ERP_WEBHOOK_URL) return;
  const pending = await prisma.webhookDelivery.findMany({ where: { status: WebhookDeliveryStatus.PENDING } });
  for (const delivery of pending) {
    void attemptDelivery(delivery.id, delivery.event, delivery.payload, delivery.attempts + 1);
  }
}

async function attemptDelivery(id: number, event: string, payload: unknown, attempt: number): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.ERP_WEBHOOK_TIMEOUT_MS);
    try {
      const res = await fetch(env.ERP_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, payload }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`ERP respondió ${res.status}`);
    } finally {
      clearTimeout(timeout);
    }
    await prisma.webhookDelivery.update({
      where: { id },
      data: { status: WebhookDeliveryStatus.SENT, attempts: attempt, sentAt: new Date(), lastError: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (attempt >= env.ERP_WEBHOOK_MAX_RETRIES) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: { status: WebhookDeliveryStatus.FAILED, attempts: attempt, lastError: message },
      });
      logger.error(`webhook delivery ${id} (${event}) agotó los reintentos`, { message });
      return;
    }
    await prisma.webhookDelivery.update({ where: { id }, data: { attempts: attempt, lastError: message } });
    const delay = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
    setTimeout(() => void attemptDelivery(id, event, payload, attempt + 1), delay);
  }
}
