import { z } from 'zod';
import { RotationClass } from '@prisma/client';

export const createProductSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().min(1),
  description: z.string().min(1),
  unitOfMeasure: z.string().min(1).optional(),
  requiresBatch: z.boolean().optional(),
  requiresExpiration: z.boolean().optional(),
  rotationClass: z.nativeEnum(RotationClass).optional(),
  weightKg: z.number().positive().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const listProductsQuerySchema = z.object({
  sku: z.string().optional(),
  barcode: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const addProductStockSchema = z.object({
  locationId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  batchNumber: z.string().optional(),
  expirationDate: z.coerce.date().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type AddProductStockInput = z.infer<typeof addProductStockSchema>;
