import { z } from 'zod';
import { InboundOrderStatus, ReceptionEventStatus } from '@prisma/client';

// External ERP contract — field names match the payload the business spec defines (snake_case),
// not our internal camelCase convention. Fields we don't model yet (e.g. unit_price) are ignored.
const inboundOrderItemInputSchema = z
  .object({
    sku: z.string().optional(),
    barcode: z.string().optional(),
    expected_quantity: z.number().int().positive(),
  })
  .refine((item) => item.sku || item.barcode, { message: 'Cada item debe tener sku o barcode' });

export const inboundOrderWebhookSchema = z.object({
  external_id: z.string().min(1),
  supplier_code: z.string().min(1),
  items: z.array(inboundOrderItemInputSchema).min(1),
});

export type InboundOrderWebhookInput = z.infer<typeof inboundOrderWebhookSchema>;

export const listInboundOrdersQuerySchema = z.object({
  status: z.nativeEnum(InboundOrderStatus).optional(),
});

export const scanSchema = z
  .object({
    barcode: z.string().min(1),
    quantityGood: z.number().int().min(0).default(0),
    quantityDamaged: z.number().int().min(0).default(0),
    batchNumber: z.string().optional(),
    expirationDate: z.coerce.date().optional(),
    lpnCode: z.string().optional(),
    damagedLpnCode: z.string().optional(),
    receivingLocationCode: z.string().optional(),
  })
  .refine((data) => data.quantityGood > 0 || data.quantityDamaged > 0, {
    message: 'Debe escanear al menos una unidad buena o dañada',
  });

export type ScanInput = z.infer<typeof scanSchema>;

export const listReceptionEventsQuerySchema = z.object({
  status: z.nativeEnum(ReceptionEventStatus).optional(),
});

export const approveReceptionEventSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().optional(),
});

export type ApproveReceptionEventInput = z.infer<typeof approveReceptionEventSchema>;

export const completeInboundOrderSchema = z.object({
  reason: z.string().optional(),
});

export const orderIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const orderEventParamSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  eventId: z.coerce.number().int().positive(),
});
