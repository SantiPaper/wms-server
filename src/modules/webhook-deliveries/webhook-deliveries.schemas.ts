import { z } from 'zod';
import { WebhookDeliveryStatus } from '@prisma/client';

export const listWebhookDeliveriesQuerySchema = z.object({
  status: z.nativeEnum(WebhookDeliveryStatus).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListWebhookDeliveriesQuery = z.infer<typeof listWebhookDeliveriesQuerySchema>;
