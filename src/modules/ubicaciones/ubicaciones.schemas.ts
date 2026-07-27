import { z } from 'zod';
import { ZoneType } from '@prisma/client';

export const createLocationSchema = z.object({
  locationCode: z.string().min(1),
  zoneType: z.nativeEnum(ZoneType),
  maxWeightKg: z.number().positive().optional(),
});

export const updateLocationSchema = z.object({
  isBlocked: z.boolean().optional(),
  maxWeightKg: z.number().positive().optional(),
});

export const listLocationsQuerySchema = z.object({
  zoneType: z.nativeEnum(ZoneType).optional(),
  // z.coerce.boolean() usa Boolean(str), que da true para cualquier string no vacío — incluido
  // "false" — así que ?isBlocked=false nunca filtraba nada. Hay que comparar el texto a mano.
  isBlocked: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;
