import { z } from 'zod';
import { InventoryStatus } from '@prisma/client';

export const listInventoryQuerySchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  locationId: z.coerce.number().int().positive().optional(),
  status: z.nativeEnum(InventoryStatus).optional(),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
