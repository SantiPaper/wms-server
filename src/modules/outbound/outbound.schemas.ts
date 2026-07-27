import { z } from 'zod';
import { OutboundOrderPriority, OutboundOrderStatus, PickingTaskStatus } from '@prisma/client';

// External ERP contract — field names match the payload the business spec defines (snake_case),
// not our internal camelCase convention. Accepts sku or barcode per line, same flexibility as inbound.
const outboundOrderItemInputSchema = z
  .object({
    sku: z.string().optional(),
    barcode: z.string().optional(),
    quantity: z.number().int().positive(),
  })
  .refine((item) => item.sku || item.barcode, { message: 'Cada item debe tener sku o barcode' });

export const outboundOrderWebhookSchema = z.object({
  external_order_id: z.string().min(1),
  customer_name: z.string().optional(),
  shipping_address: z.string().optional(),
  priority: z.nativeEnum(OutboundOrderPriority).optional(),
  items: z.array(outboundOrderItemInputSchema).min(1),
});

export type OutboundOrderWebhookInput = z.infer<typeof outboundOrderWebhookSchema>;

export const listOutboundOrdersQuerySchema = z.object({
  status: z.nativeEnum(OutboundOrderStatus).optional(),
});

export const releaseWaveSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1),
});

export type ReleaseWaveInput = z.infer<typeof releaseWaveSchema>;

export const shipOrderSchema = z.object({
  trackingNumber: z.string().optional(),
});

export type ShipOrderInput = z.infer<typeof shipOrderSchema>;

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const orderTasksParamSchema = z.object({
  orderId: z.coerce.number().int().positive(),
});

export const taskParamSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  taskId: z.coerce.number().int().positive(),
});

export const listPickingTasksQuerySchema = z.object({
  status: z.nativeEnum(PickingTaskStatus).optional(),
});

export const scanTaskSchema = z.object({
  locationCode: z.string().min(1),
  barcode: z.string().min(1),
  quantity: z.number().int().positive().optional(),
});

export type ScanTaskInput = z.infer<typeof scanTaskSchema>;

export const reportShortageSchema = z.object({
  locationCode: z.string().min(1),
  quantityFound: z.number().int().min(0),
  notes: z.string().optional(),
});

export type ReportShortageInput = z.infer<typeof reportShortageSchema>;
